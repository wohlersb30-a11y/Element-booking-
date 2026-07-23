import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, Clock, MapPin, Crown, AlertCircle, Sparkles, Ticket, Users, Lock } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  getPlan,
  enforcementActive,
  isWithinCoveredWindow,
  hoursUsedInPeriod,
  guestPassesUsedInPeriod,
  memberDiscountedRate,
  timeToMinutes
} from "@/config/membershipPlans";
import { computeTax } from "@/config/tax";
import { trackInitiateCheckout } from "@/lib/metaPixel";

const ALL_TIME_SLOTS = [];
for (let h = 6; h <= 22; h++) {
  for (const m of [0, 30]) {
    const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    const ampm = h < 12 ? "AM" : "PM";
    ALL_TIME_SLOTS.push({ value, label: `${hour12}:${String(m).padStart(2, "0")} ${ampm}` });
  }
}

const DURATION_OPTIONS = [
  { value: 0.5, label: "30 min" },
  { value: 1, label: "1 hour" },
  { value: 1.5, label: "1.5 hours" },
  { value: 2, label: "2 hours" },
  { value: 2.5, label: "2.5 hours" },
  { value: 3, label: "3 hours" }
];

const calculateEndTime = (startTime, duration) => {
  const total = timeToMinutes(startTime) + duration * 60;
  const eh = Math.floor(total / 60);
  const em = total % 60;
  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
};

// Client-side mirror of the server's base rate (used only for display).
const computeBaseRate = (bay, date, startTime) => {
  const day = date.getDay();
  const hour = parseInt(startTime.split(":")[0], 10);
  const isPeak = (day === 5 && hour >= 15) || day === 0 || day === 6;
  if (Array.isArray(bay.pricing_rules) && bay.pricing_rules.length > 0) {
    for (const rule of bay.pricing_rules) {
      const rs = new Date(rule.start_date);
      const re = new Date(rule.end_date);
      if (date >= rs && date <= re) return isPeak ? Number(rule.peak_rate) : Number(rule.off_peak_rate);
    }
  }
  if (bay.pricing_off_peak != null && bay.pricing_peak != null) {
    return isPeak ? Number(bay.pricing_peak) : Number(bay.pricing_off_peak);
  }
  const vip = (bay.bay_type || "standard") === "vip";
  return vip ? (isPeak ? 85 : 65) : isPeak ? 60 : 50;
};

