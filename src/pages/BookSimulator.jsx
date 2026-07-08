
import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, Loader2, AlertCircle, Sparkles, Shield, DollarSign, Tag, Clock } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Checkbox } from "@/components/ui/checkbox";
import { computeTax } from "@/config/tax";
import { isPeakSlot, coveringKinds } from "@/config/hourPackages";

import TimeSelectionForm from "../components/booking/TimeSelectionForm";
import PlayerCountInput from "../components/booking/PlayerCountInput";
import NotesInput from "../components/booking/NotesInput";
import AvailableBayCard from "../components/booking/AvailableBayCard";
import BookingSummaryNew from "../components/booking/BookingSummaryNew";
import LocationSelector from "../components/booking/LocationSelector";
import WaitlistForm from "../components/booking/WaitlistForm";
import SpecialsModal from "../components/booking/SpecialsModal";

const calculateRate = (date, startTime, bayType, simulator) => {
  const bookingDate = new Date(date);
  const dayOfWeek = bookingDate.getDay();
  const hour = parseInt(startTime.split(':')[0]);
  
  const isFridayAfter3pm = dayOfWeek === 5 && hour >= 15;
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isPeakTime = isFridayAfter3pm || isWeekend;
  
  // Check if there's a date-specific pricing rule for this date
  if (simulator && simulator.pricing_rules && simulator.pricing_rules.length > 0) {
    for (const rule of simulator.pricing_rules) {
      const ruleStart = new Date(rule.start_date);
      const ruleEnd = new Date(rule.end_date);
      
      // Ensure we compare dates without time components for the range check
      const bookingDateOnly = new Date(bookingDate.getFullYear(), bookingDate.getMonth(), bookingDate.getDate());
      const ruleStartOnly = new Date(ruleStart.getFullYear(), ruleStart.getMonth(), ruleStart.getDate());
      const ruleEndOnly = new Date(ruleEnd.getFullYear(), ruleEnd.getMonth(), ruleEnd.getDate());

      if (bookingDateOnly >= ruleStartOnly && bookingDateOnly <= ruleEndOnly) {
        // Found a matching date range, use its pricing
        return isPeakTime ? rule.peak_rate : rule.off_peak_rate;
      }
    }
  }
  
  // Use simulator's default pricing if available
  if (simulator && simulator.pricing_off_peak !== undefined && simulator.pricing_peak !== undefined) {
    return isPeakTime ? simulator.pricing_peak : simulator.pricing_off_peak;
  }
  
  // Fallback to hardcoded defaults
  if (bayType === "vip") {
    return isPeakTime ? 85 : 65;
  } else {
    return isPeakTime ? 60 : 50;
  }
};

const isBayAvailable = (bay, date, startTime, duration, existingBookings) => {
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const startTotalMinutes = startHour * 60 + startMinute;
  const endTotalMinutes = startTotalMinutes + (duration * 60);
  
  const hasConflict = existingBookings.some(booking => {
    if (booking.simulator_id !== bay.id) return false;
    if (booking.booking_date !== date) return false;
    if (booking.status === "cancelled") return false;
    
    const [bookingStartHour, bookingStartMinute] = booking.start_time.split(':').map(Number);
    const [bookingEndHour, bookingEndMinute] = booking.end_time.split(':').map(Number);
    const bookingStartMinutes = bookingStartHour * 60 + bookingStartMinute;
    const bookingEndMinutes = bookingEndHour * 60 + bookingEndMinute;
    
    return (startTotalMinutes < bookingEndMinutes && endTotalMinutes > bookingStartMinutes);
  });
  
  return !hasConflict;
};

