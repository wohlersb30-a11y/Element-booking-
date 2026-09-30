import React, { useState, useEffect, useCallback } from "react";
import { LessonSlot, LessonBooking } from "@/entities/all";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { X, Plus, Loader2, Trash2, GraduationCap, CalendarDays } from "lucide-react";
import { format, parseISO } from "date-fns";

const TIME_SLOTS = [];
for (let h = 6; h <= 21; h++) {
  for (const m of [0, 30]) {
    TIME_SLOTS.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
}

const DURATIONS = [30, 45, 60, 90, 120];

const formatTimeLabel = (value) => {
  if (!value || !value.includes(":")) return String(value ?? "");
  const [h, m] = value.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
};

// Add `minutes` to an 'HH:MM' string, returning 'HH:MM' (clamped within a day).
const addMinutes = (time, minutes) => {
  const [h, m] = String(time).split(":").map(Number);
  let total = h * 60 + m + Number(minutes || 0);
  if (total > 23 * 60 + 59) total = 23 * 60 + 59;
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
};

const todayStr = () => format(new Date(), "yyyy-MM-dd");

const emptyForm = {
  lesson_date: todayStr(),
  start_time: "10:00",
  duration_minutes: 60,
  note: "",
  is_active: true
};

export default function LessonScheduleManager({ defaultLocation = "vadnais_heights", onClose }) {
  const [slots, setSlots] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [s, b] = await Promise.all([
        LessonSlot.filter({ location: defaultLocation }, "lesson_date"),
        LessonBooking.filter({ location: defaultLocation }, "-lesson_date")
      ]);
      setSlots(s || []);
      setBookings(b || []);
    } catch (e) {
      console.error("Error loading lesson schedule:", e);
    }
    setIsLoading(false);
  }, [defaultLocation]);

  useEffect(() => {
    load();
  }, [load]);

  const bookedSlotIds = new Set(
    bookings.filter((b) => b.status !== "cancelled" && b.slot_id).map((b) => b.slot_id)
  );

  const openNew = () => {
    setForm({ ...emptyForm });
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.lesson_date) {
      alert("Please choose a date.");
      return;
    }
    setIsSaving(true);
    try {
      await LessonSlot.create({
        location: defaultLocation,
        lesson_date: form.lesson_date,
        start_time: form.start_time,
        end_time: addMinutes(form.start_time, form.duration_minutes),
        duration_minutes: Number(form.duration_minutes) || 60,
        note: form.note.trim() || null,
        is_active: form.is_active
      });
      setShowForm(false);
      await load();
    } catch (err) {
      console.error("Error saving lesson slot:", err);
      alert("Error saving lesson time. Please try again.");
    }
    setIsSaving(false);
  };

  const handleDelete = async (slot) => {
    if (bookedSlotIds.has(slot.id)) {
      alert("This time is already booked by a customer and can't be deleted. Cancel the booking first if needed.");
      return;
    }
    if (!confirm("Delete this lesson time? This cannot be undone.")) return;
    try {
      await LessonSlot.delete(slot.id);
      await load();
    } catch (e) {
      console.error("Error deleting lesson slot:", e);
      alert("Error deleting lesson time.");
    }
  };

  const handleToggleActive = async (slot) => {
    try {
      await LessonSlot.update(slot.id, { is_active: !slot.is_active });
      await load();
    } catch (e) {
      console.error("Error toggling lesson slot:", e);
    }
  };

  // Group slots by date for a tidy list.
  const grouped = {};
  for (const s of slots) {
    (grouped[s.lesson_date] = grouped[s.lesson_date] || []).push(s);
  }
  const dates = Object.keys(grouped).sort();

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
        Set Brandon's availability for this location. Customers book these times when they purchase or
        redeem lessons.
      </p>

      {!showForm && (
        <Button onClick={openNew} className="mb-6 bg-[#2d5567] hover:bg-[#1e3a47]">
          <Plus className="w-5 h-5 mr-2" />
          Add Lesson Time
        </Button>
      )}

      {showForm && (
        <form onSubmit={handleSave} className="space-y-5 mb-8 p-5 bg-teal-50/50 rounded-xl border-2 border-teal-200">
          <h3 className="text-lg font-bold text-slate-800">New Lesson Time</h3>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input
                type="date"
                min={todayStr()}
                value={form.lesson_date}
                onChange={(e) => setForm({ ...form, lesson_date: e.target.value })}
                className="h-12"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Start Time *</Label>
              <Select value={form.start_time} onValueChange={(v) => setForm({ ...form, start_time: v })}>
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.map((t) => (
                    <SelectItem key={t} value={t}>{formatTimeLabel(t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Length</Label>
              <Select
                value={String(form.duration_minutes)}
                onValueChange={(v) => setForm({ ...form, duration_minutes: Number(v) })}
              >
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((d) => (
                    <SelectItem key={d} value={String(d)}>{d} min</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Ends</Label>
              <Input
                value={formatTimeLabel(addMinutes(form.start_time, form.duration_minutes))}
                readOnly
                className="h-12 bg-slate-100"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Note (optional)</Label>
            <Textarea
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="e.g. Juniors only"
              rows={2}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="slot-active"
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="w-5 h-5 accent-[#2d5567]"
            />
            <Label htmlFor="slot-active" className="cursor-pointer">
              Active (visible to customers)
            </Label>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="flex-1 h-12">
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving} className="flex-1 h-12 bg-[#2d5567] hover:bg-[#1e3a47]">
              {isSaving ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
              ) : (
                "Add Time"
              )}
            </Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-[#2d5567]" />
        </div>
      ) : dates.length === 0 ? (
        <p className="text-center text-slate-500 py-8">No lesson times yet. Add one above.</p>
      ) : (
        <div className="space-y-5">
          {dates.map((date) => (
            <div key={date}>
              <p className="font-semibold text-slate-700 mb-2 flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-slate-400" />
                {format(parseISO(date), "EEEE, MMM d, yyyy")}
              </p>
              <div className="space-y-2">
                {grouped[date].map((slot) => {
                  const booked = bookedSlotIds.has(slot.id);
                  return (
                    <Card
                      key={slot.id}
                      className={`border-2 ${
                        booked ? "border-emerald-200 bg-emerald-50/40" : slot.is_active ? "border-teal-200" : "border-slate-200 opacity-70"
                      }`}
                    >
                      <CardContent className="p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <span className="font-semibold text-slate-800">
                            {formatTimeLabel(slot.start_time)} – {formatTimeLabel(slot.end_time)}
                          </span>
                          <span className="text-xs text-slate-500 ml-2">{slot.duration_minutes} min</span>
                          {slot.note && <span className="text-xs text-slate-500 ml-2">· {slot.note}</span>}
                          <div className="mt-1 flex items-center gap-2">
                            {booked ? (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                                Booked
                              </span>
                            ) : (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                Open
                              </span>
                            )}
                            {!slot.is_active && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-500">
                                Hidden
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          {!booked && (
                            <Button size="sm" variant="outline" onClick={() => handleToggleActive(slot)} className="text-xs">
                              {slot.is_active ? "Hide" : "Show"}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDelete(slot)}
                            disabled={booked}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 disabled:opacity-40"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
