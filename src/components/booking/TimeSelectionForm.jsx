
import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, Timer } from "lucide-react";

const TIME_SLOTS = [
  { value: "09:00", label: "9:00 AM" },
  { value: "10:00", label: "10:00 AM" },
  { value: "11:00", label: "11:00 AM" },
  { value: "12:00", label: "12:00 PM" },
  { value: "13:00", label: "1:00 PM" },
  { value: "14:00", label: "2:00 PM" },
  { value: "15:00", label: "3:00 PM" },
  { value: "16:00", label: "4:00 PM" },
  { value: "17:00", label: "5:00 PM" },
  { value: "18:00", label: "6:00 PM" },
  { value: "19:00", label: "7:00 PM" },
  { value: "20:00", label: "8:00 PM" },
  { value: "21:00", label: "9:00 PM" },
  { value: "22:00", label: "10:00 PM" }
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

export default function TimeSelectionForm({ 
  selectedDate,
  selectedTime,
  duration,
  onDateChange,
  onTimeChange,
  onDurationChange,
  onSearch
}) {
  const isSunday = selectedDate && selectedDate.getDay() === 0;
  const maxEndHour = isSunday ? 21 : 23;
  
  const getAvailableDurations = () => {
    if (!selectedTime) return DURATIONS;
    const startHour = parseInt(selectedTime.split(':')[0]);
    return DURATIONS.filter(d => startHour + d.value <= maxEndHour);
  };

  const canSearch = selectedDate && selectedTime && duration;

  return (
    <Card className="bg-white/90 backdrop-blur-sm shadow-2xl border-0 overflow-hidden">
      <div className="bg-gradient-to-r from-[#2d5567] to-[#1e3a47] p-6">
        <h2 className="text-2xl sm:text-3xl font-black text-white heading-font flex items-center gap-3">
          <CalendarIcon className="w-7 h-7" />
          Choose Your Time
        </h2>
        <p className="text-blue-50 mt-2">Select date, time, and duration</p>
      </div>
      <CardContent className="space-y-6 p-6">
        {/* Date Selection */}
        <div className="space-y-3">
          <Label className="text-base font-bold flex items-center gap-2 text-slate-700">
            <CalendarIcon className="w-5 h-5 text-[#2d5567]" />
            Select Date
          </Label>
          <div className="flex justify-center w-full overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl p-4">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={onDateChange}
              disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
              className="rounded-xl border-2 border-[#2d5567]/20 shadow-lg"
            />
          </div>
        </div>

        {selectedDate && (
          <>
            {/* Start Time */}
            <div className="space-y-3">
              <Label htmlFor="start-time" className="text-base font-bold text-slate-700">Start Time</Label>
              <Select value={selectedTime || ""} onValueChange={onTimeChange}>
                <SelectTrigger className="h-14 text-base w-full rounded-xl border-2 border-slate-200 hover:border-[#2d5567] transition-colors">
                  <SelectValue placeholder="Choose start time" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.map((time) => {
                    const hour = parseInt(time.value.split(':')[0]);
                    const isAvailable = isSunday ? hour < 21 : hour < 23;
                    return (
                      <SelectItem 
                        key={time.value} 
                        value={time.value} 
                        disabled={!isAvailable}
                        className="text-base py-3"
                      >
                        {time.label} {!isAvailable && "(Closed)"}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Duration */}
            {selectedTime && (
              <div className="space-y-3">
                <Label htmlFor="duration" className="text-base font-bold flex items-center gap-2 text-slate-700">
                  <Timer className="w-5 h-5 text-[#2d5567]" />
                  Duration
                </Label>
                <Select value={String(duration)} onValueChange={(v) => onDurationChange(Number(v))}>
                  <SelectTrigger className="h-14 text-base w-full rounded-xl border-2 border-slate-200 hover:border-[#2d5567] transition-colors">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getAvailableDurations().map((d) => (
                      <SelectItem key={d.value} value={String(d.value)} className="text-base py-3">
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Search Button */}
            {canSearch && (
              <Button
                onClick={onSearch}
                className="w-full h-16 text-lg font-bold bg-gradient-to-r from-[#2d5567] to-[#1e3a47] hover:from-[#1e3a47] hover:to-[#0f1f29] shadow-xl hover:shadow-2xl transition-all duration-300 rounded-xl"
              >
                🔍 Find Available Bays
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
