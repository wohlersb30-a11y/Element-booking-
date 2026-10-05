import React, { useState, useEffect, useCallback } from "react";
import { LessonAvailability, LessonBooking, Simulator, ScheduleBlock } from "@/entities/all";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { X, Plus, Loader2, Trash2, GraduationCap, CalendarDays, MapPin, AlertTriangle } from "lucide-react";
import { getBayDisplayName } from "@/lib/bayNames";
import { format, parseISO } from "date-fns";

// Lesson times are a fixed 60 minutes and may start every 30 minutes. The admin
// only defines WHEN Brandon is available each week (windows); the booking app
// turns those windows into bookable start times.
const TIME_SLOTS = [];
for (let h = 6; h <= 22; h++) {
  for (const m of [0, 30]) {
    if (h === 22 && m === 30) break;
    TIME_SLOTS.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
}

// 0 = Sunday … 6 = Saturday (matches JS getDay / SQL dow / the RPC).
const WEEKDAYS = [
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
  { value: 0, label: "Sunday", short: "Sun" }
];
const weekdayLabel = (v) => WEEKDAYS.find((d) => d.value === v)?.label ?? String(v);

const formatTimeLabel = (value) => {
  if (!value || !value.includes(":")) return String(value ?? "");
  const [h, m] = value.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
};

const toMinutes = (t) => {
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + m;
};

const todayStr = () => format(new Date(), "yyyy-MM-dd");

const emptyForm = {
  weekdays: [1], // Monday by default
  start_time: "09:00",
  end_time: "16:00"
};

export default function LessonScheduleManager({ defaultLocation = "vadnais_heights", onClose, availabilityOnly = false }) {
  const [windows, setWindows] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [simulators, setSimulators] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [assigningId, setAssigningId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      // Availability-only mode (the lesson pro's view) never touches bookings,
      // bays, or blocks — it only reads/writes the weekly windows.
      if (availabilityOnly) {
        const w = await LessonAvailability.filter({ location: defaultLocation }, "weekday");
        setWindows(w || []);
        setBookings([]);
        setSimulators([]);
      } else {
        const [w, b, s] = await Promise.all([
          LessonAvailability.filter({ location: defaultLocation }, "weekday"),
          LessonBooking.filter({ location: defaultLocation }, "lesson_date"),
          Simulator.filter({ location: defaultLocation }, "name")
        ]);
        setWindows(w || []);
        setBookings(b || []);
        setSimulators(s || []);
      }
    } catch (e) {
      console.error("Error loading lesson schedule:", e);
    }
    setIsLoading(false);
  }, [defaultLocation, availabilityOnly]);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setForm({ ...emptyForm });
    setShowForm(true);
  };

  const toggleWeekday = (v) => {
    setForm((f) => {
      const has = f.weekdays.includes(v);
      return { ...f, weekdays: has ? f.weekdays.filter((d) => d !== v) : [...f.weekdays, v] };
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (form.weekdays.length === 0) {
      alert("Please choose at least one day of the week.");
      return;
    }
    if (toMinutes(form.end_time) - toMinutes(form.start_time) < 60) {
      alert("The window must be at least 60 minutes long (lessons are 60 minutes).");
      return;
    }
    setIsSaving(true);
    try {
      // One recurring window per selected weekday.
      for (const weekday of form.weekdays) {
        await LessonAvailability.create({
          location: defaultLocation,
          weekday,
          start_time: form.start_time,
          end_time: form.end_time,
          is_active: true
        });
      }
      setShowForm(false);
      await load();
    } catch (err) {
      console.error("Error saving availability:", err);
      alert("Error saving availability. Please try again.");
    }
    setIsSaving(false);
  };

  const handleDeleteWindow = async (w) => {
    if (!confirm(`Remove ${weekdayLabel(w.weekday)} ${formatTimeLabel(w.start_time)}–${formatTimeLabel(w.end_time)}? Existing booked lessons are not affected.`)) return;
    try {
      await LessonAvailability.delete(w.id);
      await load();
    } catch (e) {
      console.error("Error deleting window:", e);
      alert("Error removing that window.");
    }
  };

  const handleToggleWindow = async (w) => {
    try {
      await LessonAvailability.update(w.id, { is_active: !w.is_active });
      await load();
    } catch (e) {
      console.error("Error toggling window:", e);
    }
  };

  // Assign (or change / clear) the bay a lesson is held at. Assigning writes a
  // schedule block so the public booking page blocks that bay/time; we remember
  // the block on the lesson to keep it in sync on reassignment.
  const assignBay = async (booking, simId) => {
    setAssigningId(booking.id);
    try {
      // Remove the previous block, if any.
      if (booking.block_id) {
        try { await ScheduleBlock.delete(booking.block_id); } catch (e) { console.warn("Old block remove failed:", e); }
      }
      if (!simId) {
        await LessonBooking.update(booking.id, { simulator_id: null, block_id: null });
      } else {
        const block = await ScheduleBlock.create({
          simulator_id: simId,
          location: booking.location,
          block_date: booking.lesson_date,
          start_time: booking.start_time,
          end_time: booking.end_time,
          reason: "Lesson"
        });
        await LessonBooking.update(booking.id, { simulator_id: simId, block_id: block?.id || null });
      }
      await load();
    } catch (e) {
      console.error("Error assigning bay:", e);
      alert("Could not assign that bay. The time may already be blocked or booked on it.");
    }
    setAssigningId(null);
  };

  // Group recurring windows by weekday for a tidy list.
  const grouped = {};
  for (const w of windows) {
    (grouped[w.weekday] = grouped[w.weekday] || []).push(w);
  }
  const orderedWeekdays = WEEKDAYS.map((d) => d.value).filter((v) => grouped[v]);

  const today = todayStr();
  const upcoming = bookings
    .filter((b) => b.status !== "cancelled" && b.lesson_date >= today)
    .sort((a, b) =>
      a.lesson_date === b.lesson_date
        ? String(a.start_time).localeCompare(String(b.start_time))
        : a.lesson_date.localeCompare(b.lesson_date)
    );
  const needsBayCount = upcoming.filter((b) => !b.simulator_id).length;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <GraduationCap className="w-6 h-6 text-[#2d5567]" />
          Lesson Schedule
        </h2>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        )}
      </div>
      <p className="text-sm text-slate-500 mb-6">
        Set Brandon's weekly availability for this location. Lessons are 60 minutes and can start every
        half hour inside a window. Customers book these times when they purchase or redeem lessons.
      </p>

      {/* ---------- Booked lessons / bay assignment ---------- */}
      {!availabilityOnly && (
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-bold text-slate-800">Booked Lessons</h3>
          {needsBayCount > 0 && (
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-800 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              {needsBayCount} need{needsBayCount === 1 ? "s" : ""} a bay
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-[#2d5567]" />
          </div>
        ) : upcoming.length === 0 ? (
          <p className="text-sm text-slate-500 py-2">No upcoming lessons booked.</p>
        ) : (
          <div className="space-y-2">
            {upcoming.map((b) => {
              const needsBay = !b.simulator_id;
              return (
                <Card key={b.id} className={`border-2 ${needsBay ? "border-amber-200 bg-amber-50/40" : "border-indigo-200 bg-indigo-50/30"}`}>
                  <CardContent className="p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-800 text-sm">
                        {format(parseISO(b.lesson_date), "EEE, MMM d")} · {formatTimeLabel(b.start_time)}–{formatTimeLabel(b.end_time)}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {b.customer_name || b.customer_email}
                        {b.customer_phone ? ` · ${b.customer_phone}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <MapPin className="w-4 h-4 text-slate-400" />
                      <Select
                        value={b.simulator_id || "none"}
                        onValueChange={(v) => assignBay(b, v === "none" ? null : v)}
                        disabled={assigningId === b.id}
                      >
                        <SelectTrigger className="h-10 w-44">
                          <SelectValue placeholder="Assign a bay" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Needs a bay</SelectItem>
                          {simulators.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {getBayDisplayName(s.name, s.location)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {assigningId === b.id && <Loader2 className="w-4 h-4 animate-spin text-[#2d5567]" />}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
        <p className="text-xs text-slate-500 mt-2">
          Assigning a bay blocks that bay for the public during the lesson. Change it anytime.
        </p>
      </div>
      )}

      {/* ---------- Weekly availability ---------- */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-bold text-slate-800">Weekly Availability</h3>
        {!showForm && (
          <Button onClick={openNew} className="bg-[#2d5567] hover:bg-[#1e3a47]">
            <Plus className="w-5 h-5 mr-2" />
            Add Availability
          </Button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="space-y-5 mb-6 p-5 bg-teal-50/50 rounded-xl border-2 border-teal-200">
          <h4 className="text-base font-bold text-slate-800">New Weekly Window</h4>

          <div className="space-y-2">
            <Label>Days of the week *</Label>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((d) => {
                const on = form.weekdays.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleWeekday(d.value)}
                    className={`px-3 py-2 rounded-lg border text-sm font-medium transition ${
                      on ? "bg-[#2d5567] text-white border-[#2d5567]" : "bg-white text-slate-700 border-slate-300 hover:border-[#2d5567]"
                    }`}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Available from *</Label>
              <Select value={form.start_time} onValueChange={(v) => setForm({ ...form, start_time: v })}>
                <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.map((t) => (
                    <SelectItem key={t} value={t}>{formatTimeLabel(t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Until *</Label>
              <Select value={form.end_time} onValueChange={(v) => setForm({ ...form, end_time: v })}>
                <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.map((t) => (
                    <SelectItem key={t} value={t}>{formatTimeLabel(t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            The last lesson in a window starts one hour before it ends (e.g. 9:00 AM–4:00 PM ⇒ last start 3:00 PM).
          </p>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="flex-1 h-12">
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving} className="flex-1 h-12 bg-[#2d5567] hover:bg-[#1e3a47]">
              {isSaving ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>) : "Add Window"}
            </Button>
          </div>
        </form>
      )}

      {isLoading ? null : orderedWeekdays.length === 0 ? (
        <p className="text-center text-slate-500 py-6">No weekly availability yet. Add a window above.</p>
      ) : (
        <div className="space-y-5">
          {orderedWeekdays.map((weekday) => (
            <div key={weekday}>
              <p className="font-semibold text-slate-700 mb-2 flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-slate-400" />
                {weekdayLabel(weekday)}
              </p>
              <div className="space-y-2">
                {grouped[weekday]
                  .slice()
                  .sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time))
                  .map((w) => (
                    <Card key={w.id} className={`border-2 ${w.is_active ? "border-teal-200" : "border-slate-200 opacity-70"}`}>
                      <CardContent className="p-3 flex items-center justify-between gap-3">
                        <div>
                          <span className="font-semibold text-slate-800">
                            {formatTimeLabel(w.start_time)} – {formatTimeLabel(w.end_time)}
                          </span>
                          {!w.is_active && (
                            <span className="text-xs px-2 py-0.5 ml-2 rounded-full bg-slate-200 text-slate-500">Hidden</span>
                          )}
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <Button size="sm" variant="outline" onClick={() => handleToggleWindow(w)} className="text-xs">
                            {w.is_active ? "Hide" : "Show"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeleteWindow(w)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
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
