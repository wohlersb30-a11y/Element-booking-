import React, { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { Loader2, CalendarDays } from "lucide-react";

// Shared picker for open lesson slots at a location. Shows only future, active
// slots that aren't already held by a (non-cancelled) lesson booking, grouped by
// date. Used both at checkout (schedule the first lesson) and in My Lessons
// (spend a banked credit).
function to12h(t) {
  if (!t || typeof t !== "string" || !t.includes(":")) return String(t ?? "");
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h)) return t;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function todayStr() {
  return format(new Date(), "yyyy-MM-dd");
}

export default function LessonSlotPicker({
  slots = [],
  bookings = [],
  location,
  selectedSlotId,
  onSelect,
  loading = false
}) {
  const bookedSlotIds = useMemo(() => {
    const s = new Set();
    for (const b of bookings) {
      if (b.status !== "cancelled" && b.slot_id) s.add(b.slot_id);
    }
    return s;
  }, [bookings]);

  const grouped = useMemo(() => {
    const today = todayStr();
    const open = (slots || [])
      .filter(
        (s) =>
          s.is_active &&
          (!location || s.location === location) &&
          s.lesson_date >= today &&
          !bookedSlotIds.has(s.id)
      )
      .sort((a, b) =>
        a.lesson_date === b.lesson_date
          ? String(a.start_time).localeCompare(String(b.start_time))
          : a.lesson_date.localeCompare(b.lesson_date)
      );
    const byDate = {};
    for (const s of open) {
      (byDate[s.lesson_date] = byDate[s.lesson_date] || []).push(s);
    }
    return Object.entries(byDate);
  }, [slots, location, bookedSlotIds]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading times…
      </div>
    );
  }

  if (!location) {
    return (
      <p className="text-sm text-slate-500 py-4">Choose a location to see available lesson times.</p>
    );
  }

  if (grouped.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        <CalendarDays className="w-8 h-8 mx-auto mb-2 text-slate-300" />
        <p className="text-sm">No open lesson times at this location yet. Please check back soon.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
      {grouped.map(([date, daySlots]) => (
        <div key={date}>
          <p className="text-sm font-semibold text-slate-700 mb-2">
            {format(parseISO(date), "EEEE, MMM d")}
          </p>
          <div className="flex flex-wrap gap-2">
            {daySlots.map((s) => {
              const active = s.id === selectedSlotId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSelect(s)}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition ${
                    active
                      ? "bg-[#2d5567] text-white border-[#2d5567]"
                      : "bg-white text-slate-700 border-slate-300 hover:border-[#2d5567]"
                  }`}
                  title={s.note || ""}
                >
                  {to12h(s.start_time)}
                  <span className={`ml-1 text-xs ${active ? "text-blue-100" : "text-slate-400"}`}>
                    · {s.duration_minutes}m
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
