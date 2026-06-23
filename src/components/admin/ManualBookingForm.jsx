
import React, { useState, useEffect } from "react";
import { Booking } from "@/entities/all";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { X, Loader2 } from "lucide-react";
import { format } from "date-fns";

import { sendBookingConfirmation } from "../booking/BookingConfirmationEmail";
import { sendBookingConfirmationSMS } from "../booking/BookingConfirmationSMS";

const TIME_SLOTS = [
  { value: "09:00", label: "9:00 AM" },
  { value: "09:30", label: "9:30 AM" },
  { value: "10:00", label: "10:00 AM" },
  { value: "10:30", label: "10:30 AM" },
  { value: "11:00", label: "11:00 AM" },
  { value: "11:30", label: "11:30 AM" },
  { value: "12:00", label: "12:00 PM" },
  { value: "12:30", label: "12:30 PM" },
  { value: "13:00", label: "1:00 PM" },
  { value: "13:30", label: "1:30 PM" },
  { value: "14:00", label: "2:00 PM" },
  { value: "14:30", label: "2:30 PM" },
  { value: "15:00", label: "3:00 PM" },
  { value: "15:30", label: "3:30 PM" },
  { value: "16:00", label: "4:00 PM" },
  { value: "16:30", label: "4:30 PM" },
  { value: "17:00", label: "5:00 PM" },
  { value: "17:30", label: "5:30 PM" },
  { value: "18:00", label: "6:00 PM" },
  { value: "18:30", label: "6:30 PM" },
  { value: "19:00", label: "7:00 PM" },
  { value: "19:30", label: "7:30 PM" },
  { value: "20:00", label: "8:00 PM" },
  { value: "20:30", label: "8:30 PM" },
  { value: "21:00", label: "9:00 PM" },
  { value: "21:30", label: "9:30 PM" },
  { value: "22:00", label: "10:00 PM" },
  { value: "22:30", label: "10:30 PM" }
];

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

