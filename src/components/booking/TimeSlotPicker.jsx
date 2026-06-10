import React from "react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

const TIME_SLOTS = [
  "08:00", "09:00", "10:00", "11:00", "12:00", 
  "13:00", "14:00", "15:00", "16:00", "17:00", 
  "18:00", "19:00", "20:00", "21:00"
];

export default function TimeSlotPicker({ 
  selectedDate, 
  selectedTime, 
  onTimeSelect, 
  bookedSlots = [] 
}) {
  const isTimeBooked = (time) => {
    return bookedSlots.some(slot => 
      slot.booking_date === selectedDate && slot.start_time === time
    );
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-slate-800">Select Time</h3>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
        {TIME_SLOTS.map((time, index) => {
          const isBooked = isTimeBooked(time);
          const isSelected = selectedTime === time;
          
          return (
            <motion.div
              key={time}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.02 }}
            >
              <Button
                variant={isSelected ? "default" : "outline"}
                disabled={isBooked}
                onClick={() => onTimeSelect(time)}
                className={`w-full h-12 ${
                  isSelected 
                    ? "bg-emerald-600 hover:bg-emerald-700 shadow-lg" 
                    : isBooked 
                    ? "opacity-40 cursor-not-allowed" 
                    : "hover:bg-emerald-50 hover:border-emerald-300"
                }`}
              >
                {time}
              </Button>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}