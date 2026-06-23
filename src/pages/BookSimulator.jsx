
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, Loader2, AlertCircle, Sparkles, Shield, DollarSign, Tag } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Checkbox } from "@/components/ui/checkbox";

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

// Treat anything flagged vip OR named "VIP ..." as a VIP bay.
const isVIPBay = (bay) => bay.bay_type === "vip" || /vip/i.test(bay.name || "");

// Sort key: standard bays before VIP, then by the number in the bay name
// (so "Bay 2" comes before "Bay 10").
const bayOrder = (bay) => {
  const match = (bay.name || "").match(/\d+/);
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

  useEffect(() => {
    loadData();
  }, []);

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
    
    const formattedDate = format(selectedDate, "yyyy-MM-dd");
    
    const locationBays = allBays.filter(bay => bay.location === selectedLocation);

    const available = locationBays
      .filter(bay => isBayAvailable(bay, formattedDate, selectedTime, duration, allBookings))
      .map(bay => {
        const rate = calculateRate(formattedDate, selectedTime, bay.bay_type, bay);
        return {
          bay,
          rate,
          totalCost: rate * duration
        };
      })
      .sort((a, b) => {
        const A = bayOrder(a.bay);
        const B = bayOrder(b.bay);
        // Standard bays first, VIP bays last; within each group, numeric order
        // (Bay 1, Bay 2, ... Bay 10, then VIP 1, VIP 2).
        if (A.isVIP !== B.isVIP) return A.isVIP ? 1 : -1;
        return A.num - B.num;
      });
    
    setAvailableBays(available);
    setIsSearching(false);
  };

  const handleBaySelect = (bayInfo) => {
    setSelectedBays(prev => {
      const isAlreadySelected = prev.some(b => b.bay.id === bayInfo.bay.id);
      if (isAlreadySelected) {
        return prev.filter(b => b.bay.id !== bayInfo.bay.id);
      } else {
        return [...prev, { ...bayInfo, quantity: 1 }];
      }
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
      const formattedDate = format(selectedDate, "yyyy-MM-dd");
      const endTime = calculateEndTime(selectedTime, duration);
      
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
          time: selectedTime,
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
                  {availableBays.length === 0 ? (
                    <div className="text-center py-12">
                      <AlertCircle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
                      <p className="text-slate-700 text-xl font-semibold mb-2">No bays available</p>
                      <p className="text-slate-500 mb-6">Try a different time or date, or join the waitlist and we'll notify you if a spot opens up.</p>
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
              <>
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
                          Authorization hold (not a charge): <span className="font-bold text-xl">${totalBayCost.toFixed(2)}</span>
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
                    </form>
                  </CardContent>
                </Card>
              </>
            )}
          </div>

          {selectedBays.length > 0 && selectedDate && selectedTime && selectedLocation && (
            <div className="hidden lg:block lg:sticky lg:top-8 h-fit">
              <BookingSummaryNew
                selectedBays={selectedBays}
                date={selectedDate ? format(selectedDate, "yyyy-MM-dd") : ""}
                startTime={selectedTime}
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