const calculateEndTime = (startTime, duration) => {
  const [hours, minutes] = startTime.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + (duration * 60);
  const endHours = Math.floor(totalMinutes / 60);
  const endMinutes = totalMinutes % 60;
  return `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
};

const calculateRate = (date, startTime, simulator) => {
  const bookingDate = new Date(date);
  // Normalize bookingDate to start of day for comparison purposes to avoid time zone issues
  bookingDate.setHours(0, 0, 0, 0);

  const dayOfWeek = bookingDate.getDay();
  const hour = parseInt(startTime.split(':')[0]);
  
  const isFridayAfter3pm = dayOfWeek === 5 && hour >= 15;
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sunday is 0, Saturday is 6
  const isPeakTime = isFridayAfter3pm || isWeekend;
  
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

const getBayDisplayName = (originalName) => {
  const nameMap = {
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
  return nameMap[originalName] || originalName;
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
  const [formData, setFormData] = useState({
    simulator_id: preselectedBay?.id || "",
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    booking_date: initialDate || new Date(),
    start_time: preselectedTime || "",
    duration_hours: 1,
    number_of_players: 1,
    payment_method: "pay_at_venue",
    payment_status: "pending",
    notes: "",
    bay_locked: false
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Update form when preselected values change
  useEffect(() => {
    if (preselectedBay) {
      setFormData(prev => ({ ...prev, simulator_id: preselectedBay.id }));
    }
    if (preselectedTime) {
      setFormData(prev => ({ ...prev, start_time: preselectedTime }));
    }
  }, [preselectedBay, preselectedTime]);

  const selectedBay = simulators.find(s => s.id === formData.simulator_id);
  const totalCost = selectedBay && formData.start_time
    ? calculateRate(
        format(formData.booking_date, "yyyy-MM-dd"),
        formData.start_time,
        selectedBay
      ) * formData.duration_hours
    : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const formattedDate = format(formData.booking_date, "yyyy-MM-dd");
      const endTime = calculateEndTime(formData.start_time, formData.duration_hours);

      // Check for conflicts with existing bookings
      const hasConflict = existingBookings.some(booking => {
        if (booking.simulator_id !== formData.simulator_id) return false;
        if (booking.booking_date !== formattedDate) return false;
        if (booking.status === 'cancelled') return false;
        
        const [newStartHour, newStartMin] = formData.start_time.split(':').map(Number);
        const [newEndHour, newEndMin] = endTime.split(':').map(Number);
        const newStartMins = newStartHour * 60 + newStartMin;
        const newEndMins = newEndHour * 60 + newEndMin;
        
        const [bookingStartHour, bookingStartMin] = booking.start_time.split(':').map(Number);
        const [bookingEndHour, bookingEndMin] = booking.end_time.split(':').map(Number);
        const bookingStartMins = bookingStartHour * 60 + bookingStartMin;
        const bookingEndMins = bookingEndHour * 60 + bookingEndMin;
        
        return (newStartMins < bookingEndMins && newEndMins > bookingStartMins);
      });

      // Check for conflicts with blocks
      const hasBlockConflict = existingBlocks.some(block => {
        if (block.simulator_id !== formData.simulator_id) return false;
        if (block.block_date !== formattedDate) return false;
        
        const [newStartHour, newStartMin] = formData.start_time.split(':').map(Number);
        const [newEndHour, newEndMin] = endTime.split(':').map(Number);
        const newStartMins = newStartHour * 60 + newStartMin;
        const newEndMins = newEndHour * 60 + newEndMin;
        
        const [blockStartHour, blockStartMin] = block.start_time.split(':').map(Number);
        const [blockEndHour, blockEndMin] = block.end_time.split(':').map(Number);
        const blockStartMins = blockStartHour * 60 + blockStartMin;
        const blockEndMins = blockEndHour * 60 + blockEndMin;
        
        return (newStartMins < blockEndMins && newEndMins > blockStartMins);
      });

      if (hasConflict) {
        alert("This time slot conflicts with an existing booking. Please choose a different time.");
        setIsSubmitting(false);
        return;
      }

      if (hasBlockConflict) {
        alert("This time slot is blocked. Please choose a different time.");
        setIsSubmitting(false);
        return;
      }

      const bookingData = {
        simulator_id: formData.simulator_id,
        simulator_name: selectedBay.name,
        location: location, // Added location field
        customer_name: formData.customer_name,
        customer_email: formData.customer_email,
        customer_phone: formData.customer_phone,
        booking_date: formattedDate,
        start_time: formData.start_time,
        end_time: endTime,
        duration_hours: formData.duration_hours,
        total_cost: totalCost,
        number_of_players: formData.number_of_players,
        payment_method: formData.payment_method,
        payment_status: formData.payment_status,
        status: "confirmed",
        notes: formData.notes,
        bay_locked: formData.bay_locked
      };

      await Booking.create(bookingData);

      // Send confirmation email + SMS (best-effort; don't block on delivery).
      await Promise.all([
        sendBookingConfirmation(bookingData).catch((err) =>
          console.error("Confirmation email failed:", err)
        ),
        sendBookingConfirmationSMS(bookingData).catch((err) =>
          console.error("Confirmation SMS failed:", err)
        )
      ]);

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

        {/* Bay Selection */}
        <div className="space-y-2">
          <Label htmlFor="bay">Select Bay *</Label>
          <Select 
            value={formData.simulator_id} 
            onValueChange={(value) => setFormData({...formData, simulator_id: value})}
          >
            <SelectTrigger className="h-12">
              <SelectValue placeholder="Choose a bay" />
            </SelectTrigger>
            <SelectContent>
              {sortedSimulators.map(bay => (
                <SelectItem key={bay.id} value={bay.id}>
                  {getBayDisplayName(bay.name)}{bay.bay_type === "vip" ? " - VIP" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            <Label htmlFor="name">Customer Name *</Label>
            <Input
              id="name"
              value={formData.customer_name}
              onChange={(e) => setFormData({...formData, customer_name: e.target.value})}
              required
              className="h-12"
            />
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
              Lock this reservation to the selected bay. When checked, the Smart
              Schedule Optimizer will never move it to a different bay.
            </p>
          </div>
        </div>

        {/* Total Cost Display */}
        {totalCost > 0 && (
          <div className="p-4 bg-emerald-50 rounded-lg">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-lg">Total Cost:</span>
              <span className="text-2xl font-bold text-[#2d5567]">${totalCost.toFixed(2)}</span>
            </div>
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
            disabled={isSubmitting || !formData.simulator_id || !formData.start_time}
            className="flex-1 h-12 bg-[#2d5567] hover:bg-[#1e3a47]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Booking"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