const calculateEndTime = (startTime, duration) => {
  const [hours, minutes] = startTime.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + (duration * 60);
  const endHours = Math.floor(totalMinutes / 60);
  const endMinutes = totalMinutes % 60;
  return `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
};

// --- time helpers for the "closest available slot" search ---
const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const toHHMM = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
// Human-friendly 12-hour label, e.g. "6:30 PM".
const formatTimeLabel = (hhmm) => {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
};

// Maps the raw DB bay names to the customer-facing "Bay N" labels so that
// ordering follows what the customer actually sees (Bay 1..9), not the raw
// East/West/South/North suffix numbers. Keep in sync with AvailableBayCard.
const BAY_DISPLAY_MAP = {
  "East 1": "Bay 1",
  "East 2": "Bay 2",
  "West 1": "Bay 3",
  "West 2": "Bay 4",
  "West 3": "Bay 5",
  "South 1": "Bay 6",
  "South 2": "Bay 7",
  "North 1": "Bay 8",
  "North 2": "Bay 9",
  "VIP 1": "VIP 1",
  "VIP 2": "VIP 2"
};
const getBayDisplayName = (name) => BAY_DISPLAY_MAP[name] || name || "";

// Treat anything flagged vip OR named "VIP ..." as a VIP bay.
const isVIPBay = (bay) => bay.bay_type === "vip" || /vip/i.test(bay.name || "");

// Sort key: standard bays before VIP, then by the number in the DISPLAY name
// (so the customer sees Bay 1, Bay 2, ... Bay 9 in order, then VIP 1, VIP 2).
const bayOrder = (bay) => {
  const match = getBayDisplayName(bay.name).match(/\d+/);
  return { isVIP: isVIPBay(bay), num: match ? parseInt(match[0], 10) : 9999 };
};

export default function BookSimulator() {
  const navigate = useNavigate();
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [allBays, setAllBays] = useState([]);
  const [allBookings, setAllBookings] = useState([]);
  const [allSpecials, setAllSpecials] = useState([]);
  const [showSpecials, setShowSpecials] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  // The time we actually found availability for. Equals selectedTime when the
  // exact requested slot is open; otherwise it's the closest available start.
  const [bookingTime, setBookingTime] = useState(null);
  const [timeAdjusted, setTimeAdjusted] = useState(false);
  const [duration, setDuration] = useState(1);
  const [playerCount, setPlayerCount] = useState(1);
  const [notes, setNotes] = useState("");
  const [availableBays, setAvailableBays] = useState([]);
  const [selectedBays, setSelectedBays] = useState([]);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [agreedToHold, setAgreedToHold] = useState(false);
  // When checked, the customer wants to stay on this exact bay; the smart
  // optimizer will never move them. Default off so we can consolidate the
  // schedule and open up more availability.
  const [preferBay, setPreferBay] = useState(false);
  // Popup shown right after a bay is selected, asking the customer whether they
  // want to add more bays or jump straight to the booking details.
  const [showBayChoice, setShowBayChoice] = useState(false);
  // Banked-hours balance for the signed-in customer at the selected location,
  // { peak, off_peak }. Enables the "Use banked hours" checkout option.
  const [bankedBalance, setBankedBalance] = useState({ peak: 0, off_peak: 0 });
  const [bankedBusy, setBankedBusy] = useState(false);
  // Lets us jump the customer straight to the booking details once they pick a
  // bay, instead of forcing them to scroll past the whole list of bay cards.
  const detailsRef = useRef(null);

  const scrollToDetails = () => {
    setTimeout(() => {
      detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Load the customer's banked-hours balance for the selected location so we can
  // offer "Use banked hours" at checkout. RLS scopes the ledger to this user.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!customerEmail || !selectedLocation) {
        setBankedBalance({ peak: 0, off_peak: 0 });
        return;
      }
      try {
        const txns = await base44.entities.HourTransaction.filter({
          user_email: customerEmail.toLowerCase(),
          location: selectedLocation
        });
        const bal = { peak: 0, off_peak: 0 };
        for (const t of txns || []) {
          bal[t.kind === "peak" ? "peak" : "off_peak"] += Number(t.hours || 0);
        }
        if (!cancelled) setBankedBalance(bal);
      } catch (e) {
        if (!cancelled) setBankedBalance({ peak: 0, off_peak: 0 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerEmail, selectedLocation, showSuccess]);

  // Can the single selected bay's booking be fully covered by banked hours?
  const bankedEligible = (() => {
    if (selectedBays.length !== 1) return false;
    if (!selectedDate || !(bookingTime || selectedTime)) return false;
    const t = bookingTime || selectedTime;
    const peak = isPeakSlot(format(selectedDate, "yyyy-MM-dd"), t);
    const usable = coveringKinds(peak).reduce((s, k) => s + Math.max(0, bankedBalance[k]), 0);
    return usable + 1e-9 >= duration;
  })();

  // Book the single selected bay using prepaid banked hours instead of a card
  // hold. Standard bays complete immediately; VIP bays redirect to pay only the
  // surcharge.
  const handleBankedBooking = async () => {
    if (selectedBays.length !== 1) {
      alert("Banked hours apply to a single-bay booking. Please select just one bay.");
      return;
    }
    setBankedBusy(true);
    try {
      const bay = selectedBays[0].bay;
      const effectiveTime = bookingTime || selectedTime;
      const formattedDate = format(selectedDate, "yyyy-MM-dd");
      const endTime = calculateEndTime(effectiveTime, duration);
      const appDomain = window.location.origin;

      const res = await base44.functions.invoke("bookWithBankedHours", {
        simulatorId: bay.id,
        location: selectedLocation,
        bookingDate: formattedDate,
        startTime: effectiveTime,
        endTime,
        durationHours: duration,
        playerCount,
        notes,
        customerName,
        customerPhone,
        successUrl: `${appDomain}/PaymentSuccess?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${appDomain}/BookSimulator`
      });
      const d = res.data || {};

      if (d.needsSurcharge && d.url) {
        if (window.top) window.top.location.href = d.url;
        else window.location.href = d.url;
        return;
      }
      if (d.success) {
        setShowSuccess(true);
        navigate("/MyReservations");
        return;
      }
      alert(d.error || "Could not book with banked hours. Please try again.");
    } catch (error) {
      alert("Error: " + (error.message || "Please try again"));
    } finally {
      setBankedBusy(false);
    }
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const currentUser = await base44.auth.me();
      if (currentUser) {
        setCustomerEmail(currentUser.email);
        setCustomerName(currentUser.full_name);
      }
      
      const [bays, bookings, specials] = await Promise.all([
        base44.entities.Simulator.list(),
        base44.entities.Booking.list(),
        base44.entities.Special.list().catch(() => [])
      ]);

      setAllSpecials(specials || []);
      
      const activeBays = bays.filter(b => b.is_active);
      
      const uniqueBays = [];
      const seen = new Set();
      
      activeBays.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
      
      for (const bay of activeBays) {
        const key = `${bay.name}-${bay.location}`;
        if (!seen.has(key)) {
          uniqueBays.push(bay);
          seen.add(key);
        }
      }
      
      setAllBays(uniqueBays);
      setAllBookings(bookings);
    } catch (e) {
      console.error("Error loading data:", e);
    }
    setIsLoading(false);
  };

  const handleSearch = async () => {
    if (!selectedDate || !selectedTime || !selectedLocation) return;

    setIsSearching(true);
    setHasSearched(true);
    setSelectedBays([]);
    setShowWaitlist(false);
    setTimeAdjusted(false);

    const formattedDate = format(selectedDate, "yyyy-MM-dd");
    const locationBays = allBays.filter(bay => bay.location === selectedLocation);

    // Returns the available bays (sorted Bay 1..9 then VIP) for a given start time.
    const findAvailableAt = (startTime) =>
      locationBays
        .filter(bay => isBayAvailable(bay, formattedDate, startTime, duration, allBookings))
        .map(bay => {
          const rate = calculateRate(formattedDate, startTime, bay.bay_type, bay);
          return { bay, rate, totalCost: rate * duration };
        })
        .sort((a, b) => {
          const A = bayOrder(a.bay);
          const B = bayOrder(b.bay);
          if (A.isVIP !== B.isVIP) return A.isVIP ? 1 : -1;
          return A.num - B.num;
        });

    // Operating hours: open 9:00; close 23:00 (21:00 on Sundays). A slot must
    // fully fit inside those hours.
    const isSunday = selectedDate.getDay() === 0;
    const openMin = 9 * 60;
    const closeMin = (isSunday ? 21 : 23) * 60;
    const durMin = Math.round(duration * 60);
    const reqMin = toMinutes(selectedTime);

    // Don't suggest times that have already passed when booking for today.
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const nowMin = formattedDate === todayStr
      ? new Date().getHours() * 60 + new Date().getMinutes()
      : -1;

    // 1) Try the exact requested time first.
    let chosenTime = selectedTime;
    let available = findAvailableAt(selectedTime);

    // 2) If the exact slot is full, walk outward (30-min steps) to the nearest
    //    start time that has at least one open bay, staying within hours.
    if (available.length === 0) {
      const candidates = [];
      for (let t = openMin; t + durMin <= closeMin; t += 30) {
        if (t === reqMin) continue;        // already tried the exact time
        if (t < nowMin) continue;          // skip past times for today
        candidates.push(t);
      }
      // Closest to the requested time first; ties favor the earlier slot.
      candidates.sort((a, b) => Math.abs(a - reqMin) - Math.abs(b - reqMin) || a - b);

      for (const t of candidates) {
        const found = findAvailableAt(toHHMM(t));
        if (found.length > 0) {
          chosenTime = toHHMM(t);
          available = found;
          break;
        }
      }
    }

    setBookingTime(chosenTime);
    setTimeAdjusted(available.length > 0 && chosenTime !== selectedTime);
    setAvailableBays(available);
    setIsSearching(false);
  };

  const handleBaySelect = (bayInfo) => {
    setSelectedBays(prev => {
      const isAlreadySelected = prev.some(b => b.bay.id === bayInfo.bay.id);
      const next = isAlreadySelected
        ? prev.filter(b => b.bay.id !== bayInfo.bay.id)
        : [...prev, { ...bayInfo, quantity: 1 }];
      // A bay was just ADDED -> ask whether they want more bays or to continue,
      // so they don't have to scroll past the rest of the available bays.
      if (!isAlreadySelected) {
        setShowBayChoice(true);
      }
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (selectedBays.length === 0) {
      alert("Please select at least one bay.");
      return;
    }

    if (!agreedToHold) {
      alert("Please agree to the credit card authorization hold to continue.");
      return;
    }

    setIsSubmitting(true);
    
    try {
      // Book the time we actually found availability for (may differ from the
      // exact time the customer originally typed in).
      const effectiveTime = bookingTime || selectedTime;
      const formattedDate = format(selectedDate, "yyyy-MM-dd");
      const endTime = calculateEndTime(effectiveTime, duration);

      const totalBookingCost = selectedBays.reduce((sum, bay) => sum + bay.totalCost, 0);

      // Use the actual app domain for success/cancel URLs
      const appDomain = window.location.origin;
      
      const result = await base44.functions.invoke('createStripeCheckout', {
        amount: totalBookingCost,
        customerEmail,
        customerName,
        bookingData: {
          selectedBays: selectedBays.map(b => ({
            bayId: b.bay.id,
            bayName: b.bay.name,
            cost: b.totalCost
          })),
          location: selectedLocation,
          customerName,
          customerEmail,
          customerPhone,
          date: formattedDate,
          time: effectiveTime,
          endTime,
          duration,
          playerCount,
          notes,
          totalCost: totalBookingCost,
          bayPreference: preferBay
        },
        successUrl: `${appDomain}/PaymentSuccess?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${appDomain}/BookSimulator`
      });

      if (result.data && result.data.url) {
        // Use window.top to break out of iframe
        if (window.top) {
          window.top.location.href = result.data.url;
        } else {
          window.location.href = result.data.url;
        }
      } else {
        alert("Failed to create checkout session. Please try again.");
        setIsSubmitting(false);
      }
      
    } catch (error) {
      console.error("Stripe error:", error);
      alert("Error: " + (error.message || "Please try again"));
      setIsSubmitting(false);
    }
  };

  const totalBaysSelected = selectedBays.length;
  const totalBayCost = selectedBays.reduce((sum, bay) => sum + bay.totalCost, 0);
  const totalCost = totalBayCost;

  // Minnesota sales tax on the subtotal — the card hold covers subtotal + tax.
  // The server (createStripeCheckout) recomputes this as the source of truth;
  // here we mirror it so the on-screen "hold" figures match the real hold.
  const { tax: salesTax, total: totalWithTax } = computeTax(totalBayCost, selectedLocation);

  // The time the customer is actually booking (closest available if their exact
  // time was full) and its matching end time, for clear on-screen display.
  const effectiveTime = bookingTime || selectedTime;
  const effectiveEndTime = effectiveTime ? calculateEndTime(effectiveTime, duration) : "";

  // Specials currently valid for the chosen location (active + within date range).
  const today = format(new Date(), "yyyy-MM-dd");
  const availableSpecials = allSpecials.filter((s) => {
    if (!s.is_active) return false;
    if (s.location !== selectedLocation && s.location !== "both") return false;
    if (s.valid_from && today < s.valid_from) return false;
    if (s.valid_to && today > s.valid_to) return false;
    return true;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-[#2d5567]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100 p-3 sm:p-6 pb-24 lg:pb-8">
      <div className="max-w-7xl mx-auto">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 sm:mb-12 text-center"
        >
          <div className="inline-block mb-6 p-4 bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg">
            <img 
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68dc695d7506a437cb8f84c0/0ff61e822_Element_Final_Logos_RGB-01.jpg"
              alt="Element Indoor Golf"
              className="h-20 sm:h-24 w-auto object-contain"
            />
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black text-slate-800 mb-4 heading-font tracking-tight">
            Book Your <span className="bg-gradient-to-r from-[#2d5567] to-[#1e3a47] text-transparent bg-clip-text">Golf Experience</span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto">
            Select your preferred time and bay
          </p>
        </motion.div>

        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <Alert className="mb-6 bg-gradient-to-r from-blue-50 to-slate-50 border-2 border-[#2d5567] shadow-xl">
              <CheckCircle2 className="h-6 w-6 text-[#2d5567]" />
              <AlertDescription className="text-[#2d5567] text-lg font-semibold">
                🎉 Booking confirmed! Redirecting you to your reservations...
              </AlertDescription>
            </Alert>
          </motion.div>
        )}

        <div className={`grid gap-6 sm:gap-8 ${selectedBays.length > 0 && selectedDate && selectedTime && selectedLocation ? 'lg:grid-cols-3' : ''}`}>
          <div className={`space-y-6 sm:space-y-8 ${selectedBays.length > 0 && selectedDate && selectedTime && selectedLocation ? 'lg:col-span-2' : 'max-w-4xl mx-auto w-full'}`}>
            <LocationSelector
              selectedLocation={selectedLocation}
              onChange={(loc) => {
                setSelectedLocation(loc);
                setAvailableBays([]);
                setSelectedBays([]);
                setHasSearched(false);
                setShowWaitlist(false);
                setTimeAdjusted(false);
                setBookingTime(null);
              }}
            />

            {selectedLocation && availableSpecials.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Button
                  onClick={() => setShowSpecials(true)}
                  className="w-full h-16 text-lg font-bold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-xl hover:shadow-2xl transition-all duration-300 rounded-xl"
                >
                  <Tag className="w-6 h-6 mr-2" />
                  View Specials ({availableSpecials.length})
                </Button>
              </motion.div>
            )}

            {selectedLocation && (
              <TimeSelectionForm
                selectedDate={selectedDate}
                selectedTime={selectedTime}
                duration={duration}
                onDateChange={setSelectedDate}
                onTimeChange={setSelectedTime}
                onDurationChange={setDuration}
                onSearch={handleSearch}
              />
            )}

            {selectedLocation && isSearching && (
              <Card className="bg-white/90 backdrop-blur-sm shadow-2xl border-0">
                <CardContent className="p-12 sm:p-16 text-center">
                  <Loader2 className="w-12 h-12 animate-spin text-[#2d5567] mx-auto mb-4" />
                  <p className="text-slate-600 text-lg">Finding available bays...</p>
                </CardContent>
              </Card>
            )}

            {selectedLocation && hasSearched && !isSearching && (
              <Card className="bg-white/90 backdrop-blur-sm shadow-2xl border-0 overflow-hidden">
                <div className="bg-gradient-to-r from-[#2d5567] to-[#1e3a47] p-6">
                  <CardTitle className="text-2xl sm:text-3xl text-white font-bold heading-font flex items-center gap-3">
                    <Sparkles className="w-7 h-7" />
                    Available Bays ({availableBays.length})
                  </CardTitle>
                  <p className="text-blue-50 mt-2">Click to select one or more bays</p>
                </div>
                <CardContent className="p-6">
                  {timeAdjusted && availableBays.length > 0 && (
                    <Alert className="mb-6 bg-amber-50 border-2 border-amber-300">
                      <Clock className="h-5 w-5 text-amber-600" />
                      <AlertDescription className="text-amber-900 text-base">
                        Your requested <strong>{formatTimeLabel(selectedTime)}</strong> wasn't available, so we found
                        the closest opening at <strong className="text-lg">{formatTimeLabel(effectiveTime)}</strong>
                        {" "}(ends {formatTimeLabel(effectiveEndTime)}). The bays below are for this time — pick one to continue.
                      </AlertDescription>
                    </Alert>
                  )}
                  {availableBays.length === 0 ? (
                    <div className="text-center py-12">
                      <AlertCircle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
                      <p className="text-slate-700 text-xl font-semibold mb-2">No bays available</p>
                      <p className="text-slate-500 mb-6">We checked your requested time and the closest openings, but everything's booked for that day and duration. Try a different date or a shorter duration, or join the waitlist and we'll notify you if a spot opens up.</p>
                      <Button
                        onClick={() => setShowWaitlist(true)}
                        className="bg-[#2d5567] hover:bg-[#1e3a47] text-white font-semibold rounded-xl"
                      >
                        Join Waitlist
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-8">
                      {[
                        { label: "Standard Bays", items: availableBays.filter(({ bay }) => !isVIPBay(bay)) },
                        { label: "VIP Bays", items: availableBays.filter(({ bay }) => isVIPBay(bay)) }
                      ]
                        .filter((group) => group.items.length > 0)
                        .map((group) => (
                          <div key={group.label} className="space-y-4">
                            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 border-b border-slate-200 pb-2">
                              {group.label} ({group.items.length})
                            </h3>
                            <div className="grid gap-4 sm:gap-6">
                              {group.items.map(({ bay, rate, totalCost }) => (
                                <AvailableBayCard
                                  key={bay.id}
                                  bay={bay}
                                  rate={rate}
                                  totalCost={totalCost}
                                  duration={duration}
                                  onSelect={() => handleBaySelect({ bay, rate, totalCost })}
                                  isSelected={selectedBays.some(b => b.bay.id === bay.id)}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {totalBaysSelected > 0 && selectedLocation && (
              <div ref={detailsRef} className="space-y-6 sm:space-y-8 scroll-mt-6">
                {/* Always show the customer the exact date/time they're booking,
                    and flag it if it differs from what they originally requested. */}
                <Card className={`border-2 shadow-lg ${timeAdjusted ? "bg-amber-50 border-amber-300" : "bg-white/90 border-[#2d5567]/20"}`}>
                  <CardContent className="p-4 sm:p-5 flex items-start gap-3">
                    <Clock className={`w-6 h-6 flex-shrink-0 ${timeAdjusted ? "text-amber-600" : "text-[#2d5567]"}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">You're booking</p>
                      <p className="text-lg sm:text-xl font-black text-slate-800">
                        {selectedDate ? format(selectedDate, "EEE, MMM d") : ""} · {formatTimeLabel(effectiveTime)} – {formatTimeLabel(effectiveEndTime)}
                      </p>
                      {timeAdjusted && (
                        <p className="text-sm font-semibold text-amber-800 mt-1">
                          Adjusted from your requested {formatTimeLabel(selectedTime)} — this was the closest opening.
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <PlayerCountInput
                  playerCount={playerCount}
                  onChange={setPlayerCount}
                />

                <NotesInput
                  notes={notes}
                  onChange={setNotes}
                />

                <Card className="bg-white/90 backdrop-blur-sm shadow-2xl border-0">
                  <div className="bg-gradient-to-r from-[#2d5567] to-[#1e3a47] p-6">
                    <CardTitle className="text-2xl text-white font-bold heading-font flex items-center gap-2">
                      <Shield className="w-6 h-6" />
                      Payment Authorization
                    </CardTitle>
                  </div>
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      {/* Unmissable: this is an authorization hold, NOT a charge. */}
                      <div className="rounded-xl border-2 border-emerald-500 bg-emerald-50 p-5 text-center">
                        <p className="text-xl sm:text-2xl font-extrabold text-emerald-800 leading-tight">
                          You will NOT be charged today
                        </p>
                        <p className="mt-2 text-base font-semibold text-emerald-900">
                          We only place a temporary <span className="underline">authorization hold</span> on your card to reserve your bay.
                          Pay in person when you arrive — split the bill however you like.
                        </p>
                        <p className="mt-2 text-sm text-emerald-800">
                          The hold is automatically released after your reservation. It's only charged if you no-show
                          or cancel within 24 hours.
                        </p>
                      </div>

                      <Alert className="bg-blue-50 border-blue-200">
                        <DollarSign className="h-5 w-5 text-blue-600 flex-shrink-0" />
                        <AlertDescription className="text-blue-800 text-base font-medium">
                          Authorization hold (not a charge): <span className="font-bold text-xl">${totalWithTax.toFixed(2)}</span>
                          <span className="block text-sm font-normal text-blue-700 mt-1">
                            ${totalBayCost.toFixed(2)} + ${salesTax.toFixed(2)} MN sales tax
                          </span>
                        </AlertDescription>
                      </Alert>

                      <div className="flex items-start space-x-3 p-4 bg-emerald-50 rounded-xl border-2 border-emerald-200">
                        <Checkbox 
                          id="hold-agreement" 
                          checked={agreedToHold}
                          onCheckedChange={setAgreedToHold}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <Label 
                            htmlFor="hold-agreement" 
                            className="text-base font-semibold text-slate-800 cursor-pointer leading-tight"
                          >
                            Place credit card hold
                          </Label>
                          <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                            <strong>This is just a hold — not a payment.</strong> You pay at the venue after your
                            reservation, and you're welcome to split the bill with your group. The hold is only ever
                            charged if you violate our 24-hour cancellation policy or fail to show up.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start space-x-3 p-4 bg-slate-50 rounded-xl border-2 border-slate-200">
                        <Checkbox
                          id="prefer-bay"
                          checked={preferBay}
                          onCheckedChange={setPreferBay}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <Label
                            htmlFor="prefer-bay"
                            className="text-base font-semibold text-slate-800 cursor-pointer leading-tight"
                          >
                            I prefer this bay
                          </Label>
                          <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                            Keep me on the exact bay I selected. If you leave this unchecked,
                            we may move your reservation to a comparable open bay to fit more
                            bookings — your date, time, duration, and price never change.
                          </p>
                        </div>
                      </div>

                      <Alert className="bg-amber-50 border-amber-200">
                        <AlertCircle className="h-4 w-4 text-amber-600" />
                        <AlertDescription className="text-sm text-amber-800">
                          <strong>Cancellation Policy:</strong> Free cancellation up to 24 hours before your booking.
                          The authorization hold will be released after your reservation is complete.
                        </AlertDescription>
                      </Alert>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white/90 backdrop-blur-sm shadow-2xl border-0">
                  <div className="bg-gradient-to-r from-slate-700 to-slate-800 p-6">
                    <CardTitle className="text-2xl text-white font-bold heading-font">
                      Your Information
                    </CardTitle>
                  </div>
                  <CardContent className="p-6">
                    <form onSubmit={handleSubmit} className="space-y-5">
                      <div className="grid sm:grid-cols-2 gap-5">
                        <div className="space-y-2">
                          <Label htmlFor="name" className="text-base font-semibold">Full Name *</Label>
                          <Input
                            id="name"
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            required
                            className="h-14 text-base border-2 border-slate-200 focus:border-[#2d5567] focus:ring-[#2d5567] rounded-xl"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="email" className="text-base font-semibold">Email *</Label>
                          <Input
                            id="email"
                            type="email"
                            value={customerEmail}
                            onChange={(e) => setCustomerEmail(e.target.value)}
                            required
                            className="h-14 text-base border-2 border-slate-200 focus:border-[#2d5567] focus:ring-[#2d5567] rounded-xl"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone" className="text-base font-semibold">Phone Number *</Label>
                        <Input
                          id="phone"
                          type="tel"
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          required
                          placeholder="(555) 123-4567"
                          className="h-14 text-base border-2 border-slate-200 focus:border-[#2d5567] focus:ring-[#2d5567] rounded-xl"
                        />
                      </div>
                      <Button
                        type="submit"
                        disabled={isSubmitting || !customerName || !customerEmail || !customerPhone || !agreedToHold}
                        className="w-full h-16 text-lg font-bold bg-gradient-to-r from-[#2d5567] to-[#1e3a47] hover:from-[#1e3a47] hover:to-[#0f1f29] shadow-xl hover:shadow-2xl transition-all duration-300 rounded-xl"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="w-6 h-6 mr-2 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <Shield className="w-6 h-6 mr-2" />
                            Continue to Secure Payment
                          </>
                        )}
                      </Button>

                      {/* Prepaid banked-hours option: only when the signed-in
                          customer has enough hours for this single-bay slot. */}
                      {bankedEligible && (
                        <div className="pt-2">
                          <div className="flex items-center gap-3 my-2">
                            <div className="h-px flex-1 bg-slate-200" />
                            <span className="text-xs font-medium text-slate-400">OR</span>
                            <div className="h-px flex-1 bg-slate-200" />
                          </div>
                          <div className="rounded-xl border-2 border-teal-300 bg-teal-50 p-4">
                            <p className="text-sm font-semibold text-teal-900">
                              You have banked hours here:{" "}
                              {Math.max(0, bankedBalance.peak)} peak · {Math.max(0, bankedBalance.off_peak)} off-peak
                            </p>
                            <p className="text-xs text-teal-800 mt-1">
                              Use {duration} hour{duration !== 1 ? "s" : ""} for this booking — no card hold needed
                              {selectedBays[0]?.bay?.bay_type === "vip"
                                ? " (VIP suite adds a per-hour surcharge to your card)."
                                : "."}
                            </p>
                            <Button
                              type="button"
                              onClick={handleBankedBooking}
                              disabled={bankedBusy || !customerName || !customerEmail || !customerPhone}
                              className="w-full h-12 mt-3 text-base font-bold bg-teal-600 hover:bg-teal-700 rounded-xl"
                            >
                              {bankedBusy ? (
                                <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Booking…</>
                              ) : (
                                <><Clock className="w-5 h-5 mr-2" /> Use {duration} banked hour{duration !== 1 ? "s" : ""}</>
                              )}
                            </Button>
                          </div>
                        </div>
                      )}
                    </form>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>

          {selectedBays.length > 0 && selectedDate && selectedTime && selectedLocation && (
            <div className="hidden lg:block lg:sticky lg:top-8 h-fit">
              <BookingSummaryNew
                selectedBays={selectedBays}
                date={selectedDate ? format(selectedDate, "yyyy-MM-dd") : ""}
                startTime={effectiveTime}
                duration={duration}
                playerCount={playerCount}
                notes={notes}
                location={selectedLocation}
                totalCost={totalBayCost}
              />
            </div>
          )}
        </div>
      </div>

      {/* Mobile-only sticky bar: once a bay is picked, give the customer a
          one-tap jump to the booking details no matter where they've scrolled. */}
      {totalBaysSelected > 0 && selectedLocation && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-sm border-t border-slate-200 shadow-2xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold text-slate-800 text-sm truncate">
              {totalBaysSelected} bay{totalBaysSelected > 1 ? "s" : ""} • ${totalWithTax.toFixed(2)} hold
            </p>
            <p className="text-xs text-emerald-700 font-medium">Incl. tax · Not charged today</p>
          </div>
          <Button
            type="button"
            onClick={scrollToDetails}
            className="flex-shrink-0 h-12 px-5 text-base font-bold bg-gradient-to-r from-[#2d5567] to-[#1e3a47] hover:from-[#1e3a47] hover:to-[#0f1f29] rounded-xl shadow-lg"
          >
            Continue →
          </Button>
        </div>
      )}

      {/* After selecting a bay: let the customer choose to add more bays or
          jump straight to the booking details. */}
      {showBayChoice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setShowBayChoice(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
          >
            <div className="bg-gradient-to-r from-[#2d5567] to-[#1e3a47] p-6 text-center">
              <CheckCircle2 className="w-12 h-12 text-white mx-auto mb-2" />
              <h3 className="text-2xl font-black text-white heading-font">Bay added! 🏌️</h3>
              <p className="text-blue-50 mt-1">
                {totalBaysSelected} bay{totalBaysSelected > 1 ? "s" : ""} · {formatTimeLabel(effectiveTime)}
                {totalBayCost > 0 ? ` · $${totalWithTax.toFixed(2)} hold` : ""}
              </p>
            </div>
            <div className="p-6 space-y-3">
              <p className="text-center text-slate-600">
                Want to grab more bays for your group, or head to your booking details?
              </p>
              <Button
                type="button"
                onClick={() => setShowBayChoice(false)}
                className="w-full h-14 text-base font-bold bg-white border-2 border-[#2d5567] text-[#2d5567] hover:bg-slate-50 rounded-xl"
              >
                + Book multiple bays
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setShowBayChoice(false);
                  scrollToDetails();
                }}
                className="w-full h-14 text-base font-bold bg-gradient-to-r from-[#2d5567] to-[#1e3a47] hover:from-[#1e3a47] hover:to-[#0f1f29] rounded-xl shadow-lg"
              >
                Continue to booking →
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {showSpecials && (
        <SpecialsModal
          specials={availableSpecials}
          location={selectedLocation}
          allBays={allBays}
          allBookings={allBookings}
          customerName={customerName}
          customerEmail={customerEmail}
          customerPhone={customerPhone}
          onClose={() => setShowSpecials(false)}
        />
      )}

      {showWaitlist && (
        <WaitlistForm
          location={selectedLocation}
          date={selectedDate ? format(selectedDate, "yyyy-MM-dd") : null}
          time={selectedTime}
          duration={duration}
          playerCount={playerCount}
          customerName={customerName}
          customerEmail={customerEmail}
          customerPhone={customerPhone}
          onClose={() => setShowWaitlist(false)}
        />
      )}
    </div>
  );
}
