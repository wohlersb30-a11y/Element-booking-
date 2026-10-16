
import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, Minus, Plus } from "lucide-react";

const MIN_PLAYERS = 1;
const MAX_PLAYERS = 20;

const clamp = (n) => Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, n));

// Number-of-players picker. The old version forced `value` back to the parsed
// number on every keystroke (`parseInt(value) || 1`), so clearing the field to
// type a new number snapped it straight back to 1 — customers literally could
// not change it. This version keeps a local text value so the field can be
// cleared/retyped freely, commits a clamped integer to the parent, and offers
// −/+ steppers so it's reliable on mobile. The parent value is always a valid
// 1–20 integer, so checkout can never receive an empty or out-of-range count.
export default function PlayerCountInput({ playerCount, onChange }) {
  const [text, setText] = useState(String(playerCount ?? MIN_PLAYERS));

  // Sync from the parent only when the committed number actually differs from
  // what's typed, so external changes reflect here without clobbering an
  // in-progress edit.
  useEffect(() => {
    setText((prev) =>
      parseInt(prev, 10) === playerCount ? prev : String(playerCount ?? MIN_PLAYERS)
    );
  }, [playerCount]);

  const commit = (n) => {
    const c = clamp(Number.isNaN(n) ? MIN_PLAYERS : n);
    setText(String(c));
    onChange(c);
  };

  const handleChange = (e) => {
    const raw = e.target.value;
    setText(raw); // let the field display exactly what's typed
    if (raw === "") return; // allow an empty field mid-edit; commit on blur
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n)) onChange(clamp(n)); // keep the parent value valid
  };

  const handleBlur = () => commit(parseInt(text, 10));

  const step = (delta) => commit((parseInt(text, 10) || MIN_PLAYERS) + delta);

  const current = parseInt(text, 10) || MIN_PLAYERS;

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
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => step(-1)}
              disabled={current <= MIN_PLAYERS}
              aria-label="Fewer players"
              className="h-12 w-12 sm:h-14 sm:w-14 flex-shrink-0 rounded-xl border-[#2d5567]/20"
            >
              <Minus className="w-5 h-5" />
            </Button>
            <Input
              id="players"
              type="number"
              inputMode="numeric"
              min={MIN_PLAYERS}
              max={MAX_PLAYERS}
              value={text}
              onChange={handleChange}
              onBlur={handleBlur}
              className="h-12 sm:h-14 text-base sm:text-lg text-center border-[#2d5567]/20 focus:ring-[#2d5567] w-full"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => step(1)}
              disabled={current >= MAX_PLAYERS}
              aria-label="More players"
              className="h-12 w-12 sm:h-14 sm:w-14 flex-shrink-0 rounded-xl border-[#2d5567]/20"
            >
              <Plus className="w-5 h-5" />
            </Button>
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            This helps us prepare the bay for your group
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
