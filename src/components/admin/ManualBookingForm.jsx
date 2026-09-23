
import React, { useState, useEffect, useRef } from "react";
import { Booking } from "@/entities/all";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { X, Loader2, Repeat, Mail, Phone, User } from "lucide-react";
import { format, addDays, addWeeks, addMonths } from "date-fns";

import { sendBookingConfirmation } from "../booking/BookingConfirmationEmail";
import { sendBookingConfirmationSMS } from "../booking/BookingConfirmationSMS";
import { RESERVATION_TYPE_OPTIONS } from "@/lib/bookingCategories";
import { useLocationHours, buildStartOptions } from "@/config/hours";
import { getBayDisplayName } from "@/lib/bayNames";

const DURATIONS = [
  { value: 1, label: "1 hour" },
  { value: 1.5, label: "1.5 hours" },
  { value: 2, label: "2 hours" },
  { value: 2.5, label: "2.5 hours" },
  { value: 3, label: "3 hours" },
  { value: 3.5, label: "3.5 hours" },
  { value: 4, label: "4 hours" },
  { value: 4.5, label: "4.5 hours" },
  { value: 5, label: "5 hours" },
  { value: 5.5, label: "5.5 hours" },
  { value: 6, label: "6 hours" }
];

// Returns the date of occurrence #i (0-based) for a recurring series.
const advanceDate = (baseDate, frequency, i) => {
  switch (frequency) {
    case "daily": return addDays(baseDate, i);
    case "biweekly": return addWeeks(baseDate, i * 2);
    case "monthly": return addMonths(baseDate, i);
    case "weekly":
    default: return addWeeks(baseDate, i);
  }
};

