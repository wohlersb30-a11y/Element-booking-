import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { X, Sparkles, Loader2, CheckCircle2, Clock, Tag, AlertCircle, ChevronLeft } from "lucide-react";
import { format } from "date-fns";
import { computeTax } from "@/config/tax";
import { trackInitiateCheckout } from "@/lib/metaPixel";
import { getBayDisplayName } from "@/lib/bayNames";

const ALL_TIME_SLOTS = [
  "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00",
  "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00"
];

const formatTimeLabel = (value) => {
  const [h, m] = value.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
};

const toMinutes = (t) => {
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + m;
};

const calculateEndTime = (startTime, duration) => {
  const total = toMinutes(startTime) + duration * 60;
  const endHours = Math.floor(total / 60);
  const endMinutes = total % 60;
  return `${endHours.toString().padStart(2, "0")}:${endMinutes.toString().padStart(2, "0")}`;
};

// Same overlap logic the rest of the app uses to decide if a bay is free.
const isBayAvailable = (bay, date, startTime, duration, existingBookings) => {
  const startMins = toMinutes(startTime);
  const endMins = startMins + duration * 60;
  return !existingBookings.some((booking) => {
    if (booking.simulator_id !== bay.id) return false;
    if (booking.booking_date !== date) return false;
    if (booking.status === "cancelled") return false;
    return startMins < toMinutes(booking.end_time) && endMins > toMinutes(booking.start_time);
  });
};

