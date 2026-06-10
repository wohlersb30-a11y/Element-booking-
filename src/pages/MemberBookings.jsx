import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, Clock, MapPin, Crown, AlertCircle, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";

const ALL_TIME_SLOTS = [
  // Member exclusive hours (6am-9am during peak season)
  { value: "06:00", label: "6:00 AM", exclusive: true },
  { value: "06:30", label: "6:30 AM", exclusive: true },
  { value: "07:00", label: "7:00 AM", exclusive: true },
  { value: "07:30", label: "7:30 AM", exclusive: true },
  { value: "08:00", label: "8:00 AM", exclusive: true },
  { value: "08:30", label: "8:30 AM", exclusive: true },
  // Regular hours (available to everyone)
  { value: "09:00", label: "9:00 AM", exclusive: false },
  { value: "09:30", label: "9:30 AM", exclusive: false },
  { value: "10:00", label: "10:00 AM", exclusive: false },
  { value: "10:30", label: "10:30 AM", exclusive: false },
  { value: "11:00", label: "11:00 AM", exclusive: false },
  { value: "11:30", label: "11:30 AM", exclusive: false },
  { value: "12:00", label: "12:00 PM", exclusive: false },
  { value: "12:30", label: "12:30 PM", exclusive: false },
  { value: "13:00", label: "1:00 PM", exclusive: false },
  { value: "13:30", label: "1:30 PM", exclusive: false },
  { value: "14:00", label: "2:00 PM", exclusive: false },
  { value: "14:30", label: "2:30 PM", exclusive: false },
  { value: "15:00", label: "3:00 PM", exclusive: false },
  { value: "15:30", label: "3:30 PM", exclusive: false },
  { value: "16:00", label: "4:00 PM", exclusive: false },
  { value: "16:30", label: "4:30 PM", exclusive: false },
  { value: "17:00", label: "5:00 PM", exclusive: false },
  { value: "17:30", label: "5:30 PM", exclusive: false },
  { value: "18:00", label: "6:00 PM", exclusive: false },
  { value: "18:30", label: "6:30 PM", exclusive: false },
  { value: "19:00", label: "7:00 PM", exclusive: false },
  { value: "19:30", label: "7:30 PM", exclusive: false },
  { value: "20:00", label: "8:00 PM", exclusive: false },
  { value: "20:30", label: "8:30 PM", exclusive: false },
  { value: "21:00", label: "9:00 PM", exclusive: false },
  { value: "21:30", label: "9:30 PM", exclusive: false },
  { value: "22:00", label: "10:00 PM", exclusive: false },
  { value: "22:30", label: "10:30 PM", exclusive: false }
];

const DURATIONS = {
  bronze: [{ value: 1, label: "1 hour" }],
  silver: [{ value: 1, label: "1 hour" }, { value: 1.5, label: "1.5 hours" }],
  gold: [{ value: 1, label: "1 hour" }, { value: 1.5, label: "1.5 hours" }, { value: 2, label: "2 hours" }],
  platinum: [
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
  ]
};

