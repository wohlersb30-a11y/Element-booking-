
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Clock, DollarSign, MapPin, Users, MessageSquare, CreditCard } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { computeTax } from "@/config/tax";

const formatTime = (time24) => {
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
};

const calculateEndTime = (startTime, duration) => {
  const [hours, minutes] = startTime.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + (duration * 60);
  const endHours = Math.floor(totalMinutes / 60);
  const endMinutes = totalMinutes % 60;
  return `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
};

// Map old bay names to new display names
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

export default function BookingSummaryNew({ 
  selectedBays,
  date, 
  startTime, 
  duration,
  playerCount,
  notes,
  location,
  totalCost
}) {
  if (!selectedBays || selectedBays.length === 0 || !date || !startTime) return null;

  const endTime24 = calculateEndTime(startTime, duration);
  const startTime12 = formatTime(startTime);
  const endTime12 = formatTime(endTime24);
  const durationText = duration === 1 ? "1 hour" : `${duration} hours`;
  
  const totalBays = selectedBays.reduce((sum, bay) => sum + bay.quantity, 0);
  const effectivePlayerCount = playerCount || 1;

  // totalCost is the pre-tax subtotal; add Minnesota sales tax and hold the sum.
  const { rate: taxRate, tax, total: totalWithTax } = computeTax(totalCost, location);

  return (
    <Card className="bg-gradient-to-br from-[#2d5567] to-[#1e3a47] text-white shadow-xl">
      <CardHeader className="px-4 py-5 sm:p-6">
        <CardTitle className="text-xl sm:text-2xl">Booking Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-4 pb-5 sm:p-6">
        <div className="flex items-start gap-3">
          <MapPin className="w-5 h-5 opacity-80 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm opacity-80 font-medium">Bays Selected</p>
            <div className="space-y-1.5 mt-2">
              {selectedBays.map((bayInfo) => (
                <div key={bayInfo.bay.id} className="flex justify-between items-center gap-2">
                  <p className="font-semibold text-sm sm:text-base truncate">
                    {getBayDisplayName(bayInfo.bay.name)}
                  </p>
                  <span className="text-sm opacity-90 flex-shrink-0">× {bayInfo.quantity}</span>
                </div>
              ))}
            </div>
            <p className="text-sm opacity-80 mt-2 font-medium">
              Total: {totalBays} bay{totalBays !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        
        <div className="flex items-start gap-3">
          <Calendar className="w-5 h-5 opacity-80 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm opacity-80 font-medium">Date</p>
            <p className="font-semibold text-sm sm:text-base">{format(new Date(date), "EEE, MMM d, yyyy")}</p>
          </div>
        </div>
        
        <div className="flex items-start gap-3">
          <Clock className="w-5 h-5 opacity-80 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm opacity-80 font-medium">Time</p>
            <p className="font-semibold text-sm sm:text-base">{startTime12} - {endTime12}</p>
            <p className="text-sm opacity-80">({durationText})</p>
          </div>
        </div>

        {/* Player count now always displayed, defaulting to 1 */}
        <div className="flex items-start gap-3">
          <Users className="w-5 h-5 opacity-80 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm opacity-80 font-medium">Players</p>
            <p className="font-semibold text-sm sm:text-base">{effectivePlayerCount} player{effectivePlayerCount !== 1 ? 's' : ''}</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <CreditCard className="w-5 h-5 opacity-80 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm opacity-80 font-medium">Payment</p>
            <Badge className="bg-white/20 text-white border-white/30 mt-1 text-xs sm:text-sm">
              Authorization Hold
            </Badge>
            <p className="text-xs opacity-70 mt-1">Pay at venue after reservation</p>
          </div>
        </div>

        {notes && (
          <div className="flex items-start gap-3">
            <MessageSquare className="w-5 h-5 opacity-80 mt-1 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm opacity-80 font-medium">Notes</p>
              <p className="text-sm mt-1 opacity-90 break-words">{notes}</p>
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-white/20 space-y-2">
          {selectedBays.map((bayInfo) => (
            <div key={bayInfo.bay.id} className="flex justify-between text-sm gap-2">
              <span className="opacity-80 truncate">
                {getBayDisplayName(bayInfo.bay.name)} × {bayInfo.quantity}
              </span>
              <span className="flex-shrink-0">${(bayInfo.totalCost * bayInfo.quantity).toFixed(2)}</span>
            </div>
          ))}
          <div className="flex justify-between text-sm gap-2 pt-2 border-t border-white/20">
            <span className="opacity-80">Subtotal</span>
            <span className="flex-shrink-0">${totalCost.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm gap-2">
            <span className="opacity-80">Sales tax ({(taxRate * 100).toFixed(3)}%)</span>
            <span className="flex-shrink-0">${tax.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-white/20">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              <span className="font-semibold text-base sm:text-lg">Hold Amount</span>
            </div>
            <span className="text-2xl sm:text-3xl font-bold">${totalWithTax.toFixed(2)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
