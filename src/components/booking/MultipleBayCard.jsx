import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Crown, Plus, Minus, Sparkles } from "lucide-react";
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

export default function MultipleBayCard({ 
  bay, 
  rate, 
  totalCost,
  duration,
  quantity = 0,
  onQuantityChange,
  isSelected
}) {
  const isVIP = bay.bay_type === "vip";
  const durationText = duration === 1 ? "1 hour" : `${duration} hours`;
  const displayName = getBayDisplayName(bay.name);

  const handleIncrement = (e) => {
    e.stopPropagation();
    onQuantityChange(quantity + 1);
  };

  const handleDecrement = (e) => {
    e.stopPropagation();
    if (quantity > 0) {
      onQuantityChange(quantity - 1);
    }
  };

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.2 }}
    >
      <Card 
        className={`transition-all duration-300 overflow-hidden ${
          isSelected 
            ? 'ring-4 ring-[#2d5567] shadow-2xl bg-gradient-to-br from-blue-50 to-slate-50' 
            : 'hover:ring-2 hover:ring-[#2d5567]/50 hover:shadow-xl bg-white'
        }`}
      >
        {isVIP && (
          <div className="h-2 bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-400"></div>
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
                <Badge className={`${
                  isVIP 
                    ? "bg-gradient-to-r from-amber-100 to-yellow-100 text-amber-800 border-amber-300" 
                    : "bg-gradient-to-r from-blue-100 to-slate-100 text-[#2d5567] border-[#2d5567]/20"
                } text-xs font-semibold border mt-1`}>
                  {isVIP ? "VIP Bay" : "Standard Bay"}
                </Badge>
              </div>
            </div>
            {quantity > 0 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
              >
                <Badge className="bg-gradient-to-r from-[#2d5567] to-[#1e3a47] text-white text-base px-3 py-1 shadow-lg">
                  {quantity}
                </Badge>
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
              <span className="font-bold text-slate-700">Cost per Bay</span>
              <span className="text-2xl font-black bg-gradient-to-r from-[#2d5567] to-[#1e3a47] text-transparent bg-clip-text">
                ${totalCost}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleDecrement}
              disabled={quantity === 0}
              className="h-12 w-12 rounded-xl border-2 hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-all active:scale-90"
            >
              <Minus className="w-5 h-5" />
            </Button>
            <div className="flex-1 text-center bg-slate-100 rounded-xl py-3">
              <span className="text-2xl font-black text-slate-800">{quantity}</span>
              <span className="text-xs text-slate-500 ml-2 font-medium">bay{quantity !== 1 ? 's' : ''}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleIncrement}
              className="h-12 w-12 rounded-xl border-2 hover:bg-blue-50 hover:border-[#2d5567] hover:text-[#2d5567] transition-all active:scale-90"
            >
              <Plus className="w-5 h-5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}