const calculateEndTime = (startTime, duration) => {
  const [hours, minutes] = startTime.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + (duration * 60);
  const endHours = Math.floor(totalMinutes / 60);
  const endMinutes = totalMinutes % 60;
  return `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
};

const isPeakSeason = (date) => {
  const month = date.getMonth(); // 0-11
  // Oct (9), Nov (10), Dec (11), Jan (0), Feb (1), Mar (2), Apr (3), May (4)
  return month >= 9 || month <= 4;
};

const isExclusiveHour = (timeSlot) => {
  const hour = parseInt(timeSlot.split(':')[0]);
  return hour >= 6 && hour < 9;
};

const calculateRate = (date, startTime, simulator) => {
  // Member bookings during exclusive hours (6am-9am) are free/included
  if (isExclusiveHour(startTime)) {
    return 0;
  }

  // Regular hours use normal pricing
  const bookingDate = new Date(date);
  const dayOfWeek = bookingDate.getDay();
  const hour = parseInt(startTime.split(':')[0]);
  
  const isFridayAfter3pm = dayOfWeek === 5 && hour >= 15;
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isPeakTime = isFridayAfter3pm || isWeekend;
  
  if (simulator && simulator.pricing_rules && simulator.pricing_rules.length > 0) {
    for (const rule of simulator.pricing_rules) {
      const ruleStart = new Date(rule.start_date);
      const ruleEnd = new Date(rule.end_date);
      
      if (bookingDate >= ruleStart && bookingDate <= ruleEnd) {
        return isPeakTime ? rule.peak_rate : rule.off_peak_rate;
      }
    }
  }
  
  if (simulator && simulator.pricing_off_peak && simulator.pricing_peak) {
    return isPeakTime ? simulator.pricing_peak : simulator.pricing_off_peak;
  }
  
  const bayType = simulator?.bay_type || "standard";
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
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const user = await base44.auth.me();
      setCurrentUser(user);

      const memberships = await base44.entities.Membership.filter({ user_email: user.email });
      const activeMembership = memberships.find(m => m.status === 'active');

      if (!activeMembership) {
        alert("No active membership found. Please sign up for a membership first.");
        navigate(createPageUrl("MemberSignup"));
        return;
      }

      setMembership(activeMembership);

      const [bays, regularBookings, memBookings] = await Promise.all([
        base44.entities.Simulator.filter({ location: activeMembership.location, is_active: true }),
        base44.entities.Booking.list(),
        base44.entities.MemberBooking.filter({ member_email: user.email })
      ]);

      setAllBays(bays);
      setAllBookings(regularBookings);
      setMemberBookings(memBookings);

    } catch (error) {
      console.error("Error loading data:", error);
    }
    setIsLoading(false);
  };

  const getAvailableTimeSlots = () => {
    if (!selectedDate) return ALL_TIME_SLOTS;

    const isDateInPeakSeason = isPeakSeason(selectedDate);
    const isSunday = selectedDate.getDay() === 0;
    const maxHour = isSunday ? 22 : 23;

    return ALL_TIME_SLOTS.filter(slot => {
      const hour = parseInt(slot.value.split(':')[0]);
      
      // Check closing time
      if (hour > maxHour) return false;
      
      // If it's an exclusive hour (6am-9am), only show during peak season
      if (slot.exclusive && !isDateInPeakSeason) return false;
      
      return true;
    });
  };

  const handleSearch = () => {
    if (!selectedDate || !selectedTime) {
      alert("Please select a date and time");
      return;
    }

    // Check if trying to book exclusive hours outside peak season
    if (isExclusiveHour(selectedTime) && !isPeakSeason(selectedDate)) {
      alert("6am-9am slots are only available during peak season (October - May)");
      return;
    }

    setIsSearching(true);
    const formattedDate = format(selectedDate, "yyyy-MM-dd");

    const available = allBays.filter(bay => 
      isBayAvailable(bay, formattedDate, selectedTime, duration, [...allBookings, ...memberBookings])
    ).map(bay => {
      const rate = calculateRate(formattedDate, selectedTime, bay);
      return {
        ...bay,
        rate,
        totalCost: rate * duration
      };
    });

    setAvailableBays(available);
    setIsSearching(false);
  };

  const handleBooking = async () => {
    if (!selectedBay) {
      alert("Please select a bay");
      return;
    }

    setIsSubmitting(true);
    try {
      const formattedDate = format(selectedDate, "yyyy-MM-dd");
      const endTime = calculateEndTime(selectedTime, duration);
      const bay = allBays.find(b => b.id === selectedBay);
      const bayInfo = availableBays.find(b => b.id === selectedBay);

      await base44.entities.MemberBooking.create({
        membership_id: membership.id,
        member_email: currentUser.email,
        member_name: currentUser.full_name,
        simulator_id: bay.id,
        simulator_name: bay.name,
        location: membership.location,
        booking_date: formattedDate,
        start_time: selectedTime,
        end_time: endTime,
        duration_hours: duration,
        status: "confirmed",
        check_in_status: "not_arrived",
        total_cost: bayInfo.totalCost,
        is_exclusive_hours: isExclusiveHour(selectedTime)
      });

      alert("Booking confirmed! See you soon.");
      loadData();
      setSelectedDate(null);
      setSelectedTime("");
      setSelectedBay("");
      setAvailableBays([]);
    } catch (error) {
      console.error("Error creating booking:", error);
      alert("Error creating booking. Please try again.");
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

  const upcomingBookings = memberBookings.filter(b => 
    new Date(b.booking_date) >= new Date() && b.status !== 'cancelled'
  ).sort((a, b) => new Date(a.booking_date) - new Date(b.booking_date));

  const availableSlots = getAvailableTimeSlots();
  const isExclusiveTime = selectedTime && isExclusiveHour(selectedTime);
  const canBookExclusive = selectedDate && isPeakSeason(selectedDate);

  return (
    <div className="min-h-screen p-6 bg-gradient-to-br from-slate-50 via-purple-50/30 to-slate-100">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-black text-slate-800 heading-font">Member Bookings</h1>
            <Badge className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-sm px-4 py-2 capitalize">
              <Crown className="w-4 h-4 mr-1" />
              {membership.membership_level} Member
            </Badge>
          </div>
          <p className="text-slate-600">
            Book anytime during business hours • Exclusive 6am-9am access during peak season (Oct-May)
          </p>
        </div>

        {canBookExclusive && (
          <Alert className="mb-6 bg-gradient-to-r from-purple-50 to-indigo-50 border-2 border-purple-200">
            <Sparkles className="h-5 w-5 text-purple-600" />
            <AlertDescription className="text-purple-800 font-semibold">
              ✨ Peak Season Active! You have exclusive access to 6am-9am slots
            </AlertDescription>
          </Alert>
        )}

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Booking Form */}
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
                  onSelect={setSelectedDate}
                  disabled={(date) => date < new Date()}
                  className="rounded-lg border"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Start Time</Label>
                  <Select value={selectedTime} onValueChange={setSelectedTime}>
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="Select time" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSlots.map(slot => (
                        <SelectItem key={slot.value} value={slot.value}>
                          {slot.label}
                          {slot.exclusive && canBookExclusive && (
                            <span className="ml-2 text-xs text-purple-600">★ Exclusive</span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Duration</Label>
                  <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
                    <SelectTrigger className="h-12">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DURATIONS[membership.membership_level].map(d => (
                        <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {isExclusiveTime && (
                <Alert className="bg-purple-50 border-purple-200">
                  <Crown className="h-4 w-4 text-purple-600" />
                  <AlertDescription className="text-purple-800 text-sm">
                    <strong>Member Exclusive Hour</strong> - This session is included with your membership!
                  </AlertDescription>
                </Alert>
              )}

              <Button
                onClick={handleSearch}
                disabled={!selectedDate || !selectedTime}
                className="w-full h-12 bg-[#2d5567] hover:bg-[#1e3a47]"
              >
                {isSearching ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Search Available Bays
              </Button>

              {availableBays.length > 0 && (
                <div className="space-y-3">
                  <Label>Available Bays</Label>
                  <div className="grid gap-2">
                    {availableBays.map(bay => (
                      <Card
                        key={bay.id}
                        className={`cursor-pointer transition-all ${
                          selectedBay === bay.id
                            ? 'ring-2 ring-[#2d5567] bg-blue-50'
                            : 'hover:shadow-md'
                        }`}
                        onClick={() => setSelectedBay(bay.id)}
                      >
                        <CardContent className="p-4 flex items-center justify-between">
                          <div>
                            <p className="font-semibold">{bay.name}</p>
                            {bay.bay_type === 'vip' && (
                              <Badge className="mt-1 bg-amber-100 text-amber-800">VIP Bay</Badge>
                            )}
                            {bay.totalCost > 0 && (
                              <p className="text-sm text-slate-600 mt-1">${bay.totalCost.toFixed(2)}</p>
                            )}
                            {bay.totalCost === 0 && (
                              <p className="text-sm text-purple-600 font-semibold mt-1">✨ Included</p>
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
                    onClick={handleBooking}
                    disabled={!selectedBay || isSubmitting}
                    className="w-full h-12 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Confirming...
                      </>
                    ) : (
                      "Confirm Booking"
                    )}
                  </Button>
                </div>
              )}

              {availableBays.length === 0 && selectedDate && selectedTime && !isSearching && (
                <div className="text-center py-8 text-slate-500">
                  <AlertCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No bays available for this time slot</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upcoming Bookings */}
          <Card>
            <CardHeader>
              <CardTitle>Your Upcoming Bookings</CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingBookings.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No upcoming bookings</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {upcomingBookings.map(booking => {
                    const isExclusive = booking.is_exclusive_hours || isExclusiveHour(booking.start_time);
                    return (
                      <Card key={booking.id} className={isExclusive ? "bg-gradient-to-r from-purple-50 to-indigo-50 border-2 border-purple-200" : "bg-slate-50"}>
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-lg">{booking.simulator_name}</p>
                                {isExclusive && (
                                  <Badge className="bg-purple-600 text-white text-xs">
                                    <Crown className="w-3 h-3 mr-1" />
                                    Exclusive
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-sm text-slate-600 mt-1">
                                <Clock className="w-4 h-4" />
                                <span>{format(new Date(booking.booking_date), "MMM d, yyyy")} at {booking.start_time}</span>
                              </div>
                              <div className="flex items-center gap-2 text-sm text-slate-600 mt-1">
                                <MapPin className="w-4 h-4" />
                                <span>{booking.location === 'vadnais_heights' ? 'Vadnais Heights' : 'Burnsville'}</span>
                              </div>
                              {booking.total_cost > 0 && (
                                <p className="text-sm text-slate-700 font-semibold mt-2">${booking.total_cost.toFixed(2)}</p>
                              )}
                            </div>
                            <Badge className="bg-green-100 text-green-800">Confirmed</Badge>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}