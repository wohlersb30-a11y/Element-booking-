import React, { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { Loader2, CalendarDays } from "lucide-react";

// Shared picker for open lesson times at a location. Takes the flat list of
// available 60-minute start times returned by the `open_lesson_times` RPC
// (each row: { lesson_date, start_time, end_time }), groups them by date, and
// lets the customer pick one. Used both at checkout (schedule the first lesson)
// and in My Lessons (spend a banked credit).
function to12h(t) {
  if (!t || typeof t !== "string" || !t.includes(":")) return String(t ?? "");
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h)) return t;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

// Stable key for a time slot (a date + start time uniquely identifies one).
function timeKey(t) {
  return t ? `${t.lesson_date}T${t.start_time}` : "";
}

export default function LessonSlotPicker({
  times = [],
  location,
  selected,
  onSelect,
  loading = false
}) {
  const grouped = useMemo(() => {
    const sorted = [...(times || [])].sort((a, b) =>
      a.lesson_date === b.lesson_date
        ? String(a.start_time).localeCompare(String(b.start_time))
        : String(a.lesson_date).localeCompare(String(b.lesson_date))
    );
    const byDate = {};
    for (const t of sorted) {
      (byDate[t.lesson_date] = byDate[t.lesson_date] || []).push(t);
    }
    return Object.entries(byDate);
  }, [times]);

  const selectedKey = timeKey(selected);

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
      {grouped.map(([date, dayTimes]) => (
        <div key={date}>
          <p className="text-sm font-semibold text-slate-700 mb-2">
            {format(parseISO(date), "EEEE, MMM d")}
          </p>
          <div className="flex flex-wrap gap-2">
            {dayTimes.map((t) => {
              const active = timeKey(t) === selectedKey;
              return (
                <button
                  key={timeKey(t)}
                  type="button"
                  onClick={() => onSelect(t)}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition ${
                    active
                      ? "bg-[#2d5567] text-white border-[#2d5567]"
                      : "bg-white text-slate-700 border-slate-300 hover:border-[#2d5567]"
                  }`}
                >
                  {to12h(t.start_time)}
                  <span className={`ml-1 text-xs ${active ? "text-blue-100" : "text-slate-400"}`}>
                    · 60m
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