const isBayAvailable = (bay, dateStr, startTime, duration, existing) => {
  const s = timeToMinutes(startTime);
  const e = s + duration * 60;
  return !existing.some((b) => {
    if (b.simulator_id !== bay.id) return false;
    if (b.booking_date !== dateStr) return false;
    if (b.status === "cancelled") return false;
    return s < timeToMinutes(b.end_time) && e > timeToMinutes(b.start_time);
  });
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const fmtTime = (t) => {
  const [h, m] = t.split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? ":" + String(m).padStart(2, "0") : ""}${h < 12 ? "am" : "pm"}`;
};
const describeWindows = (plan) => {
  if (!plan) return "";
  if (plan.coveredWindows === "anytime") return "Anytime during business hours";
  return plan.coveredWindows
    .map((w) => {
      const days = w.days.map((d) => DAY_NAMES[d]).join("–").replace("Sun–", "Sun ");
      const dayLabel = w.days.length > 1 ? `${DAY_NAMES[w.days[0]]}–${DAY_NAMES[w.days[w.days.length - 1]]}` : DAY_NAMES[w.days[0]];
      return w.allDay ? `${dayLabel} anytime` : `${dayLabel} ${fmtTime(w.start)}–${fmtTime(w.end)}`;
    })
    .join(" · ");
};

export default function MemberBookings() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [membership, setMembership] = useState(null);
  const [allBays, setAllBays] = useState([]);
  const [allBookings, setAllBookings] = useState([]);
  const [memberBookings, setMemberBookings] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState("");
  const [duration, setDuration] = useState(1);
  const [selectedBay, setSelectedBay] = useState("");
  const [availableBays, setAvailableBays] = useState([]);
  const [wantsGuest, setWantsGuest] = useState(false);
  const [showPrime, setShowPrime] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [seatEmail, setSeatEmail] = useState("");
  const [seatBusy, setSeatBusy] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const user = await base44.auth.me();
      setCurrentUser(user);

      // RLS only returns memberships this user can see (owner OR authorized
      // corporate account holder), so list() naturally scopes to the caller.
      const email = (user.email || "").toLowerCase();
      const isMine = (m) =>
        (m.user_email || "").toLowerCase() === email ||
        (Array.isArray(m.authorized_emails) &&
          m.authorized_emails.map((e) => (e || "").toLowerCase()).includes(email));
      const memberships = await base44.entities.Membership.list();
      const active = memberships.find((m) => m.status === "active" && isMine(m));
      if (!active) {
        alert("No active membership found. Please sign up for a membership first.");
        navigate(createPageUrl("MemberSignup"));
        return;
      }
      setMembership(active);

      const [bays, regularBookings, memBookings] = await Promise.all([
        base44.entities.Simulator.filter({ location: active.location, is_active: true }),
        base44.entities.Booking.list(),
        // Shared pool: usage is tracked per membership_id (covers corporate
        // multi-seat too), NOT per member email.
        base44.entities.MemberBooking.filter({ membership_id: active.id })
      ]);
      setAllBays(bays);
      setAllBookings(regularBookings);
      setMemberBookings(memBookings);
    } catch (error) {
      console.error("Error loading data:", error);
    }
    setIsLoading(false);
  };

  const plan = membership ? getPlan(membership.membership_level) : null;
  const isOwner =
    membership &&
    currentUser &&
    (membership.user_email || "").toLowerCase() === (currentUser.email || "").toLowerCase();
  const seatCap = plan?.accountHolders || 1;
  const authorizedEmails = Array.isArray(membership?.authorized_emails) ? membership.authorized_emails : [];
  const showSeatsCard = isOwner && seatCap > 1;

  const manageSeat = async (action, email) => {
    setSeatBusy(true);
    try {
      const res = await base44.functions.invoke("manageCorporateSeats", {
        membershipId: membership.id,
        action,
        email
      });
      const d = res.data || {};
      if (!d.success) {
        alert(d.error || "Could not update seats.");
      } else {
        setSeatEmail("");
        await loadData();
      }
    } catch (error) {
      console.error("Seat management error:", error);
      alert("Something went wrong updating seats.");
    }
    setSeatBusy(false);
  };

  const hoursUsed = plan ? hoursUsedInPeriod(plan, memberBookings) : 0;
  const hoursRemaining = plan ? Math.max(0, plan.hours - hoursUsed) : 0;
  const passesUsed = plan ? guestPassesUsedInPeriod(plan, memberBookings) : 0;
  const passesRemaining = plan ? Math.max(0, plan.guestPasses - passesUsed) : 0;
  const periodLabel = plan?.hoursPeriod === "week" ? "this week" : "this month";

  // Does a given start/duration land inside the covered window AND fit remaining hours?
  const slotIsIncluded = (dateObj, startTime, dur) => {
    if (!plan || !dateObj) return false;
    const enforce = enforcementActive(dateObj);
    if (!enforce) return true;
    const endTime = calculateEndTime(startTime, dur);
    const within = isWithinCoveredWindow(plan, dateObj, startTime, endTime);
    return within && dur <= hoursRemaining + 1e-9;
  };

  // Time slots offered for the current date: included ones always; prime ones only
  // when the member has toggled "show prime hours".
  const offeredSlots = () => {
    if (!selectedDate) return [];
    return ALL_TIME_SLOTS.filter((slot) => {
      const included = slotIsIncluded(selectedDate, slot.value, duration);
      return included || showPrime;
    }).map((slot) => ({
      ...slot,
      included: slotIsIncluded(selectedDate, slot.value, duration)
    }));
  };

  const handleSearch = () => {
    if (!selectedDate || !selectedTime) {
      alert("Please pick a date and time.");
      return;
    }
    setIsSearching(true);
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const included = slotIsIncluded(selectedDate, selectedTime, duration);
    const available = allBays
      .filter((bay) => isBayAvailable(bay, dateStr, selectedTime, duration, [...allBookings, ...memberBookings]))
      .map((bay) => {
        const base = computeBaseRate(bay, selectedDate, selectedTime);
        const perHour = included ? 0 : memberDiscountedRate(base, plan);
        return { ...bay, included, perHour, totalCost: included ? 0 : Math.round(perHour * duration * 100) / 100 };
      });
    setAvailableBays(available);
    setSelectedBay("");
    setIsSearching(false);
  };

  // Send the member to Stripe to place an authorization hold for a prime
  // (non-covered / over-allotment) booking at their member rate.
  const startPrimeCheckout = async (checkoutValue) => {
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const endTime = calculateEndTime(selectedTime, duration);
    const origin = window.location.origin;
    const res = await base44.functions.invoke("createMemberCheckout", {
      membershipId: membership.id,
      simulatorId: selectedBay,
      bookingDate: dateStr,
      startTime: selectedTime,
      endTime,
      durationHours: duration,
      wantsGuest,
      successUrl: `${origin}${createPageUrl("PaymentSuccess")}?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}${createPageUrl("MemberBookings")}`
    });
    const d = res.data || {};
    if (d.included) {
      // Server decided it's actually included — fall back to the free flow.
      return submitBooking(false);
    }
    if (!d.url) {
      alert(d.error || "Could not start checkout.");
      setIsSubmitting(false);
      return;
    }
    trackInitiateCheckout({
      value: typeof checkoutValue === "number" ? checkoutValue : undefined,
      contentType: "booking",
      numItems: 1
    });
    window.location.href = d.url;
  };

  const submitBooking = async (acceptPrime) => {
    setIsSubmitting(true);
    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const endTime = calculateEndTime(selectedTime, duration);
      const res = await base44.functions.invoke("createMemberBooking", {
        membershipId: membership.id,
        simulatorId: selectedBay,
        bookingDate: dateStr,
        startTime: selectedTime,
        endTime,
        durationHours: duration,
        wantsGuest,
        acceptPrime
      });
      const d = res.data || {};

      // Prime slot: confirm, then route to Stripe for an authorization hold at
      // the member rate (paid online, not at the desk).
      if (d.needsPrimeConfirmation) {
        const { tax: primeTax, total: primeTotal } = computeTax(
          Number(d.totalCost),
          membership.location
        );
        const ok = window.confirm(
          `${d.error}\n\nReserve as prime time for $${Number(d.totalCost).toFixed(
            2
          )} + $${primeTax.toFixed(2)} MN sales tax = $${primeTotal.toFixed(
            2
          )} (${plan.name} member rate)? You'll place a card hold now — no charge until you check in.`
        );
        if (!ok) {
          setIsSubmitting(false);
          return;
        }
        return startPrimeCheckout(primeTotal);
      }

      if (!d.success) {
        alert(d.error || "Could not complete the booking.");
        setIsSubmitting(false);
        return;
      }

      alert("Booked! This session is included in your membership. 🏌️");
      setSelectedDate(null);
      setSelectedTime("");
      setSelectedBay("");
      setWantsGuest(false);
      setAvailableBays([]);
      await loadData();
    } catch (error) {
      console.error("Booking error:", error);
      alert("Something went wrong. Please try again.");
    }
    setIsSubmitting(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-[#2d5567]" />
      </div>
    );
  }

  if (membership && !plan) {
    return (
      <div className="min-h-screen p-6 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center space-y-3">
            <AlertCircle className="w-10 h-10 mx-auto text-amber-500" />
            <p className="font-semibold">We couldn't match your membership tier.</p>
            <p className="text-sm text-slate-600">
              Please call {`651-330-1699`} and we'll get your account updated.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const upcoming = memberBookings
    .filter((b) => b.booking_date >= format(new Date(), "yyyy-MM-dd") && b.status !== "cancelled")
    .sort((a, b) => new Date(a.booking_date) - new Date(b.booking_date));

  const slots = offeredSlots();
  const selectedIncluded = selectedDate && selectedTime ? slotIsIncluded(selectedDate, selectedTime, duration) : true;

  return (
    <div className="min-h-screen p-6 bg-gradient-to-br from-slate-50 via-purple-50/30 to-slate-100">
      <div className="max-w-6xl mx-auto">
        {/* Header + balances */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h1 className="text-3xl font-black text-slate-800 heading-font">Member Portal</h1>
            <Badge className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-sm px-4 py-2 capitalize">
              <Crown className="w-4 h-4 mr-1" />
              {plan.name} Member
            </Badge>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <Card className="border-2 border-[#2d5567]/20">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
                  <Clock className="w-4 h-4" /> Hours remaining {periodLabel}
                </div>
                <p className="text-3xl font-black text-[#2d5567]">
                  {hoursRemaining}
                  <span className="text-base font-semibold text-slate-400"> / {plan.hours} hrs</span>
                </p>
              </CardContent>
            </Card>
            <Card className="border-2 border-purple-200">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
                  <Ticket className="w-4 h-4" /> Guest passes (this month)
                </div>
                <p className="text-3xl font-black text-purple-600">
                  {passesRemaining}
                  <span className="text-base font-semibold text-slate-400"> / {plan.guestPasses}</span>
                </p>
              </CardContent>
            </Card>
            <Card className="border-2 border-slate-200">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
                  <MapPin className="w-4 h-4" /> Home location
                </div>
                <p className="text-lg font-bold text-slate-700 mt-2">
                  {membership.location === "vadnais_heights" ? "Vadnais Heights" : "Burnsville"}
                </p>
              </CardContent>
            </Card>
          </div>

          <p className="text-sm text-slate-500 mt-3">
            <span className="font-semibold">Your included hours:</span> {describeWindows(plan)}
          </p>

          {showSeatsCard && (
            <Card className="mt-4 border-2 border-indigo-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-600" /> Account Holders
                  <span className="text-sm font-normal text-slate-500">
                    ({authorizedEmails.length + 1} of {seatCap} seats used)
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-slate-500">
                  Add co-workers to share your corporate hour pool and guest passes. They sign in with their own
                  account and draw from the same monthly allotment.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-lg border bg-slate-50 px-3 py-2 text-sm">
                    <span className="font-medium">{membership.user_email}</span>
                    <Badge variant="outline" className="text-xs">
                      Owner
                    </Badge>
                  </div>
                  {authorizedEmails.map((e) => (
                    <div key={e} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                      <span>{e}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={seatBusy}
                        onClick={() => manageSeat("remove", e)}
                        className="text-red-600 hover:text-red-700 h-7"
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
                {authorizedEmails.length + 1 < seatCap ? (
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={seatEmail}
                      onChange={(ev) => setSeatEmail(ev.target.value)}
                      placeholder="teammate@company.com"
                      className="flex-1 rounded-lg border px-3 py-2 text-sm"
                    />
                    <Button
                      disabled={seatBusy || !seatEmail.trim()}
                      onClick={() => manageSeat("add", seatEmail.trim())}
                      className="bg-indigo-600 hover:bg-indigo-700"
                    >
                      {seatBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">All seats are in use. Remove one to add another.</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Booking form */}
          <Card>
            <CardHeader>
              <CardTitle>New Booking</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label className="mb-2 block">Select Date</Label>
                <CalendarComponent
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => {
                    setSelectedDate(d);
                    setSelectedTime("");
                    setAvailableBays([]);
                  }}
                  disabled={(date) => date < new Date(new Date().toDateString())}
                  className="rounded-lg border"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Duration</Label>
                  <Select
                    value={String(duration)}
                    onValueChange={(v) => {
                      setDuration(Number(v));
                      setSelectedTime("");
                      setAvailableBays([]);
                    }}
                  >
                    <SelectTrigger className="h-12">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DURATION_OPTIONS.map((d) => (
                        <SelectItem key={d.value} value={String(d.value)}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Start Time</Label>
                  <Select value={selectedTime} onValueChange={setSelectedTime} disabled={!selectedDate}>
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder={selectedDate ? "Select time" : "Pick a date first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {slots.map((slot) => (
                        <SelectItem key={slot.value} value={slot.value}>
                          {slot.label}
                          {slot.included ? (
                            <span className="ml-2 text-xs text-emerald-600">Included</span>
                          ) : (
                            <span className="ml-2 text-xs text-amber-600">Prime</span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Prime toggle */}
              {selectedDate && (
                <button
                  type="button"
                  onClick={() => setShowPrime((v) => !v)}
                  className={`w-full text-sm rounded-lg border-2 border-dashed px-4 py-3 transition-colors flex items-center justify-center gap-2 ${
                    showPrime
                      ? "border-amber-400 bg-amber-50 text-amber-800"
                      : "border-slate-300 text-slate-600 hover:border-amber-300 hover:text-amber-700"
                  }`}
                >
                  <Lock className="w-4 h-4" />
                  {showPrime ? "Hiding non-covered times…" : "Show prime hours (not covered by membership)"}
                </button>
              )}

              {selectedDate && selectedTime && !selectedIncluded && (
                <Alert className="bg-amber-50 border-amber-200">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-800 text-sm">
                    <strong>Prime time.</strong> This slot isn't covered by your membership hours. You can still book it at
                    your {plan.name} member rate ({Math.round((plan.discount || 0) * 100)}% off), paid at the front desk.
                  </AlertDescription>
                </Alert>
              )}

              {/* Guest pass */}
              <label
                className={`flex items-center gap-3 rounded-lg border p-3 ${
                  passesRemaining > 0 ? "cursor-pointer hover:bg-slate-50" : "opacity-50 cursor-not-allowed"
                }`}
              >
                <input
                  type="checkbox"
                  className="w-4 h-4"
                  disabled={passesRemaining <= 0}
                  checked={wantsGuest}
                  onChange={(e) => setWantsGuest(e.target.checked)}
                />
                <Users className="w-4 h-4 text-purple-600" />
                <span className="text-sm">
                  Bring a guest <span className="text-slate-500">(uses 1 of {passesRemaining} passes)</span>
                </span>
              </label>

              <Button
                onClick={handleSearch}
                disabled={!selectedDate || !selectedTime || isSearching}
                className="w-full h-12 bg-[#2d5567] hover:bg-[#1e3a47]"
              >
                {isSearching ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Find Available Bays
              </Button>

              {availableBays.length > 0 && (
                <div className="space-y-3">
                  <Label>Available Bays</Label>
                  <div className="grid gap-2">
                    {availableBays.map((bay) => (
                      <Card
                        key={bay.id}
                        className={`cursor-pointer transition-all ${
                          selectedBay === bay.id ? "ring-2 ring-[#2d5567] bg-blue-50" : "hover:shadow-md"
                        }`}
                        onClick={() => setSelectedBay(bay.id)}
                      >
                        <CardContent className="p-4 flex items-center justify-between">
                          <div>
                            <p className="font-semibold">{bay.name}</p>
                            {bay.bay_type === "vip" && <Badge className="mt-1 bg-amber-100 text-amber-800">VIP Bay</Badge>}
                            {bay.included ? (
                              <p className="text-sm text-emerald-600 font-semibold mt-1">✓ Included with membership</p>
                            ) : (
                              <p className="text-sm text-amber-700 font-semibold mt-1">
                                Prime — ${bay.totalCost.toFixed(2)} + tax ({Math.round((plan.discount || 0) * 100)}% member rate)
                              </p>
                            )}
                          </div>
                          {selectedBay === bay.id && (
                            <div className="w-6 h-6 rounded-full bg-[#2d5567] flex items-center justify-center">
                              <Clock className="w-4 h-4 text-white" />
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  <Button
                    onClick={() => submitBooking(false)}
                    disabled={!selectedBay || isSubmitting}
                    className="w-full h-12 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Confirm Booking
                  </Button>
                </div>
              )}

              {availableBays.length === 0 && selectedDate && selectedTime && !isSearching && (
                <div className="text-center py-8 text-slate-500">
                  <AlertCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No bays available — search a different time.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upcoming */}
          <Card>
            <CardHeader>
              <CardTitle>Your Upcoming Bookings</CardTitle>
            </CardHeader>
            <CardContent>
              {upcoming.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No upcoming bookings</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {upcoming.map((b) => (
                    <Card
                      key={b.id}
                      className={b.included ? "bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200" : "bg-amber-50 border border-amber-200"}
                    >
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-lg">{b.simulator_name}</p>
                              {b.included ? (
                                <Badge className="bg-emerald-600 text-white text-xs">Included</Badge>
                              ) : (
                                <Badge className="bg-amber-500 text-white text-xs">Prime</Badge>
                              )}
                              {b.guest_pass_used && (
                                <Badge variant="outline" className="text-xs">
                                  <Users className="w-3 h-3 mr-1" /> +Guest
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-slate-600 mt-1">
                              <Clock className="w-4 h-4" />
                              <span>
                                {format(new Date(b.booking_date + "T00:00:00"), "MMM d, yyyy")} at {fmtTime(b.start_time)}
                              </span>
                            </div>
                            {b.total_cost > 0 ? (
                              <p className="text-sm text-amber-700 font-semibold mt-2">
                                ${Number(b.total_cost).toFixed(2)} due at desk
                              </p>
                            ) : (
                              <p className="text-sm text-emerald-700 font-semibold mt-2">No charge</p>
                            )}
                          </div>
                          <Badge className="bg-green-100 text-green-800">Confirmed</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
