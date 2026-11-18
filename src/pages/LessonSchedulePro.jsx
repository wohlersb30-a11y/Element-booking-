import React, { useState } from "react";
import { useAuth } from "@/lib/SupabaseAuthContext";
import LessonScheduleManager from "@/components/admin/LessonScheduleManager";
import LessonProCalendar from "@/components/lessons/LessonProCalendar";
import { Button } from "@/components/ui/button";
import { GraduationCap, LogOut, CalendarDays, Clock } from "lucide-react";

const LOCATIONS = [
  { value: "vadnais_heights", label: "Vadnais Heights" },
  { value: "burnsville", label: "Burnsville" }
];

const TABS = [
  { value: "calendar", label: "My Calendar", icon: CalendarDays },
  { value: "availability", label: "My Availability", icon: Clock }
];

// Brandon's self-service page. Two tabs: his master calendar of booked lessons
// and his weekly availability (no bays, pricing, or anything else). Accessible
// to the restricted lesson_pro role and to full admins.
export default function LessonSchedulePro() {
  const { user, logout } = useAuth();
  const [location, setLocation] = useState("vadnais_heights");
  const [tab, setTab] = useState("calendar");

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-[#2d5567]" />
            <div>
              <h1 className="text-lg font-bold text-slate-800">Lesson Pro</h1>
              <p className="text-xs text-slate-500">{user?.email}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={logout} className="gap-2">
            <LogOut className="w-4 h-4" />
            Sign out
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* Tab switch: calendar of booked lessons vs. weekly availability. */}
        <div className="flex gap-2 mb-4">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setTab(t.value)}
                className={`h-11 px-4 rounded-xl text-sm font-semibold border-2 transition-colors flex items-center gap-2 ${
                  tab === t.value
                    ? "border-[#2d5567] bg-[#2d5567] text-white"
                    : "border-slate-200 text-slate-600 hover:border-slate-300 bg-white"
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="flex gap-2 mb-4">
          {LOCATIONS.map((l) => (
            <button
              key={l.value}
              type="button"
              onClick={() => setLocation(l.value)}
              className={`h-11 px-4 rounded-xl text-sm font-semibold border-2 transition-colors ${
                location === l.value
                  ? "border-[#2d5567] bg-[#2d5567] text-white"
                  : "border-slate-200 text-slate-600 hover:border-slate-300 bg-white"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          {/* Re-mount on location/tab change so the view reloads that location. */}
          {tab === "calendar" ? (
            <LessonProCalendar key={`cal-${location}`} location={location} />
          ) : (
            <LessonScheduleManager key={`avail-${location}`} defaultLocation={location} availabilityOnly />
          )}
        </div>
      </main>
    </div>
  );
}
