import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CalendarDays, Clock, User, Phone } from "lucide-react";
import { format, parseISO, addDays, subDays } from "date-fns";

const formatTimeLabel = (value) => {
  if (!value || !value.includes(":")) return String(value ?? "");
  const [h, m] = value.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
};

const sourceLabel = (s) =>
  s === "bank" ? "Redeemed" : s === "package" ? "Package" : "Single";

// Brandon's master calendar: every lesson customers have booked with him at the
// selected location. Reads through the lesson_pro_calendar RPC, which is gated
// to the pro/admin roles (his RLS can't see other customers' bookings directly).
export default function LessonProCalendar({ location }) {
  const [view, setView] = useState("upcoming"); // 'upcoming' | 'past'
  const [lessons, setLessons] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const today = new Date();
    const from =
      view === "upcoming"
        ? format(today, "yyyy-MM-dd")
        : format(subDays(today, 60), "yyyy-MM-dd");
    const to =
      view === "upcoming"
        ? format(addDays(today, 120), "yyyy-MM-dd")
        : format(subDays(today, 1), "yyyy-MM-dd");
    try {
      const { data, error: rpcError } = await supabase.rpc("lesson_pro_calendar", {
        p_from: from,
        p_to: to,
        p_location: location,
      });
      if (rpcError) throw rpcError;
      const rows = data || [];
      // Past view reads most-recent first; upcoming reads soonest first.
      rows.sort((a, b) => {
        const cmp =
          a.lesson_date === b.lesson_date
            ? String(a.start_time).localeCompare(String(b.start_time))
            : a.lesson_date.localeCompare(b.lesson_date);
        return view === "past" ? -cmp : cmp;
      });
      setLessons(rows);
    } catch (e) {
      console.error("Error loading lesson calendar:", e);
      setError("Could not load your lessons. Please try again.");
      setLessons([]);
    }
    setIsLoading(false);
  }, [location, view]);

  useEffect(() => {
    load();
  }, [load]);

  // Group by date for a tidy day-by-day calendar.
  const byDate = {};
  for (const l of lessons) {
    (byDate[l.lesson_date] = byDate[l.lesson_date] || []).push(l);
  }
  const dates = Object.keys(byDate).sort((a, b) =>
    view === "past" ? b.localeCompare(a) : a.localeCompare(b)
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <CalendarDays className="w-6 h-6 text-[#2d5567]" />
          My Calendar
        </h2>
        <div className="flex gap-2">
          {[
            { value: "upcoming", label: "Upcoming" },
            { value: "past", label: "Past" },
          ].map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setView(t.value)}
              className={`h-9 px-4 rounded-lg text-sm font-semibold border transition-colors ${
                view === t.value
                  ? "border-[#2d5567] bg-[#2d5567] text-white"
                  : "border-slate-200 text-slate-600 hover:border-slate-300 bg-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        Every lesson booked with you at this location. Switch the location at the
        top of the page to see the other club.
      </p>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-[#2d5567]" />
        </div>
      ) : error ? (
        <p className="text-sm text-rose-600 py-2">{error}</p>
      ) : dates.length === 0 ? (
        <p className="text-center text-slate-500 py-10">
          {view === "upcoming"
            ? "No upcoming lessons booked here yet."
            : "No lessons in the last 60 days here."}
        </p>
      ) : (
        <div className="space-y-6">
          {dates.map((d) => (
            <div key={d}>
              <p className="font-semibold text-slate-700 mb-2 flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-slate-400" />
                {format(parseISO(d), "EEEE, MMM d, yyyy")}
              </p>
              <div className="space-y-2">
                {byDate[d].map((l) => (
                  <Card
                    key={l.id}
                    className={`border-2 ${
                      l.status === "completed"
                        ? "border-slate-200 bg-slate-50/60"
                        : "border-indigo-200 bg-indigo-50/30"
                    }`}
                  >
                    <CardContent className="p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                      <p className="font-semibold text-slate-800 text-sm flex items-center gap-1.5 sm:w-44 flex-shrink-0">
                        <Clock className="w-4 h-4 text-slate-400" />
                        {formatTimeLabel(l.start_time)} – {formatTimeLabel(l.end_time)}
                      </p>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-800 flex items-center gap-1.5">
                          <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          <span className="truncate">
                            {l.customer_name || l.customer_email || "Customer"}
                          </span>
                        </p>
                        {l.customer_phone && (
                          <a
                            href={`tel:${l.customer_phone}`}
                            className="text-xs text-[#2d5567] hover:underline flex items-center gap-1.5 mt-0.5"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            {l.customer_phone}
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          {sourceLabel(l.booking_source)}
                        </span>
                        {l.status === "completed" && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                            Done
                          </span>
                        )}
                        {l.status === "no_show" && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                            No-show
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
