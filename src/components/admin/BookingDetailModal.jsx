
import React, { useState, useEffect } from "react";
import { Booking } from "@/entities/all";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { X, Calendar, Clock, MapPin, Users, Phone, Mail, MessageSquare, CreditCard, DollarSign, Loader2, Flag, Crown, Repeat } from "lucide-react";
import { format } from "date-fns";

// Day-of-week (0=Sun..6=Sat) for a 'yyyy-MM-dd' string, parsed in local time so
// there's no UTC date shift.
const weekdayOf = (ymd) => {
  const [y, m, d] = String(ymd || "").split("-").map(Number);
  if (!y || !m || !d) return -1;
  return new Date(y, m - 1, d).getDay();
};

// Whole days between two 'yyyy-MM-dd' strings.
const dayDiff = (a, b) => {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((new Date(by, bm - 1, bd) - new Date(ay, am - 1, ad)) / 86400000);
};

import CheckInSystem from "./CheckInSystem";
import { Textarea } from "@/components/ui/textarea";
import { useLocationHours, closeTimeForDate } from "@/config/hours";
import { getBayDisplayName } from "@/lib/bayNames";
import { RESERVATION_TYPE_OPTIONS, classifyBooking } from "@/lib/bookingCategories";

const formatTime = (time24) => {
  if (!time24 || typeof time24 !== "string" || !time24.includes(":")) return "";
  const [h, m] = time24.split(":");
  const hours = Number(h);
  const minutes = Number(m);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return "";
  const period = hours >= 12 ? "PM" : "AM";
  const hours12 = hours % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${period}`;
};


const toMinutes = (t) => {
  if (!t) return 0;
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + (m || 0);
};

const isVIPBay = (bay) => bay?.bay_type === "vip" || /vip/i.test(bay?.name || "");

// Given a start time ("HH:MM") and a duration in hours, compute the end time.
const addDuration = (startTime, durationHours) => {
  const [h, m] = String(startTime).split(":").map(Number);
  const total = h * 60 + (m || 0) + Math.round((durationHours || 0) * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

const bayRank = (bay) => {
  const match = (bay?.name || "").match(/\d+/);
  return { vip: isVIPBay(bay) ? 1 : 0, num: match ? parseInt(match[0], 10) : 9999 };
};

export default function BookingDetailModal({ booking, onClose, simulators = [], existingBookings = [] }) {
  const [paymentStatus, setPaymentStatus] = useState(booking.payment_status || "pending");
  const [staffNotes, setStaffNotes] = useState(booking.staff_notes || "");
  const [newBayId, setNewBayId] = useState(booking.simulator_id || "");
  const [isUpdating, setIsUpdating] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isCharging, setIsCharging] = useState(false);
  const [startTime, setStartTime] = useState(booking.start_time || "");
  const [durationHours, setDurationHours] = useState(Number(booking.duration_hours) || 1);
  const [isSavingTime, setIsSavingTime] = useState(false);
  // The current color/category of this reservation (public / member / special /
  // banked). classifyBooking uses reservation_type for regular bookings, so an
  // admin can correct a mis-tagged row (e.g. a non-member wrongly shown purple).
  const [reservationType, setReservationType] = useState(booking.reservation_type || "public");
  const [isSavingType, setIsSavingType] = useState(false);

  // When the reservation was paid with banked hours (green on the tee sheet),
  // staff want to see how many hours that customer has left. We look up their
  // ledger balance (admin-only adminHourBalance fn) and show the combined pool
  // (peak / off-peak buckets) — hours redeem at either club.
  const category = classifyBooking(booking);
  const isBanked = category === "banked";
  // A regular booking whose customer is on the membership roster (email match,
  // tagged by the dashboards). Origin member_bookings rows open the usage popup
  // instead, so here this only ever flags a public-flow booking by a member.
  const isMemberCustomer = category === "member";
  const [bankedBalance, setBankedBalance] = useState(null);
  const [bankedLoading, setBankedLoading] = useState(false);
  const [bankedError, setBankedError] = useState("");
  // Bumped after a successful adjustment to re-pull the balance.
  const [balanceRefresh, setBalanceRefresh] = useState(0);

  // Adjust-hours controls (add/remove this customer's banked hours right here,
  // so staff don't have to go find them in the Hours admin).
  const [adjKind, setAdjKind] = useState("off_peak");
  const [adjHours, setAdjHours] = useState("");
  const [adjNote, setAdjNote] = useState("");
  const [adjSignature, setAdjSignature] = useState("");
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [adjError, setAdjError] = useState("");
  const [adjDone, setAdjDone] = useState("");

  // Recurring-series detection. Recurring reservations are stored as separate,
  // unlinked rows, so we group them on the fly: same customer email, bay, start
  // time, weekday and location. `applyScope` lets staff push an edit to just
  // this reservation or to this one and every future occurrence in the series.
  const [series, setSeries] = useState([]); // non-cancelled siblings incl. this one
  const [applyScope, setApplyScope] = useState("single"); // 'single' | 'future'

  useEffect(() => {
    if (!isBanked || !booking.customer_email) return;
    let cancelled = false;
    setBankedLoading(true);
    setBankedError("");
    (async () => {
      try {
        const result = await base44.functions.invoke("adminHourBalance", {
          action: "lookup",
          email: booking.customer_email
        });
        if (cancelled) return;
        const d = result?.data;
        if (d?.success) {
          setBankedBalance(d.total || { peak: 0, off_peak: 0 });
        } else {
          setBankedError(d?.error || "Could not load hour balance.");
        }
      } catch (err) {
        if (!cancelled) setBankedError("Could not load hour balance.");
      } finally {
        if (!cancelled) setBankedLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isBanked, booking.customer_email, booking.location, balanceRefresh]);

  const handleAdjustHours = async () => {
    setAdjError("");
    setAdjDone("");
    const hours = Number(adjHours);
    if (!hours) {
      setAdjError("Enter a non-zero number of hours (use a negative number to remove).");
      return;
    }
    if (!adjSignature.trim()) {
      setAdjError("An employee signature is required to add or remove hours.");
      return;
    }
    setIsAdjusting(true);
    try {
      const res = await base44.functions.invoke("adminHourBalance", {
        action: "adjust",
        email: booking.customer_email,
        kind: adjKind,
        hours,
        location: booking.location,
        note: adjNote,
        signature: adjSignature.trim()
      });
      const d = res?.data || {};
      if (d.success) {
        if (d.total) setBankedBalance(d.total);
        setAdjHours("");
        setAdjNote("");
        setAdjSignature("");
        setAdjDone(
          `${hours > 0 ? "Added" : "Removed"} ${Math.abs(hours)} ${adjKind === "peak" ? "peak" : "off-peak"} hour${Math.abs(hours) === 1 ? "" : "s"}.`
        );
        setBalanceRefresh((n) => n + 1);
      } else {
        setAdjError(d.error || "Adjustment failed.");
      }
    } catch (err) {
      setAdjError("Adjustment failed. Please try again.");
    }
    setIsAdjusting(false);
  };

  useEffect(() => {
    // Member_bookings rows (origin members) aren't editable here, and we need a
    // customer + bay + time to group a series.
    if (booking.booking_type === "member" || booking.is_member) return;
    if (!booking.customer_email || !booking.simulator_id || !booking.start_time) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await Booking.filter({
          customer_email: booking.customer_email,
          simulator_id: booking.simulator_id,
          start_time: booking.start_time
        });
        if (cancelled) return;
        const dow = weekdayOf(booking.booking_date);
        const sibs = (rows || []).filter(
          (r) =>
            r.status !== "cancelled" &&
            r.location === booking.location &&
            weekdayOf(r.booking_date) === dow
        );
        setSeries(sibs);
      } catch {
        if (!cancelled) setSeries([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [booking.id, booking.customer_email, booking.simulator_id, booking.start_time, booking.booking_date, booking.location]);

  // Derived series facts. futureSiblings always includes this reservation.
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const futureSiblings = series
    .filter((r) => r.booking_date >= booking.booking_date)
    .sort((a, b) => a.booking_date.localeCompare(b.booking_date));
  const upcomingCount = futureSiblings.filter((r) => r.booking_date >= todayStr).length;
  const isRecurring = series.length >= 2;
  const seriesWeekday = booking.booking_date
    ? format(new Date(`${booking.booking_date}T00:00:00`), "EEEE")
    : "";
  const seriesFrequency = (() => {
    const dates = [...new Set(series.map((r) => r.booking_date))].sort();
    let gap = null;
    for (let i = 1; i < dates.length; i++) {
      const g = dayDiff(dates[i - 1], dates[i]);
      if (gap == null || g < gap) gap = g;
    }
    if (gap == null) return "Recurring";
    if (gap <= 7) return "Weekly";
    if (gap <= 14) return "Every 2 weeks";
    return "Recurring";
  })();

  // Apply a field patch to this reservation + every future occurrence. The
  // bookings no-overlap constraint rejects any occurrence whose new time/bay
  // would collide; we skip those and report the dates.
  const applyToFutureSeries = async (patchFn) => {
    let ok = 0;
    const failed = [];
    for (const r of futureSiblings) {
      try {
        await Booking.update(r.id, patchFn(r));
        ok += 1;
      } catch (e) {
        failed.push(r.booking_date);
      }
    }
    return { ok, failed };
  };

  const seriesResultMsg = (verb, { ok, failed }) => {
    let msg = `${verb} ${ok} reservation${ok === 1 ? "" : "s"} in the series.`;
    if (failed.length) {
      msg += `\n\nSkipped ${failed.length} due to a conflict on that date:\n${failed
        .map((d) => format(new Date(`${d}T00:00:00`), "EEE, MMM d"))
        .join(", ")}`;
    }
    return msg;
  };

  const useFutureScope = isRecurring && applyScope === "future";

  // Operating hours for this booking's location, used to bound the editable
  // start-time / duration options and to validate the new window.
  const bookingHours = useLocationHours(booking.location);
  const openMin = toMinutes(bookingHours.open);
  const closeMin = toMinutes(closeTimeForDate(booking.booking_date, bookingHours));

  // 30-minute start-time options across operating hours (+ the current start,
  // in case it sits off the grid).
  const startOptions = [];
  for (let m = openMin; m + 30 <= closeMin; m += 30) {
    startOptions.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  if (booking.start_time && !startOptions.includes(booking.start_time)) {
    startOptions.unshift(booking.start_time);
  }

  const durationOptions = [];
  for (let d = 0.5; d <= 6.0001; d += 0.5) durationOptions.push(Number(d.toFixed(1)));
  if (booking.duration_hours && !durationOptions.includes(Number(booking.duration_hours))) {
    durationOptions.push(Number(booking.duration_hours));
    durationOptions.sort((a, b) => a - b);
  }

  const proposedEnd = addDuration(startTime, durationHours);
  const timeChanged =
    startTime !== booking.start_time || Number(durationHours) !== Number(booking.duration_hours);

  const handleUpdateTime = async () => {
    const newStartMin = toMinutes(startTime);
    const newEndMin = toMinutes(proposedEnd);
    if (newStartMin < openMin || newEndMin > closeMin) {
      alert("That time is outside this location's operating hours.");
      return;
    }
    const priceNote =
      Number(durationHours) !== Number(booking.duration_hours)
        ? " Note: the price shown was not recalculated — adjust it under Payment if needed."
        : "";
    setIsSavingTime(true);
    try {
      if (useFutureScope) {
        const res = await applyToFutureSeries(() => ({
          start_time: startTime,
          end_time: proposedEnd,
          duration_hours: durationHours
        }));
        alert(seriesResultMsg("Updated the time on", res) + priceNote);
        onClose();
        return;
      }
      const conflict = (existingBookings || []).some((b) => {
        if (b.id === booking.id) return false;
        if (b.simulator_id !== booking.simulator_id) return false;
        if (b.booking_date !== booking.booking_date) return false;
        if (b.status === "cancelled") return false;
        return newStartMin < toMinutes(b.end_time) && newEndMin > toMinutes(b.start_time);
      });
      if (conflict) {
        alert("That time overlaps another reservation on this bay. Choose a different time or duration.");
        setIsSavingTime(false);
        return;
      }
      await Booking.update(booking.id, {
        start_time: startTime,
        end_time: proposedEnd,
        duration_hours: durationHours
      });
      alert("Reservation time updated." + priceNote);
      onClose();
    } catch (error) {
      console.error("Error updating reservation time:", error);
      alert("Error updating the reservation time. Please try again.");
    }
    setIsSavingTime(false);
  };

  const handleUpdateReservationType = async () => {
    setIsSavingType(true);
    try {
      await Booking.update(booking.id, { reservation_type: reservationType });
      alert("Reservation type updated. The tee-sheet color will reflect this change.");
      onClose();
    } catch (error) {
      console.error("Error updating reservation type:", error);
      alert("Error updating the reservation type. Please try again.");
    }
    setIsSavingType(false);
  };

  // A capturable hold exists when the booking has a Stripe payment id and hasn't
  // already been charged or refunded.
  const hasCapturableHold =
    !!booking.stripe_payment_id &&
    paymentStatus !== "paid" &&
    paymentStatus !== "refunded";

  // One-click charge of the card-on-file authorization hold (customer chose to
  // pay by card, or it's a no-show). Backed by the admin-only captureStripeHold
  // edge function.
  const handleProcessPayment = async () => {
    if (
      !confirm(
        `Charge this customer's card on file for $${Number(booking.total_cost).toFixed(2)}?\n\nThis captures the authorization hold and cannot be undone.`
      )
    ) {
      return;
    }

    setIsCharging(true);
    try {
      const result = await base44.functions.invoke("captureStripeHold", {
        bookingId: booking.id
      });

      if (result?.data?.success) {
        setPaymentStatus("paid");
        const amt = result.data.amountCaptured ?? Number(booking.total_cost);
        alert(`Payment processed. Charged $${Number(amt).toFixed(2)} to the card on file.`);
      } else {
        alert(`Could not process payment: ${result?.data?.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Error processing payment:", error);
      alert("Error processing payment. Please try again.");
    }
    setIsCharging(false);
  };

  // Bays for the same location, ordered standard-first then VIP. This powers the
  // manual override that lets an admin upgrade a group from a normal bay to VIP
  // (or otherwise reassign), even though the auto-optimizer keeps bay types
  // separate.
  const moveableBays = [...simulators]
    .filter((b) => b.is_active !== false && b.location === booking.location)
    .sort((a, b) => {
      const A = bayRank(a);
      const B = bayRank(b);
      if (A.vip !== B.vip) return A.vip - B.vip;
      return A.num - B.num;
    });

  const selectedNewBay = moveableBays.find((b) => b.id === newBayId);
  const isUpgrade = selectedNewBay && isVIPBay(selectedNewBay) && !isVIPBay({ name: booking.simulator_name });

  const handleMoveBay = async () => {
    if (!selectedNewBay || newBayId === booking.simulator_id) return;

    const bayLabel = getBayDisplayName(selectedNewBay.name, selectedNewBay.location);
    setIsMoving(true);
    try {
      if (useFutureScope) {
        const res = await applyToFutureSeries(() => ({
          simulator_id: selectedNewBay.id,
          simulator_name: selectedNewBay.name
        }));
        alert(seriesResultMsg(`Moved to ${bayLabel} on`, res));
        onClose();
        return;
      }
      // Conflict check on the target bay for this date/time (ignore self + cancelled).
      const newStart = toMinutes(booking.start_time);
      const newEnd = toMinutes(booking.end_time);
      const conflict = (existingBookings || []).some((b) => {
        if (b.id === booking.id) return false;
        if (b.simulator_id !== newBayId) return false;
        if (b.booking_date !== booking.booking_date) return false;
        if (b.status === "cancelled") return false;
        return newStart < toMinutes(b.end_time) && newEnd > toMinutes(b.start_time);
      });
      if (conflict) {
        alert(`${bayLabel} is already booked for this time. Choose another bay.`);
        setIsMoving(false);
        return;
      }
      await Booking.update(booking.id, {
        simulator_id: selectedNewBay.id,
        simulator_name: selectedNewBay.name
      });
      alert(`Reservation moved to ${bayLabel}.`);
      onClose();
    } catch (error) {
      console.error("Error moving booking:", error);
      alert("Error moving booking to the new bay.");
    }
    setIsMoving(false);
  };

  const handleUpdatePaymentStatus = async () => {
    setIsUpdating(true);
    try {
      await Booking.update(booking.id, { payment_status: paymentStatus });
      alert("Payment status updated successfully");
    } catch (error) {
      console.error("Error updating payment status:", error);
      alert("Error updating payment status");
    }
    setIsUpdating(false);
  };

  const handleUpdateStaffNotes = async () => {
    setIsUpdating(true);
    try {
      await Booking.update(booking.id, { staff_notes: staffNotes });
      alert("Staff notes updated successfully");
    } catch (error) {
      console.error("Error updating staff notes:", error);
      alert("Error updating staff notes");
    }
    setIsUpdating(false);
  };

  const handleCancelBooking = async () => {
    // Recurring series, "this & future" scope: cancel every upcoming occurrence.
    if (useFutureScope) {
      if (
        !confirm(
          `Cancel this reservation and all ${upcomingCount} upcoming occurrence${upcomingCount === 1 ? "" : "s"} in this recurring series?`
        )
      ) {
        return;
      }
      setIsCancelling(true);
      try {
        let ok = 0;
        for (const r of futureSiblings) {
          try {
            // Release a card hold where one exists; otherwise just flip status.
            if (r.stripe_payment_id && r.payment_status !== "refunded") {
              await base44.functions.invoke("cancelBooking", { bookingId: r.id });
            } else {
              await Booking.update(r.id, { status: "cancelled" });
            }
            ok += 1;
          } catch (e) {
            console.error("Series cancel failed for", r.booking_date, e);
          }
        }
        alert(`Cancelled ${ok} reservation${ok === 1 ? "" : "s"} in the series.`);
        onClose();
      } catch (error) {
        console.error("Error cancelling series:", error);
        alert("Error cancelling the series. Some reservations may not have been cancelled.");
      }
      setIsCancelling(false);
      return;
    }

    const hasHold =
      booking.stripe_payment_id && booking.payment_status !== "refunded";
    const confirmMsg = hasHold
      ? "Cancel this booking and release the card's authorization hold? The customer will be notified."
      : "Are you sure you want to cancel this booking?";
    if (!confirm(confirmMsg)) return;

    setIsCancelling(true);
    try {
      // Go through the cancelBooking function so the Stripe authorization hold
      // is actually released (and the customer + any waitlist are notified).
      // A bare Booking.update would only flip the status and leave the hold on
      // the card. Fall back to a plain status flip only if the function errors.
      const result = await base44.functions.invoke("cancelBooking", {
        bookingId: booking.id
      });

      if (result.data && result.data.success) {
        alert(
          result.data.holdReleased
            ? "Booking cancelled and the card hold was released."
            : "Booking cancelled. (No active hold to release.)"
        );
        onClose();
      } else {
        const msg = result.data?.error || "Cancellation failed.";
        if (
          confirm(
            `${msg}\n\nMark the booking cancelled anyway WITHOUT releasing the hold? You'll need to void the hold manually in Stripe.`
          )
        ) {
          await Booking.update(booking.id, { status: "cancelled" });
          alert("Booking marked cancelled. Remember to void the hold in Stripe.");
          onClose();
        }
      }
    } catch (error) {
      console.error("Error cancelling booking:", error);
      alert("Error cancelling booking: " + (error.message || "unknown error"));
    }
    setIsCancelling(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between border-b">
          <CardTitle className="text-2xl">Booking Details</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-6 p-6">
          {/* Check-In System */}
          <div>
            <h3 className="font-semibold text-lg mb-3">Check-In Status</h3>
            <CheckInSystem booking={booking} onUpdate={onClose} />
          </div>

          {/* Recurring-series controls. Shown when this reservation repeats
              (same customer, bay, time and weekday on other dates). The scope
              choice drives the Time, Duration, Bay-move, and Cancel actions
              below — so staff can edit the whole future series in one go. */}
          {isRecurring && booking.status !== "cancelled" && (
            <div className="p-4 bg-indigo-50 border-2 border-indigo-200 rounded-lg space-y-3">
              <div className="flex items-center gap-2 text-indigo-900 font-semibold">
                <Repeat className="w-5 h-5" />
                Recurring reservation
              </div>
              <p className="text-sm text-indigo-800">
                {seriesFrequency} on {seriesWeekday}s at {formatTime(booking.start_time)} ·{" "}
                {upcomingCount} upcoming occurrence{upcomingCount === 1 ? "" : "s"}.
              </p>
              <div className="space-y-2">
                <span className="text-sm font-medium text-slate-700">Apply my edits to:</span>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-5">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="apply-scope"
                      className="w-4 h-4 accent-[#2d5567]"
                      checked={applyScope === "single"}
                      onChange={() => setApplyScope("single")}
                    />
                    <span className="text-sm text-slate-700">Just this reservation</span>
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="apply-scope"
                      className="w-4 h-4 accent-[#2d5567]"
                      checked={applyScope === "future"}
                      onChange={() => setApplyScope("future")}
                    />
                    <span className="text-sm text-slate-700">
                      This &amp; all future ({upcomingCount})
                    </span>
                  </label>
                </div>
              </div>
              {useFutureScope && (
                <p className="text-xs text-indigo-700">
                  Changes to time, duration, bay, or cancelling below will apply to this and
                  every upcoming occurrence in the series.
                </p>
              )}
            </div>
          )}

          {/* Bay Info */}
          <div>
            <h3 className="font-semibold text-lg mb-2">Bay Information</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-slate-700">
                <MapPin className="w-5 h-5 text-[#2d5567]" />
                <span className="font-medium">{getBayDisplayName(booking.simulator_name, booking.location)}</span>
              </div>
              <div className="flex items-center gap-3 text-slate-700">
                <Calendar className="w-5 h-5 text-[#2d5567]" />
                <span>{format(new Date(`${booking.booking_date}T00:00:00`), "EEEE, MMMM d, yyyy")}</span>
              </div>
              <div className="flex items-center gap-3 text-slate-700">
                <Clock className="w-5 h-5 text-[#2d5567]" />
                <span>{formatTime(booking.start_time)} - {formatTime(booking.end_time)}</span>
              </div>
              <div className="flex items-center gap-3 text-slate-700">
                <Users className="w-5 h-5 text-[#2d5567]" />
                <span>{booking.number_of_players || 1} player{(booking.number_of_players || 1) !== 1 ? 's' : ''}</span>
              </div>
            </div>

            {/* Manual override: move / upgrade this reservation to another bay. */}
            {moveableBays.length > 0 && booking.status !== "cancelled" && (
              <div className="mt-4 p-3 bg-slate-50 rounded-lg space-y-2">
                <label className="text-sm font-semibold text-slate-700">
                  Move / Upgrade Bay
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={newBayId} onValueChange={setNewBayId}>
                    <SelectTrigger className="w-44">
                      <SelectValue placeholder="Choose a bay" />
                    </SelectTrigger>
                    <SelectContent>
                      {moveableBays.map((bay) => (
                        <SelectItem key={bay.id} value={bay.id}>
                          {getBayDisplayName(bay.name, bay.location)}{isVIPBay(bay) ? " - VIP" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {newBayId !== booking.simulator_id && (
                    <Button
                      size="sm"
                      onClick={handleMoveBay}
                      disabled={isMoving}
                      className="bg-[#2d5567] hover:bg-[#1e3a47]"
                    >
                      {isMoving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : isUpgrade ? (
                        "Upgrade to VIP"
                      ) : (
                        "Move"
                      )}
                    </Button>
                  )}
                </div>
                {isUpgrade && (
                  <p className="text-xs text-amber-700">
                    Heads up: upgrading to a VIP bay does not change the price already on this booking.
                  </p>
                )}
              </div>
            )}

            {/* Edit the reservation's start time and duration directly. */}
            {booking.status !== "cancelled" && (
              <div className="mt-4 p-3 bg-slate-50 rounded-lg space-y-2">
                <label className="text-sm font-semibold text-slate-700">Edit Time & Duration</label>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-500 mb-1">Start</span>
                    <Select value={startTime} onValueChange={setStartTime}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {startOptions.map((t) => (
                          <SelectItem key={t} value={t}>{formatTime(t)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-500 mb-1">Duration</span>
                    <Select value={String(durationHours)} onValueChange={(v) => setDurationHours(Number(v))}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {durationOptions.map((d) => (
                          <SelectItem key={d} value={String(d)}>
                            {d === 1 ? "1 hour" : `${d} hours`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {timeChanged && (
                    <Button
                      size="sm"
                      onClick={handleUpdateTime}
                      disabled={isSavingTime}
                      className="bg-[#2d5567] hover:bg-[#1e3a47]"
                    >
                      {isSavingTime ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Time"}
                    </Button>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  New window: {formatTime(startTime)} – {formatTime(proposedEnd)}
                </p>
              </div>
            )}

            {/* Change the reservation type (drives the tee-sheet color). Lets an
                admin correct a mis-tagged booking — e.g. a non-member that was
                saved as "Member" and shows purple. */}
            {booking.status !== "cancelled" && (
              <div className="mt-4 p-3 bg-slate-50 rounded-lg space-y-2">
                <label className="text-sm font-semibold text-slate-700">Reservation Type</label>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={reservationType} onValueChange={setReservationType}>
                    <SelectTrigger className="w-44">
                      <SelectValue placeholder="Choose type" />
                    </SelectTrigger>
                    <SelectContent>
                      {RESERVATION_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {reservationType !== (booking.reservation_type || "public") && (
                    <Button
                      size="sm"
                      onClick={handleUpdateReservationType}
                      disabled={isSavingType}
                      className="bg-[#2d5567] hover:bg-[#1e3a47]"
                    >
                      {isSavingType ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Type"}
                    </Button>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  Controls the color on the daily schedule (Public = blue, Member = purple,
                  Special = orange, Banked = green).
                </p>
              </div>
            )}
          </div>

          {/* Customer Info */}
          <div>
            <h3 className="font-semibold text-lg mb-2">Customer Information</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-slate-700">
                <Users className="w-5 h-5 text-[#2d5567]" />
                <span>{booking.customer_name}</span>
              </div>
              <div className="flex items-center gap-3 text-slate-700">
                <Mail className="w-5 h-5 text-[#2d5567]" />
                <a href={`mailto:${booking.customer_email}`} className="text-blue-600 hover:underline">
                  {booking.customer_email}
                </a>
              </div>
              {booking.customer_phone && (
                <div className="flex items-center gap-3 text-slate-700">
                  <Phone className="w-5 h-5 text-[#2d5567]" />
                  <a href={`tel:${booking.customer_phone}`} className="text-blue-600 hover:underline">
                    {booking.customer_phone}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Banked Hours balance — shown for green (banked-hours) reservations
              so staff can see how many hours this customer has left in their
              account at this location, split by peak / off-peak bucket. */}
          {isBanked && (
            <div>
              <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
                <Clock className="w-5 h-5 text-green-600" />
                Banked Hours
              </h3>
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                {bankedLoading ? (
                  <div className="flex items-center gap-2 text-slate-600">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading hour balance…
                  </div>
                ) : bankedError ? (
                  <p className="text-sm text-slate-600">{bankedError}</p>
                ) : bankedBalance ? (
                  <>
                    <p className="text-sm text-slate-700 mb-2">
                      <span className="font-semibold">{booking.customer_name}</span> has
                      remaining (usable at either club):
                    </p>
                    <div className="flex gap-6">
                      <div>
                        <div className="text-2xl font-bold text-green-700">
                          {Number(bankedBalance.peak || 0)}
                        </div>
                        <div className="text-xs text-slate-500 uppercase tracking-wide">Peak hours</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-green-700">
                          {Number(bankedBalance.off_peak || 0)}
                        </div>
                        <div className="text-xs text-slate-500 uppercase tracking-wide">Off-peak hours</div>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      Off-peak hours can only be redeemed outside peak times (Fri noon – Sun close);
                      peak hours can be used anytime.
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-slate-600">No hour balance on file for this customer.</p>
                )}
              </div>

              {/* Add / remove this customer's banked hours without leaving the
                  tee sheet. Mirrors the Hours admin: negative hours remove, and
                  an employee signature is required and recorded. */}
              <div className="mt-3 p-4 bg-white border border-green-200 rounded-lg space-y-3">
                <p className="text-sm font-semibold text-slate-700">Adjust hours</p>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-500 mb-1">Bucket</span>
                    <Select value={adjKind} onValueChange={setAdjKind}>
                      <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="off_peak">Off-peak</SelectItem>
                        <SelectItem value="peak">Peak</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-500 mb-1">Hours (− to remove)</span>
                    <Input
                      type="number"
                      step="0.5"
                      value={adjHours}
                      onChange={(e) => setAdjHours(e.target.value)}
                      placeholder="e.g. 2 or -1"
                      className="w-32"
                    />
                  </div>
                </div>
                <Input
                  value={adjNote}
                  onChange={(e) => setAdjNote(e.target.value)}
                  placeholder="Note (optional) — e.g. comped, correction"
                />
                <div className="flex flex-col">
                  <span className="text-xs text-slate-500 mb-1">
                    Employee signature <span className="text-red-500">*</span>
                  </span>
                  <Input
                    value={adjSignature}
                    onChange={(e) => setAdjSignature(e.target.value)}
                    placeholder="Your name"
                  />
                </div>
                {adjError && <p className="text-sm text-red-600">{adjError}</p>}
                {adjDone && <p className="text-sm text-green-700">{adjDone}</p>}
                <Button
                  size="sm"
                  onClick={handleAdjustHours}
                  disabled={isAdjusting}
                  className="bg-[#2d5567] hover:bg-[#1e3a47]"
                >
                  {isAdjusting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply adjustment"}
                </Button>
              </div>
            </div>
          )}

          {/* Member badge — shown when this reservation's customer is on the
              membership roster (matched by email) even though it was booked
              through the public flow. The actual member_bookings rows open the
              usage popup instead, so this only appears for those public-flow
              bookings by a member. */}
          {isMemberCustomer && (
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg flex items-center gap-2">
              <Crown className="w-5 h-5 text-purple-600" />
              <span className="text-sm text-purple-900 font-semibold">
                Member{booking.member_level ? ` · ${booking.member_level}` : ""}
              </span>
              <span className="text-xs text-purple-700">— on the membership roster</span>
            </div>
          )}

          {/* Add-ons Display */}
          {booking.add_ons && booking.add_ons.length > 0 && (
            <div>
              <h3 className="font-semibold text-lg mb-2">Food & Beverage Orders</h3>
              <div className="space-y-2 p-4 bg-slate-50 rounded-lg">
                {booking.add_ons.map((addon, idx) => (
                  <div key={idx} className="flex justify-between text-slate-700">
                    <span>{addon.item} × {addon.quantity}</span>
                    <span className="font-semibold">${addon.price.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payment Info */}
          <div>
            <h3 className="font-semibold text-lg mb-3">Payment Information</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-[#2d5567]" />
                  <span className="font-semibold">Total Cost:</span>
                </div>
                <span className="text-xl font-bold text-[#2d5567]">${booking.total_cost}</span>
              </div>

              {booking.card_last_four && (
                <div className="flex items-center gap-3 text-slate-700">
                  <CreditCard className="w-5 h-5 text-[#2d5567]" />
                  <span>Card ending in ****{booking.card_last_four}</span>
                </div>
              )}

              {/* One-click charge of the card-on-file hold (pay-by-card or no-show). */}
              {hasCapturableHold && booking.status !== "cancelled" && (
                <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-lg space-y-2">
                  <p className="text-sm text-amber-900 font-medium">
                    A card hold is on file. Charge it if the customer wants to pay by card, or for a no-show.
                  </p>
                  <Button
                    onClick={handleProcessPayment}
                    disabled={isCharging}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-base font-semibold"
                  >
                    {isCharging ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-4 h-4 mr-2" />
                        Process Payment — ${Number(booking.total_cost).toFixed(2)}
                      </>
                    )}
                  </Button>
                </div>
              )}

              <div className="flex items-center gap-3">
                <label className="text-sm font-medium">Payment Status:</label>
                <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="refunded">Refunded</SelectItem>
                  </SelectContent>
                </Select>
                {paymentStatus !== booking.payment_status && (
                  <Button
                    size="sm"
                    onClick={handleUpdatePaymentStatus}
                    disabled={isUpdating}
                    className="bg-[#2d5567] hover:bg-[#1e3a47]"
                  >
                    {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Update"}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Customer Notes */}
          {booking.notes && (
            <div>
              <h3 className="font-semibold text-lg mb-2">Customer Notes</h3>
              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                <MessageSquare className="w-5 h-5 text-[#2d5567] mt-0.5" />
                <p className="text-slate-700">{booking.notes}</p>
              </div>
            </div>
          )}

          {/* Staff Notes — the internal "admin note" for this reservation.
              Saving any text here raises an amber flag on the reservation's
              block on the daily tee sheet so other employees know to open it
              and read the note. */}
          <div>
            <h3 className="font-semibold text-lg mb-1 flex items-center gap-2">
              <Flag className="w-4 h-4 text-red-500 fill-red-500" />
              Staff Note (Internal)
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              Anything you save here shows a flag on this reservation on the tee sheet so staff know to check it.
            </p>
            <div className="space-y-3">
              <Textarea
                value={staffNotes}
                onChange={(e) => setStaffNotes(e.target.value)}
                placeholder="e.g. Called ahead — running 15 min late · birthday group, bring cake · card declined, collect at desk"
                rows={3}
                className="text-base"
              />
              {staffNotes !== booking.staff_notes && (
                <Button
                  size="sm"
                  onClick={handleUpdateStaffNotes}
                  disabled={isUpdating}
                  className="bg-[#2d5567] hover:bg-[#1e3a47]"
                >
                  {isUpdating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Saving...
                    </>
                  ) : "Save Notes"}
                </Button>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              Close
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelBooking}
              disabled={isCancelling || booking.status === "cancelled"}
              className="flex-1"
            >
              {isCancelling ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Cancelling...
                </>
              ) : (
                "Cancel Booking"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