const calculateEndTime = (startTime, duration) => {
  const [hours, minutes] = startTime.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + (duration * 60);
  const endHours = Math.floor(totalMinutes / 60);
  const endMinutes = totalMinutes % 60;
  return `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
};

// Format a digits-only phone as (XXX) XXX-XXXX when it's a 10-digit US number.
const fmtPhone = (p) => {
  if (!p) return "";
  const d = String(p).replace(/\D/g, "");
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return p;
};

const calculateRate = (date, startTime, simulator) => {
  const bookingDate = new Date(date);
  // Normalize bookingDate to start of day for comparison purposes to avoid time zone issues
  bookingDate.setHours(0, 0, 0, 0);

  const dayOfWeek = bookingDate.getDay();
  const hour = parseInt(startTime.split(':')[0]);
  
  // Peak = Friday from noon through Sunday close. Everything else is off-peak.
  const isFridayFromNoon = dayOfWeek === 5 && hour >= 12;
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sunday is 0, Saturday is 6
  const isPeakTime = isFridayFromNoon || isWeekend;
  
  // Check if there's a date-specific pricing rule for this date
  if (simulator && simulator.pricing_rules && simulator.pricing_rules.length > 0) {
    for (const rule of simulator.pricing_rules) {
      const ruleStart = new Date(rule.start_date);
      ruleStart.setHours(0, 0, 0, 0); // Normalize rule start date
      const ruleEnd = new Date(rule.end_date);
      ruleEnd.setHours(0, 0, 0, 0); // Normalize rule end date
      
      if (bookingDate >= ruleStart && bookingDate <= ruleEnd) {
        // Found a matching date range, use its pricing
        return isPeakTime ? rule.peak_rate : rule.off_peak_rate;
      }
    }
  }
  
  // Use simulator's default pricing if available
  if (simulator && simulator.pricing_off_peak !== undefined && simulator.pricing_peak !== undefined) {
    return isPeakTime ? simulator.pricing_peak : simulator.pricing_off_peak;
  }
  
  // Fallback to hardcoded defaults based on bay type
  const bayType = simulator?.bay_type || "standard";
  if (bayType === "vip") {
    return isPeakTime ? 85 : 65;
  } else { // 'standard' or any other non-vip type
    return isPeakTime ? 60 : 50;
  }
};


const getBaySortOrder = (originalName) => {
  const orderMap = {
    "East 1": 1,
    "East 2": 2,
    "West 1": 3,
    "West 2": 4,
    "West 3": 5,
    "South 1": 6,
    "South 2": 7,
    "North 1": 8,
    "North 2": 9,
    "VIP 1": 10,
    "VIP 2": 11
  };
  return orderMap[originalName] || 999;
};

export default function ManualBookingForm({ simulators, existingBookings = [], existingBlocks = [], onClose, onComplete, initialDate, preselectedBay, preselectedTime, location }) {
  // Admin start times follow the location's operating hours (half-hour steps from
  // open up to close). Defaults to 9 AM–11 PM when no override is saved.
  const hours = useLocationHours(location);
  const TIME_SLOTS = buildStartOptions(hours.open, hours.close, 30);
  const [formData, setFormData] = useState({
    simulator_ids: preselectedBay?.id ? [preselectedBay.id] : [],
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    booking_date: initialDate || new Date(),
    start_time: preselectedTime || "",
    duration_hours: 1,
    number_of_players: 1,
    reservation_type: "",
    payment_method: "pay_at_venue",
    payment_status: "pending",
    notes: "",
    bay_locked: false,
    is_recurring: false,
    recurrence_frequency: "weekly",
    recurrence_count: 4
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Customer autocomplete (search the imported customer directory) ---
  // As the admin types a name (or email/phone) into the Customer Name box, we
  // look up matching contacts in the `customers` table and offer to auto-fill
  // the name / email / phone so returning customers don't have to be retyped.
  const [custMatches, setCustMatches] = useState([]);
  const [custLoading, setCustLoading] = useState(false);
  const [showCustList, setShowCustList] = useState(false);
  // True once a lookup has actually completed for the current term, so we can
  // show a "no saved customer found" message instead of a blank panel.
  const [custSearched, setCustSearched] = useState(false);
  // Unique contacts drawn from past bookings, so returning customers who aren't
  // in the imported directory table still show up as suggestions.
  const [bookingContacts, setBookingContacts] = useState([]);
  // Set right after a suggestion is picked so the debounce effect doesn't
  // immediately re-open the dropdown for the value we just filled in.
  const skipCustSearchRef = useRef(false);

  // Build a de-duped contact list from booking history (once on mount).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const all = await Booking.list("-booking_date");
        const map = new Map();
        (all || []).forEach((b) => {
          if (!b.customer_name && !b.customer_email && !b.customer_phone) return;
          const key =
            (b.customer_email || "").toLowerCase() ||
            (b.customer_phone || "").replace(/\D/g, "") ||
            (b.customer_name || "").toLowerCase();
          if (!key || map.has(key)) return;
          map.set(key, {
            id: `bk-${key}`,
            full_name: b.customer_name,
            email: b.customer_email,
            phone: b.customer_phone,
          });
        });
        if (active) setBookingContacts(Array.from(map.values()));
      } catch (e) {
        console.error("Failed to load booking contacts:", e);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (skipCustSearchRef.current) {
      skipCustSearchRef.current = false;
      return;
    }
    const term = (formData.customer_name || "").trim();
    if (term.length < 2) {
      setCustMatches([]);
      setShowCustList(false);
      setCustSearched(false);
      return;
    }
    // Open the panel immediately (shows a spinner) so it's obvious a search is
    // running as soon as the admin starts typing.
    setShowCustList(true);
    let active = true;
    const t = setTimeout(async () => {
      setCustLoading(true);
      try {
        const esc = term.replace(/[%,]/g, " ");
        const digits = term.replace(/\D/g, "");
        const ors = [`full_name.ilike.%${esc}%`, `email.ilike.%${esc}%`];
        if (digits) ors.push(`phone.ilike.%${digits}%`);
        const { data, error } = await supabase
          .from("customers")
          .select("id, full_name, email, phone")
          .or(ors.join(","))
          .order("full_name", { ascending: true, nullsFirst: false })
          .limit(8);
        if (error) throw error;

        // Also match against contacts pulled from past bookings.
        const lc = term.toLowerCase();
        const bkMatches = bookingContacts.filter(
          (c) =>
            (c.full_name || "").toLowerCase().includes(lc) ||
            (c.email || "").toLowerCase().includes(lc) ||
            (digits && (c.phone || "").replace(/\D/g, "").includes(digits))
        );

        // Merge directory + booking contacts, de-duping by email (or phone
        // when there's no email). Directory entries take precedence.
        const seenEmail = new Set();
        const seenPhone = new Set();
        const merged = [];
        const pushContact = (c) => {
          const em = (c.email || "").toLowerCase();
          const ph = (c.phone || "").replace(/\D/g, "");
          if (em && seenEmail.has(em)) return;
          if (!em && ph && seenPhone.has(ph)) return;
          if (em) seenEmail.add(em);
          if (ph) seenPhone.add(ph);
          merged.push(c);
        };
        (data || []).forEach(pushContact);
        bkMatches.forEach(pushContact);

        if (active) {
          setCustMatches(merged.slice(0, 8));
          setCustSearched(true);
          setShowCustList(true);
        }
      } catch (e) {
        console.error("Customer search failed:", e);
        if (active) {
          setCustMatches([]);
          setCustSearched(true);
        }
      } finally {
        if (active) setCustLoading(false);
      }
    }, 200);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [formData.customer_name, bookingContacts]);

  // Fill the contact fields from a chosen directory match.
  const applyCustomer = (c) => {
    skipCustSearchRef.current = true;
    setFormData((prev) => ({
      ...prev,
      customer_name: c.full_name || prev.customer_name,
      customer_email: c.email || prev.customer_email,
      customer_phone: c.phone || prev.customer_phone,
    }));
    setShowCustList(false);
    setCustMatches([]);
    setCustSearched(false);
  };

  // Update form when preselected values change
  useEffect(() => {
    if (preselectedBay) {
      setFormData(prev => ({ ...prev, simulator_ids: [preselectedBay.id] }));
    }
    if (preselectedTime) {
      setFormData(prev => ({ ...prev, start_time: preselectedTime }));
    }
  }, [preselectedBay, preselectedTime]);

  // Toggle a bay in/out of the multi-bay selection.
  const toggleBay = (id) => {
    setFormData(prev => ({
      ...prev,
      simulator_ids: prev.simulator_ids.includes(id)
        ? prev.simulator_ids.filter(x => x !== id)
        : [...prev.simulator_ids, id]
    }));
  };

  // The set of bays chosen for this reservation (admins can select several at
  // once — e.g. booking multiple bays for a large party or league night).
  const selectedBays = simulators.filter(s => formData.simulator_ids.includes(s.id));

  // Per-session cost = sum of every selected bay's rate × duration for the
  // chosen date (VIP and standard bays can price differently).
  const sessionCostFor = (date) =>
    selectedBays.reduce(
      (sum, bay) => sum + calculateRate(format(date, "yyyy-MM-dd"), formData.start_time, bay) * formData.duration_hours,
      0
    );
  const totalCost = selectedBays.length && formData.start_time ? sessionCostFor(formData.booking_date) : 0;

  // For a recurring series: the list of session dates and the estimated total
  // across all of them (peak/off-peak pricing is recomputed per date).
  const recurrenceCount = Math.max(1, Math.min(52, parseInt(formData.recurrence_count, 10) || 1));
  const recurringDates = formData.is_recurring && formData.booking_date
    ? Array.from({ length: recurrenceCount }, (_, i) =>
        advanceDate(formData.booking_date, formData.recurrence_frequency, i))
    : [];
  const seriesTotal = (selectedBays.length && formData.start_time)
    ? recurringDates.reduce((sum, d) => sum + sessionCostFor(d), 0)
    : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (formData.simulator_ids.length === 0) {
      alert("Please select at least one bay.");
      return;
    }

    if (!formData.reservation_type) {
      alert("Please select a reservation type.");
      return;
    }

    setIsSubmitting(true);

    try {
      const endTime = calculateEndTime(formData.start_time, formData.duration_hours);
      const [nsH, nsM] = formData.start_time.split(':').map(Number);
      const [neH, neM] = endTime.split(':').map(Number);
      const newStartMins = nsH * 60 + nsM;
      const newEndMins = neH * 60 + neM;
      const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && aEnd > bStart;

      const hasBookingConflict = (formattedDate, bayId) =>
        existingBookings.some(booking => {
          if (booking.simulator_id !== bayId) return false;
          if (booking.booking_date !== formattedDate) return false;
          if (booking.status === 'cancelled') return false;
          const [bsH, bsM] = booking.start_time.split(':').map(Number);
          const [beH, beM] = booking.end_time.split(':').map(Number);
          return overlaps(newStartMins, newEndMins, bsH * 60 + bsM, beH * 60 + beM);
        });

      const hasBlockConflict = (formattedDate, bayId) =>
        existingBlocks.some(block => {
          if (block.simulator_id !== bayId) return false;
          if (block.block_date !== formattedDate) return false;
          const [bsH, bsM] = block.start_time.split(':').map(Number);
          const [beH, beM] = block.end_time.split(':').map(Number);
          return overlaps(newStartMins, newEndMins, bsH * 60 + bsM, beH * 60 + beM);
        });

      const buildBookingData = (formattedDate, cost, bay) => ({
        simulator_id: bay.id,
        simulator_name: bay.name,
        location: location,
        customer_name: formData.customer_name,
        customer_email: formData.customer_email,
        customer_phone: formData.customer_phone,
        booking_date: formattedDate,
        start_time: formData.start_time,
        end_time: endTime,
        duration_hours: formData.duration_hours,
        total_cost: cost,
        number_of_players: formData.number_of_players,
        reservation_type: formData.reservation_type,
        payment_method: formData.payment_method,
        payment_status: formData.payment_status,
        status: "confirmed",
        notes: formData.notes,
        bay_locked: formData.bay_locked
      });

      // For a single bay on a single date, keep the original specific messages.
      if (!formData.is_recurring && selectedBays.length === 1) {
        const bay = selectedBays[0];
        const formattedDate = format(formData.booking_date, "yyyy-MM-dd");
        if (hasBookingConflict(formattedDate, bay.id)) {
          alert("This time slot conflicts with an existing booking. Please choose a different time.");
          setIsSubmitting(false);
          return;
        }
        if (hasBlockConflict(formattedDate, bay.id)) {
          alert("This time slot is blocked. Please choose a different time.");
          setIsSubmitting(false);
          return;
        }
      }

      const dates = formData.is_recurring ? recurringDates : [formData.booking_date];

      const created = [];
      const skipped = [];
      // Bookings created for the first successful session, used to build a single
      // confirmation that lists every bay booked for that session.
      let firstSessionKey = null;
      const firstSessionBookings = [];

      for (const d of dates) {
        const formattedDate = format(d, "yyyy-MM-dd");
        // Create one reservation per selected bay for this date.
        for (const bay of selectedBays) {
          // Skip any bay/date that collides with a booking or a block.
          if (hasBookingConflict(formattedDate, bay.id) || hasBlockConflict(formattedDate, bay.id)) {
            skipped.push(`${getBayDisplayName(bay.name, location)} on ${format(d, "EEE MMM d")}`);
            continue;
          }
          const cost = calculateRate(formattedDate, formData.start_time, bay) * formData.duration_hours;
          const bookingData = buildBookingData(formattedDate, cost, bay);
          await Booking.create(bookingData);
          created.push(formattedDate);
          if (firstSessionKey === null) firstSessionKey = formattedDate;
          if (formattedDate === firstSessionKey) firstSessionBookings.push({ bay, cost, bookingData });
        }
      }

      if (created.length === 0) {
        alert("No reservations were created — every selected bay conflicts with an existing booking or block.");
        setIsSubmitting(false);
        return;
      }

      // Send ONE confirmation for the first session, summarizing every bay booked
      // for that session (so a multi-bay party or a recurring series gets a single
      // email/text, not one per bay or per week). sendBookingConfirmation resolves
      // with { success: false } (rather than throwing) on failure, so we inspect
      // the result and surface any failure to the admin — this way a manually
      // booked customer never silently goes without a confirmation email.
      let emailFailed = false;
      if (firstSessionBookings.length > 0) {
        const bayNames = firstSessionBookings
          .map(({ bay }) => getBayDisplayName(bay.name, location))
          .join(", ");
        const sessionCost = firstSessionBookings.reduce((sum, b) => sum + b.cost, 0);
        const confirmationData = {
          ...firstSessionBookings[0].bookingData,
          simulator_name: bayNames,
          total_cost: sessionCost
        };
        const [emailResult] = await Promise.all([
          sendBookingConfirmation(confirmationData).catch((err) => {
            console.error("Confirmation email failed:", err);
            return { success: false, error: err };
          }),
          sendBookingConfirmationSMS(confirmationData).catch((err) =>
            console.error("Confirmation SMS failed:", err)
          )
        ]);
        emailFailed = !emailResult || emailResult.success === false;
      }

      const emailAddr = formData.customer_email || "the customer";

      // Show a summary whenever more than one reservation could have been created
      // (multiple bays and/or a recurring series); otherwise keep the quiet
      // single-booking flow (only speak up if the email failed).
      if (selectedBays.length > 1 || formData.is_recurring) {
        let msg = `Created ${created.length} reservation${created.length === 1 ? "" : "s"}.`;
        if (skipped.length) {
          msg += `\n\nSkipped ${skipped.length} due to conflicts:\n${skipped.join(", ")}`;
        }
        msg += emailFailed
          ? `\n\n⚠️ The confirmation email could NOT be sent to ${emailAddr}. Please double-check the email address and follow up with the customer.`
          : `\n\nOne confirmation was sent to the customer.`;
        alert(msg);
      } else if (emailFailed) {
        alert(`Reservation created — but the confirmation email could NOT be sent to ${emailAddr}. Please double-check the email address and follow up with the customer.`);
      }

      onComplete();
    } catch (error) {
      console.error("Error creating booking:", error);
      alert("Error creating booking. Please try again.");
    }
    setIsSubmitting(false);
  };

  // Sort simulators: Bay 1-9, then VIP 1-2
  const sortedSimulators = [...simulators].sort((a, b) => {
    return getBaySortOrder(a.name) - getBaySortOrder(b.name);
  });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Manual Booking</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Date Selection */}
        <div className="space-y-2">
          <Label>Booking Date *</Label>
          <div className="flex justify-center">
            <Calendar
              mode="single"
              selected={formData.booking_date}
              onSelect={(date) => setFormData({...formData, booking_date: date})}
              className="rounded-xl border-2 border-emerald-100"
            />
          </div>
        </div>

        {/* Bay Selection — admins can pick more than one bay at a time. */}
        <div className="space-y-2">
          <Label>
            Select Bays <span className="text-red-500">*</span>{" "}
            <span className="text-xs font-normal text-slate-500">(choose one or more)</span>
          </Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {sortedSimulators.map(bay => {
              const checked = formData.simulator_ids.includes(bay.id);
              return (
                <button
                  type="button"
                  key={bay.id}
                  onClick={() => toggleBay(bay.id)}
                  className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2.5 text-left transition-colors ${
                    checked
                      ? "border-[#2d5567] bg-[#2d5567]/10"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <Checkbox checked={checked} className="pointer-events-none" />
                  <span className="text-sm font-medium text-slate-800">
                    {getBayDisplayName(bay.name, location)}{bay.bay_type === "vip" ? " · VIP" : ""}
                  </span>
                </button>
              );
            })}
          </div>
          {formData.simulator_ids.length > 0 && (
            <p className="text-xs text-slate-500">
              {formData.simulator_ids.length} bay{formData.simulator_ids.length === 1 ? "" : "s"} selected
            </p>
          )}
        </div>

        {/* Time and Duration */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="start-time">Start Time *</Label>
            <Select 
              value={formData.start_time} 
              onValueChange={(value) => setFormData({...formData, start_time: value})}
            >
              <SelectTrigger className="h-12">
                <SelectValue placeholder="Choose time" />
              </SelectTrigger>
              <SelectContent>
                {TIME_SLOTS.map(time => (
                  <SelectItem key={time.value} value={time.value}>
                    {time.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="duration">Duration *</Label>
            <Select 
              value={String(formData.duration_hours)} 
              onValueChange={(value) => setFormData({...formData, duration_hours: Number(value)})}
            >
              <SelectTrigger className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATIONS.map(d => (
                  <SelectItem key={d.value} value={String(d.value)}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Customer Info */}
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="name">Customer Name *</Label>
              {showCustList && (
                <button
                  type="button"
                  onClick={() => { setShowCustList(false); }}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  Hide suggestions
                </button>
              )}
            </div>
            <Input
              id="name"
              value={formData.customer_name}
              onChange={(e) => setFormData({...formData, customer_name: e.target.value})}
              autoComplete="off"
              placeholder="Start typing a name to search saved customers"
              required
              className="h-12"
            />
            {/* Inline suggestions panel — rendered in normal flow so the modal's
                scroll container can never clip it. */}
            {showCustList && (
              <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
                {custLoading && (
                  <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin" /> Searching saved customers…
                  </div>
                )}
                {!custLoading && custMatches.length > 0 && (
                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                    {custMatches.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => applyCustomer(c)}
                        className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center gap-2 font-semibold text-slate-800">
                          <User className="w-4 h-4 text-[#2d5567]" />
                          {c.full_name || <span className="text-slate-400">(no name)</span>}
                        </div>
                        <div className="mt-1 flex flex-col gap-0.5 text-sm text-slate-500 pl-6">
                          {c.email && (
                            <span className="flex items-center gap-1.5">
                              <Mail className="w-3.5 h-3.5" /> {c.email}
                            </span>
                          )}
                          {c.phone && (
                            <span className="flex items-center gap-1.5">
                              <Phone className="w-3.5 h-3.5" /> {fmtPhone(c.phone)}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {!custLoading && custSearched && custMatches.length === 0 && (
                  <div className="px-4 py-3 text-sm text-slate-500">
                    No saved customer found — this will be added as a new customer.
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={formData.customer_email}
                onChange={(e) => setFormData({...formData, customer_email: e.target.value})}
                required
                className="h-12"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone *</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.customer_phone}
                onChange={(e) => setFormData({...formData, customer_phone: e.target.value})}
                required
                className="h-12"
              />
            </div>
          </div>
        </div>

        {/* Reservation type — required so the schedule colors it correctly */}
        <div className="space-y-2">
          <Label htmlFor="reservation-type">
            Reservation Type <span className="text-red-500">*</span>
          </Label>
          <Select
            value={formData.reservation_type}
            onValueChange={(value) => setFormData({ ...formData, reservation_type: value })}
          >
            <SelectTrigger id="reservation-type" className="h-12">
              <SelectValue placeholder="Select reservation type" />
            </SelectTrigger>
            <SelectContent>
              {RESERVATION_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Players and Payment */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="players">Number of Players</Label>
            <Input
              id="players"
              type="number"
              min="1"
              value={formData.number_of_players}
              onChange={(e) => setFormData({...formData, number_of_players: parseInt(e.target.value) || 1})}
              className="h-12"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment-status">Payment Status</Label>
            <Select 
              value={formData.payment_status} 
              onValueChange={(value) => setFormData({...formData, payment_status: value})}
            >
              <SelectTrigger className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="notes">Notes (Optional)</Label>
          <Textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => setFormData({...formData, notes: e.target.value})}
            rows={3}
          />
        </div>

        {/* Bay preference (lock) */}
        <div className="flex items-start space-x-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
          <Checkbox
            id="bay-locked"
            checked={formData.bay_locked}
            onCheckedChange={(checked) => setFormData({ ...formData, bay_locked: !!checked })}
            className="mt-1"
          />
          <div className="flex-1">
            <Label htmlFor="bay-locked" className="font-semibold text-slate-800 cursor-pointer">
              Customer prefers this bay
            </Label>
            <p className="text-sm text-slate-600 mt-1 leading-relaxed">
              Lock these reservations to their selected bays. When checked, the Smart
              Schedule Optimizer will never move them to a different bay.
            </p>
          </div>
        </div>

        {/* Recurring reservation */}
        <div className="space-y-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
          <div className="flex items-start space-x-3">
            <Checkbox
              id="is-recurring"
              checked={formData.is_recurring}
              onCheckedChange={(checked) => setFormData({ ...formData, is_recurring: !!checked })}
              className="mt-1"
            />
            <div className="flex-1">
              <Label htmlFor="is-recurring" className="font-semibold text-slate-800 cursor-pointer flex items-center gap-2">
                <Repeat className="w-4 h-4 text-[#2d5567]" />
                Create recurring reservation
              </Label>
              <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                Book these same bays, time, and duration on a repeating schedule — great for leagues and regulars.
              </p>
            </div>
          </div>

          {formData.is_recurring && (
            <div className="pl-8 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Repeats</Label>
                  <Select
                    value={formData.recurrence_frequency}
                    onValueChange={(v) => setFormData({ ...formData, recurrence_frequency: v })}
                  >
                    <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Every 2 weeks</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rec-count">Number of sessions</Label>
                  <Input
                    id="rec-count"
                    type="number"
                    min="1"
                    max="52"
                    value={formData.recurrence_count}
                    onChange={(e) => setFormData({ ...formData, recurrence_count: e.target.value })}
                    className="h-12"
                  />
                </div>
              </div>
              {recurringDates.length > 0 && (
                <div className="text-sm bg-white rounded-lg border border-slate-200 p-3">
                  <p className="font-semibold text-slate-800">
                    {recurringDates.length} session{recurringDates.length === 1 ? "" : "s"}:
                  </p>
                  <p className="text-slate-600">
                    {format(recurringDates[0], "EEE, MMM d, yyyy")} → {format(recurringDates[recurringDates.length - 1], "EEE, MMM d, yyyy")}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Any dates that conflict with an existing booking or block are skipped automatically.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Total Cost Display */}
        {totalCost > 0 && (
          <div className="p-4 bg-emerald-50 rounded-lg space-y-1">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-lg">
                {formData.is_recurring
                  ? `Cost per session${selectedBays.length > 1 ? ` (${selectedBays.length} bays)` : ""}:`
                  : `Total Cost${selectedBays.length > 1 ? ` (${selectedBays.length} bays)` : ""}:`}
              </span>
              <span className="text-2xl font-bold text-[#2d5567]">${totalCost.toFixed(2)}</span>
            </div>
            {formData.is_recurring && recurringDates.length > 0 && (
              <div className="flex justify-between items-center pt-2 border-t border-emerald-200">
                <span className="font-semibold text-sm text-slate-700">
                  Estimated series total ({recurringDates.length} session{recurringDates.length === 1 ? "" : "s"} × {selectedBays.length} bay{selectedBays.length === 1 ? "" : "s"}):
                </span>
                <span className="text-lg font-bold text-[#2d5567]">${seriesTotal.toFixed(2)}</span>
              </div>
            )}
          </div>
        )}

        {/* Submit Buttons */}
        <div className="flex gap-3 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="flex-1 h-12"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || formData.simulator_ids.length === 0 || !formData.start_time}
            className="flex-1 h-12 bg-[#2d5567] hover:bg-[#1e3a47]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              (() => {
                const n = (formData.is_recurring ? recurringDates.length : 1) * (formData.simulator_ids.length || 1);
                return `Create ${n} Booking${n === 1 ? "" : "s"}`;
              })()
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