export default function SpecialsModal({
  specials,
  location,
  allBays,
  allBookings,
  customerName,
  customerEmail,
  customerPhone,
  onClose
}) {
  const [selectedSpecial, setSelectedSpecial] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [selectedHours, setSelectedHours] = useState(1);
  const [selectedBayId, setSelectedBayId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Contact details. Seeded from the booking page if the customer already
  // entered them there, but editable here so the specials flow is self-contained
  // (the "View Specials" button sits above the main contact form, so these are
  // usually empty when the modal opens).
  const [contactName, setContactName] = useState(customerName || "");
  const [contactEmail, setContactEmail] = useState(customerEmail || "");
  const [contactPhone, setContactPhone] = useState(customerPhone || "");

  // Pricing mode: 'hourly' specials let the customer pick how many hours
  // (bounded by min_hours..max_hours) and bill price_per_hour * chosen hours.
  // 'flat' specials keep the fixed price + fixed duration_hours (legacy behavior).
  const isHourly = selectedSpecial?.pricing_mode === "hourly";
  const minHours = Number(selectedSpecial?.min_hours) || 1;
  const maxHours = Number(selectedSpecial?.max_hours) || 4;
  const hourChoices = useMemo(() => {
    const out = [];
    for (let h = minHours; h <= maxHours; h++) out.push(h);
    return out.length ? out : [1];
  }, [minHours, maxHours]);
  const effectiveDuration = isHourly ? selectedHours : Number(selectedSpecial?.duration_hours) || 1;
  const effectivePrice = isHourly
    ? (Number(selectedSpecial?.price_per_hour) || 0) * selectedHours
    : Number(selectedSpecial?.price) || 0;

  // Time slots constrained to the special's allowed start-time window.
  const availableTimes = useMemo(() => {
    if (!selectedSpecial) return [];
    const winStart = toMinutes(selectedSpecial.window_start || "09:00");
    const winEnd = toMinutes(selectedSpecial.window_end || "22:00");
    return ALL_TIME_SLOTS.filter((t) => {
      const m = toMinutes(t);
      return m >= winStart && m <= winEnd;
    });
  }, [selectedSpecial]);

  // Days the special is valid (0=Sun..6=Sat). Empty/null = any day.
  const dayAllowed = (date) => {
    if (!selectedSpecial?.days_of_week || selectedSpecial.days_of_week.length === 0) return true;
    return selectedSpecial.days_of_week.includes(date.getDay());
  };

  // Bays at this location that are free for the chosen date/time/duration.
  // This is the SAME overlap check the regular booking flow uses against the
  // shared `bookings` table, so specials and regular bookings can never sit on
  // the same bay/time. (The DB also enforces a no-overlap exclusion constraint
  // as a final backstop.)
  const availableBays = useMemo(() => {
    if (!selectedDate || !selectedTime) return [];
    const formattedDate = format(selectedDate, "yyyy-MM-dd");
    return allBays
      .filter((b) => b.location === location)
      .filter((bay) =>
        isBayAvailable(bay, formattedDate, selectedTime, effectiveDuration, allBookings)
      );
  }, [selectedDate, selectedTime, effectiveDuration, allBays, allBookings, location]);

  // Drop the chosen bay if it is no longer in the available set (e.g. the
  // customer changed the time or number of hours).
  React.useEffect(() => {
    if (selectedBayId && !availableBays.some((b) => b.id === selectedBayId)) {
      setSelectedBayId(null);
    }
  }, [availableBays, selectedBayId]);

  const handleSelectSpecial = (special) => {
    setSelectedSpecial(special);
    setSelectedDate(null);
    setSelectedTime(null);
    setSelectedBayId(null);
    setSelectedHours(Number(special?.min_hours) || 1);
    setError("");
  };

  const handleClaim = async () => {
    setError("");
    if (!selectedDate || !selectedTime) {
      setError("Please choose a date and time for your special.");
      return;
    }
    if (!selectedBayId) {
      setError("Please choose an available bay.");
      return;
    }
    if (!contactName.trim() || !contactEmail.trim() || !contactPhone.trim()) {
      setError("Please enter your name, email, and phone below.");
      return;
    }

    const duration = effectiveDuration;
    const amount = effectivePrice;
    const formattedDate = format(selectedDate, "yyyy-MM-dd");
    const endTime = calculateEndTime(selectedTime, duration);

    // Use the bay the customer chose, and re-check it is still free right before
    // checkout (guards against another booking landing on it in the meantime).
    const openBay = allBays.find((b) => b.id === selectedBayId);
    if (
      !openBay ||
      openBay.location !== location ||
      !isBayAvailable(openBay, formattedDate, selectedTime, duration, allBookings)
    ) {
      setError("Sorry, that bay was just taken. Please pick another bay or time.");
      setSelectedBayId(null);
      return;
    }

    setIsSubmitting(true);
    try {
      const appDomain = window.location.origin;
      const result = await base44.functions.invoke("createStripeCheckout", {
        amount,
        customerEmail: contactEmail.trim(),
        customerName: contactName.trim(),
        bookingData: {
          selectedBays: [
            {
              bayId: openBay.id,
              bayName: openBay.name,
              cost: amount
            }
          ],
          location,
          customerName: contactName.trim(),
          customerEmail: contactEmail.trim(),
          customerPhone: contactPhone.trim(),
          date: formattedDate,
          time: selectedTime,
          endTime,
          duration,
          playerCount: 1,
          notes: `Special: ${selectedSpecial.title}${isHourly ? ` (${duration} hr @ $${(Number(selectedSpecial.price_per_hour) || 0).toFixed(2)}/hr)` : ""}${selectedSpecial.includes ? ` — Includes: ${selectedSpecial.includes}` : ""}`,
          specialId: selectedSpecial.id,
          totalCost: amount
        },
        successUrl: `${appDomain}/PaymentSuccess?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${appDomain}/BookSimulator`
      });

      if (result.data && result.data.url) {
        trackInitiateCheckout({
          value: computeTax(amount, location).total,
          contentType: "booking",
          numItems: 1
        });
        if (window.top) {
          window.top.location.href = result.data.url;
        } else {
          window.location.href = result.data.url;
        }
      } else {
        const serverErr = result?.data?.error || result?.error?.message || result?.error;
        setError(serverErr ? `Could not start checkout: ${serverErr}` : "Failed to start checkout. Please try again.");
        setIsSubmitting(false);
      }
    } catch (e) {
      console.error("Special checkout error:", e);
      setError("Error: " + (e.message || "Please try again"));
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-6 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <Sparkles className="w-7 h-7 text-white" />
            <div>
              <h2 className="text-2xl font-black text-white heading-font">Specials</h2>
              <p className="text-amber-50 text-sm">Claim a limited-time offer</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/20">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="p-6">
          {error && (
            <Alert className="mb-4 bg-red-50 border-red-200">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">{error}</AlertDescription>
            </Alert>
          )}

          {/* Step 1: choose a special */}
          {!selectedSpecial && (
            <>
              {specials.length === 0 ? (
                <div className="text-center py-12">
                  <Tag className="w-14 h-14 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-700 text-lg font-semibold">No specials available right now</p>
                  <p className="text-slate-500">Check back soon for new offers.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {specials.map((special) => (
                    <Card
                      key={special.id}
                      className="border-2 border-amber-200 hover:border-amber-400 transition-colors cursor-pointer"
                      onClick={() => handleSelectSpecial(special)}
                    >
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <h3 className="text-xl font-bold text-slate-800 mb-1">{special.title}</h3>
                            {special.description && (
                              <p className="text-slate-600 text-sm mb-2">{special.description}</p>
                            )}
                            {special.includes && (
                              <p className="text-sm text-slate-700">
                                <span className="font-semibold">Includes:</span> {special.includes}
                              </p>
                            )}
                            <div className="flex items-center gap-3 mt-3 text-sm text-slate-500">
                              <span className="flex items-center gap-1">
                                <Clock className="w-4 h-4" />
                                {special.pricing_mode === "hourly"
                                  ? `${Number(special.min_hours) || 1}–${Number(special.max_hours) || 4} hr`
                                  : `${special.duration_hours} hr`}
                              </span>
                              <span>
                                {formatTimeLabel(special.window_start || "09:00")}–
                                {formatTimeLabel(special.window_end || "22:00")}
                              </span>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="text-3xl font-black text-amber-600">
                              ${Number(
                                special.pricing_mode === "hourly" ? special.price_per_hour : special.price
                              ).toFixed(0)}
                              {special.pricing_mode === "hourly" && (
                                <span className="text-base font-bold">/hr</span>
                              )}
                            </div>
                            <Button size="sm" className="mt-2 bg-amber-500 hover:bg-amber-600">
                              Claim
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Step 2: pick date + time, then checkout */}
          {selectedSpecial && (
            <div className="space-y-5">
              <Button
                variant="ghost"
                onClick={() => setSelectedSpecial(null)}
                className="text-slate-600 -ml-2"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back to specials
              </Button>

              <Card className="border-2 border-amber-300 bg-amber-50/50">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-slate-800">{selectedSpecial.title}</h3>
                    <p className="text-sm text-slate-600">
                      {isHourly
                        ? `${effectiveDuration} hr @ $${(Number(selectedSpecial.price_per_hour) || 0).toFixed(0)}/hr`
                        : `${selectedSpecial.duration_hours} hr`}
                      {selectedSpecial.includes ? ` • ${selectedSpecial.includes}` : ""}
                    </p>
                  </div>
                  <div className="text-2xl font-black text-amber-600">
                    ${effectivePrice.toFixed(0)}
                  </div>
                </CardContent>
              </Card>

              {isHourly && (
                <div className="space-y-3">
                  <Label className="text-base font-bold text-slate-700">How many hours?</Label>
                  <Select
                    value={String(selectedHours)}
                    onValueChange={(v) => setSelectedHours(Number(v))}
                  >
                    <SelectTrigger className="h-14 text-base rounded-xl border-2 border-slate-200">
                      <SelectValue placeholder="Choose hours" />
                    </SelectTrigger>
                    <SelectContent>
                      {hourChoices.map((h) => (
                        <SelectItem key={h} value={String(h)} className="text-base py-3">
                          {h} {h === 1 ? "hour" : "hours"} — ${((Number(selectedSpecial.price_per_hour) || 0) * h).toFixed(0)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-3">
                <Label className="text-base font-bold text-slate-700">Select Date</Label>
                <div className="flex justify-center bg-slate-50 rounded-xl p-3">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(d) => {
                      setSelectedDate(d);
                      setSelectedTime(null);
                    }}
                    disabled={(date) =>
                      date < new Date(new Date().setHours(0, 0, 0, 0)) || !dayAllowed(date)
                    }
                    className="rounded-xl border-2 border-amber-200"
                  />
                </div>
                {selectedSpecial.days_of_week && selectedSpecial.days_of_week.length > 0 && (
                  <p className="text-xs text-slate-500 text-center">
                    This special is only valid on selected days.
                  </p>
                )}
              </div>

              {selectedDate && (
                <div className="space-y-3">
                  <Label className="text-base font-bold text-slate-700">Start Time</Label>
                  <Select value={selectedTime || ""} onValueChange={setSelectedTime}>
                    <SelectTrigger className="h-14 text-base rounded-xl border-2 border-slate-200">
                      <SelectValue placeholder="Choose start time" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTimes.map((t) => (
                        <SelectItem key={t} value={t} className="text-base py-3">
                          {formatTimeLabel(t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedDate && selectedTime && (
                <div className="space-y-3">
                  <Label className="text-base font-bold text-slate-700">Choose Your Bay</Label>
                  {availableBays.length === 0 ? (
                    <Alert className="bg-amber-50 border-amber-200">
                      <AlertCircle className="h-4 w-4 text-amber-600" />
                      <AlertDescription className="text-amber-800">
                        No open bays for that time and duration. Please pick another time
                        {isHourly ? ", fewer hours," : ""} or date.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {availableBays.map((bay) => {
                        const active = selectedBayId === bay.id;
                        return (
                          <button
                            key={bay.id}
                            type="button"
                            onClick={() => setSelectedBayId(bay.id)}
                            className={`h-14 rounded-xl border-2 font-semibold text-sm transition-colors ${
                              active
                                ? "border-amber-500 bg-amber-500 text-white"
                                : "border-slate-200 bg-white text-slate-700 hover:border-amber-300"
                            }`}
                          >
                            {getBayDisplayName(bay.name, location)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <p className="text-xs text-slate-500">
                    Only bays that are open for your selected time are shown, so specials
                    never overlap with other bookings.
                  </p>
                </div>
              )}

              {selectedBayId && (
                <div className="space-y-3">
                  <Label className="text-base font-bold text-slate-700">Your Details</Label>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Input
                      placeholder="Full name"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      className="h-12 rounded-xl border-2 border-slate-200"
                    />
                    <Input
                      type="email"
                      placeholder="Email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      className="h-12 rounded-xl border-2 border-slate-200"
                    />
                    <Input
                      type="tel"
                      placeholder="Phone"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      className="h-12 rounded-xl border-2 border-slate-200"
                    />
                  </div>
                </div>
              )}

              {error && (
                <Alert className="bg-red-50 border-red-200">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800">{error}</AlertDescription>
                </Alert>
              )}

              <Button
                onClick={handleClaim}
                disabled={isSubmitting || !selectedDate || !selectedTime || !selectedBayId}
                className="w-full h-14 text-lg font-bold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 rounded-xl"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5 mr-2" />
                    Claim Special &amp; Continue to Payment
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
