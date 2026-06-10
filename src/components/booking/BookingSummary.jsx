import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Clock, DollarSign, MapPin } from "lucide-react";
import { format } from "date-fns";

export default function BookingSummary({ 
  simulator, 
  date, 
  time, 
  duration 
}) {
  if (!simulator || !date || !time) return null;

  const endTime = `${parseInt(time.split(':')[0]) + duration}:00`;
  const totalCost = simulator.hourly_rate * duration;

  return (
    <Card className="bg-gradient-to-br from-emerald-600 to-emerald-800 text-white shadow-xl">
      <CardHeader>
        <CardTitle className="text-2xl">Booking Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <MapPin className="w-5 h-5 opacity-80" />
          <div>
            <p className="text-sm opacity-80">Simulator</p>
            <p className="font-semibold text-lg">{simulator.name}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 opacity-80" />
          <div>
            <p className="text-sm opacity-80">Date</p>
            <p className="font-semibold">{format(new Date(date), "EEEE, MMMM d, yyyy")}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5 opacity-80" />
          <div>
            <p className="text-sm opacity-80">Time</p>
            <p className="font-semibold">{time} - {endTime}</p>
          </div>
        </div>

        <div className="pt-4 border-t border-white/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              <span className="font-semibold">Total</span>
            </div>
            <span className="text-3xl font-bold">${totalCost}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}