
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Users } from "lucide-react";

export default function PlayerCountInput({ playerCount, onChange }) {
  return (
    <Card className="bg-white/90 backdrop-blur-sm shadow-xl border-0">
      <CardHeader className="p-4 sm:p-6 pb-3">
        <CardTitle className="text-lg sm:text-xl text-slate-800 flex items-center gap-2">
          <Users className="w-5 h-5 text-[#2d5567] flex-shrink-0" />
          <span className="leading-tight">Number of Players</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0">
        <div className="space-y-2">
          <Input
            id="players"
            type="number"
            min="1"
            max="20"
            value={playerCount}
            onChange={(e) => onChange(parseInt(e.target.value) || 1)}
            className="h-12 sm:h-14 text-base sm:text-lg border-[#2d5567]/20 focus:ring-[#2d5567] w-full"
          />
          <p className="text-xs sm:text-sm text-slate-500">
            This helps us prepare the bay for your group
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
