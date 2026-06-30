import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Crown, Sparkles, Check } from "lucide-react";
import { motion } from "framer-motion";

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

export default function AvailableBayCard({ 
  bay, 
  rate, 
  totalCost,
  duration,
  onSelect, 
  isSelected
}) {
  const isVIP = bay.bay_type === "vip";
  const durationText = duration === 1 ? "1 hour" : `${duration} hours`;
  const displayName = getBayDisplayName(bay.name);

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.2 }}
    >
      <Card
        className={`cursor-pointer transition-all duration-300 overflow-hidden rounded-2xl ${
          isSelected
            ? 'ring-4 ring-[#2d5567] shadow-2xl bg-gradient-to-br from-blue-50 to-slate-50'
            : 'ring-1 ring-slate-200 hover:ring-2 hover:ring-[#2d5567]/50 hover:shadow-xl bg-white'
        }`}
        onClick={onSelect}
      >
        <div className={`h-1.5 ${
          isVIP
            ? 'bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-400'
            : 'bg-gradient-to-r from-[#2d5567] to-[#1e3a47]'
        }`}></div>
        {isSelected && (
          <div className="bg-[#2d5567] text-white text-xs font-bold tracking-wide uppercase text-center py-1">
            Added to your booking
          </div>
        )}
        <CardHeader className="p-5 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                isVIP ? 'bg-gradient-to-br from-amber-400 to-yellow-500' : 'bg-gradient-to-br from-[#2d5567] to-[#1e3a47]'
              } shadow-lg`}>
                {isVIP ? (
                  <Crown className="w-6 h-6 text-white" />
                ) : (
                  <Sparkles className="w-6 h-6 text-white" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <CardTitle className="text-xl font-black text-slate-800 truncate heading-font">
                  {displayName}
                </CardTitle>
                {isVIP && (
                  <Badge className="bg-gradient-to-r from-amber-100 to-yellow-100 text-amber-800 border-amber-300 text-xs font-semibold border mt-1">
                    VIP Bay
                  </Badge>
                )}
              </div>
            </div>
            {isSelected && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="flex-shrink-0"
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#2d5567] to-[#1e3a47] flex items-center justify-center shadow-lg">
                  <Check className="w-6 h-6 text-white" />
                </div>
              </motion.div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          <p className="text-slate-600 text-sm mb-4 line-clamp-2">{bay.description}</p>
          
          <div className="bg-slate-50 rounded-xl p-4 mb-4 space-y-2">
            <div className="flex justify-between text-sm text-slate-600">
              <span className="font-medium">Rate per hour</span>
              <span className="font-bold text-[#2d5567]">${rate}</span>
            </div>
            <div className="flex justify-between text-sm text-slate-600">
              <span className="font-medium">Duration</span>
              <span className="font-semibold">{durationText}</span>
            </div>
            <div className="h-px bg-slate-200 my-2"></div>
            <div className="flex justify-between items-center pt-1">
              <span className="font-bold text-slate-700">Total Cost</span>
              <span className="text-2xl font-black bg-gradient-to-r from-[#2d5567] to-[#1e3a47] text-transparent bg-clip-text">
                ${totalCost}
              </span>
            </div>
          </div>
          
          <Button
            type="button"
            className={`w-full h-12 text-base font-bold transition-all ${
              isSelected 
                ? 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800' 
                : 'bg-gradient-to-r from-[#2d5567] to-[#1e3a47] hover:from-[#1e3a47] hover:to-[#0f1f29]'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
          >
            {isSelected ? (
              <>
                <Check className="w-5 h-5 mr-2" />
                Added — tap to remove
              </>
            ) : (
              'Add This Bay'
            )}
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}