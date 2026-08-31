
import React, { useState } from "react";
import { ScheduleBlock } from "@/entities/ScheduleBlock";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { X, Loader2, AlertTriangle } from "lucide-react";
import { format, eachDayOfInterval } from "date-fns";

const toMinutes = (t) => {
  if (!t || typeof t !== "string" || !t.includes(":")) return NaN;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

const prettyTime = (t) => {
  const mins = toMinutes(t);
  if (Number.isNaN(mins)) return String(t ?? "");
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  const period = hours >= 12 ? "PM" : "AM";
  const hours12 = hours % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${period}`;
};

const TIME_SLOTS = [
  { value: "09:00", label: "9:00 AM" },
  { value: "10:00", label: "10:00 AM" },
  { value: "11:00", label: "11:00 AM" },
  { value: "12:00", label: "12:00 PM" },
  { value: "13:00", label: "1:00 PM" },
  { value: "14:00", label: "2:00 PM" },
  { value: "15:00", label: "3:00 PM" },
  { value: "16:00", label: "4:00 PM" },
  { value: "17:00", label: "5:00 PM" },
  { value: "18:00", label: "6:00 PM" },
  { value: "19:00", label: "7:00 PM" },
  { value: "20:00", label: "8:00 PM" },
  { value: "21:00", label: "9:00 PM" },
  { value: "22:00", label: "10:00 PM" },
  { value: "23:00", label: "11:00 PM" }
];

// Day bounds used to fill whole days in a continuous span block: the first day
// runs from the chosen start time to close, interior days are fully blocked
// (open→close), and the last day runs from open to the chosen end time.
const OPEN_TIME = TIME_SLOTS[0].value; // 09:00
const CLOSE_TIME = TIME_SLOTS[TIME_SLOTS.length - 1].value; // 23:00

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

export default function BlockScheduleForm({ simulators, onClose, onComplete, initialDate, location }) {
  const [formData, setFormData] = useState({
    start_time: "",
    end_time: "",
    reason: "league",
    notes: ""
  });
  // Date range: `to` is optional — when unset the block covers just `from`.
  const [dateRange, setDateRange] = useState({
    from: initialDate || new Date(),
    to: undefined
  });
  // Which bays to block. Empty = none selected yet.
  const [selectedBayIds, setSelectedBayIds] = useState([]);
  // "daily" = same time window on each day (leagues); "span" = one continuous
  // block from the start time on the first day to the end time on the last day,
  // with interior days fully blocked.
  const [blockMode, setBlockMode] = useState("daily");
  // When true, every selected day is blocked open→close and the time pickers /
  // span-vs-daily choice no longer apply.
  const [fullDay, setFullDay] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Existing customer bookings that fall inside the requested block window.
  // When non-empty we pause and make the admin confirm before writing blocks.
  const [conflicts, setConflicts] = useState([]);
  const [pendingRows, setPendingRows] = useState(null);

  const sortedSimulators = [...simulators].sort((a, b) => {
    const aIsVIP = a.bay_type === "vip";
    const bIsVIP = b.bay_type === "vip";
    if (aIsVIP && !bIsVIP) return 1;
    if (!aIsVIP && bIsVIP) return -1;
    return a.name.localeCompare(b.name);
  });

  const allSelected =
    sortedSimulators.length > 0 && selectedBayIds.length === sortedSimulators.length;

  const toggleAllBays = () => {
    setSelectedBayIds(allSelected ? [] : sortedSimulators.map((b) => b.id));
  };

  const toggleBay = (id) => {
    setSelectedBayIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const isMultiDay =
    !!dateRange?.from &&
    !!dateRange?.to &&
    format(dateRange.to, "yyyy-MM-dd") !== format(dateRange.from, "yyyy-MM-dd");
  // Span mode only applies to a real multi-day range.
  const effectiveMode = isMultiDay ? blockMode : "daily";

  // Compute the block window (start/end time) for a given day index within the
  // range. In "daily" mode every day uses the same chosen window. In "span" mode
  // the block is continuous: the first day starts at the chosen time and runs to
  // close, interior days are fully blocked, and the final day runs from open to
  // the chosen end time. A single-day span is simply start→end that day.
  const windowForDay = (index, lastIndex) => {
    // Whole-day block: every day runs open→close, regardless of mode.
    if (fullDay) return { start_time: OPEN_TIME, end_time: CLOSE_TIME };
    if (blockMode === "daily" || lastIndex === 0) {
      return { start_time: formData.start_time, end_time: formData.end_time };
    }
    if (index === 0) return { start_time: formData.start_time, end_time: CLOSE_TIME };
    if (index === lastIndex) return { start_time: OPEN_TIME, end_time: formData.end_time };
    return { start_time: OPEN_TIME, end_time: CLOSE_TIME };
  };

  const buildRows = () => {
    // Every day in the (inclusive) range; falls back to a single day when no
    // end date is chosen.
    const start = dateRange.from;
    const end = dateRange.to || dateRange.from;
    const days = eachDayOfInterval({ start, end });
    const lastIndex = days.length - 1;

    const baysToBlock = simulators.filter((s) => selectedBayIds.includes(s.id));

    // One block row per bay × per day, using each day's computed window.
    const rows = [];
    days.forEach((day, index) => {
      const formattedDate = format(day, "yyyy-MM-dd");
      const win = windowForDay(index, lastIndex);
      for (const bay of baysToBlock) {
        rows.push({
          simulator_id: bay.id,
          simulator_name: bay.name,
          location: location,
          block_date: formattedDate,
          start_time: win.start_time,
          end_time: win.end_time,
          reason: formData.reason,
          notes: formData.notes
        });
      }
    });
    return rows;
  };

  // Find existing customer bookings (regular + prime member) that overlap the
  // requested block window, so the admin isn't surprised to be blocking over
  // people who already reserved those bays.
  const findConflicts = async (rows) => {
    const bayIds = [...new Set(rows.map((r) => r.simulator_id))];
    const dates = [...new Set(rows.map((r) => r.block_date))];

    const [{ data: reg }, { data: mem }] = await Promise.all([
      supabase
        .from("bookings")
        .select("simulator_id, simulator_name, customer_name, booking_date, start_time, end_time, status")
        .in("simulator_id", bayIds)
        .in("booking_date", dates)
        .neq("status", "cancelled"),
      supabase
        .from("member_bookings")
        .select("simulator_id, simulator_name, member_name, booking_date, start_time, end_time, status")
        .in("simulator_id", bayIds)
        .in("booking_date", dates)
        .neq("status", "cancelled")
    ]);

    const all = [
      ...(reg || []).map((b) => ({ ...b, who: b.customer_name || "Customer" })),
      ...(mem || []).map((b) => ({ ...b, who: `${b.member_name || "Member"} (member)` }))
    ];

    // Compare each existing booking against the specific block window for its
    // bay + day (windows can differ per day in span mode), so we don't miss or
    // over-report overlaps.
    const found = [];
    for (const row of rows) {
      const bs = toMinutes(row.start_time);
      const be = toMinutes(row.end_time);
      for (const b of all) {
        if (b.simulator_id !== row.simulator_id) continue;
        if (b.booking_date !== row.block_date) continue;
        if (bs < toMinutes(b.end_time) && be > toMinutes(b.start_time)) {
          found.push(b);
        }
      }
    }
    // Sort by date then start time for a readable list.
    found.sort((a, c) =>
      a.booking_date === c.booking_date
        ? toMinutes(a.start_time) - toMinutes(c.start_time)
        : a.booking_date.localeCompare(c.booking_date)
    );
    return found;
  };

  const createBlocks = async (rows) => {
    setIsSubmitting(true);
    try {
      await ScheduleBlock.bulkCreate(rows);
      onComplete();
    } catch (error) {
      console.error("Error creating block:", error);
      alert("Error creating block. Please try again.");
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setConflicts([]);
    setPendingRows(null);

    try {
      const rows = buildRows();
      if (rows.length === 0) {
        alert("Please select at least one bay and a date.");
        setIsSubmitting(false);
        return;
      }

      const found = await findConflicts(rows);
      if (found.length > 0) {
        // Pause and surface the overlaps; the admin decides via "Block anyway".
        setConflicts(found);
        setPendingRows(rows);
        setIsSubmitting(false);
        return;
      }

      await createBlocks(rows);
    } catch (error) {
      console.error("Error creating block:", error);
      alert("Error creating block. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Block Schedule</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label>Date(s) *</Label>
          <p className="text-xs text-slate-500">
            Pick one day, or click a start and end date to block a range.
          </p>
          <div className="flex justify-center">
            <Calendar
              mode="range"
              selected={dateRange}
              onSelect={(range) =>
                setDateRange(range || { from: undefined, to: undefined })
              }
              numberOfMonths={1}
              className="rounded-xl border-2 border-emerald-100"
            />
          </div>
          {dateRange?.from && (
            <p className="text-sm text-center text-slate-600">
              {isMultiDay
                ? `Blocking ${format(dateRange.from, "MMM d")} – ${format(dateRange.to, "MMM d, yyyy")}`
                : `Blocking ${format(dateRange.from, "MMM d, yyyy")}`}
            </p>
          )}
        </div>

        <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 cursor-pointer hover:bg-slate-50">
          <Checkbox checked={fullDay} onCheckedChange={(v) => setFullDay(!!v)} />
          <span>
            <span className="block font-semibold text-slate-800">Block entire day</span>
            <span className="block text-xs text-slate-500">
              Blocks all hours (open–close){isMultiDay ? " on every selected day" : ""} — no need to pick times.
            </span>
          </span>
        </label>

        {isMultiDay && !fullDay && (
          <div className="space-y-2">
            <Label>How should these days be blocked? *</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setBlockMode("daily")}
                className={`text-left rounded-xl border-2 p-3 transition-colors ${
                  effectiveMode === "daily"
                    ? "border-[#2d5567] bg-[#2d5567]/5"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <span className="block font-semibold text-slate-800">Same time each day</span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  e.g. block 5–9 PM every day (leagues, recurring events)
                </span>
              </button>
              <button
                type="button"
                onClick={() => setBlockMode("span")}
                className={`text-left rounded-xl border-2 p-3 transition-colors ${
                  effectiveMode === "span"
                    ? "border-[#2d5567] bg-[#2d5567]/5"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <span className="block font-semibold text-slate-800">Continuous span</span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  e.g. Mon 1 PM straight through Wed 4 PM (days in between fully blocked)
                </span>
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Select Bays *</Label>
            <button
              type="button"
              onClick={toggleAllBays}
              className="text-sm font-medium text-[#2d5567] hover:underline"
            >
              {allSelected ? "Clear all" : "Select all bays"}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 p-3">
            {sortedSimulators.map((bay) => (
              <label
                key={bay.id}
                className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                <Checkbox
                  checked={selectedBayIds.includes(bay.id)}
                  onCheckedChange={() => toggleBay(bay.id)}
                />
                <span className="text-sm text-slate-700">{getBayDisplayName(bay.name)}</span>
              </label>
            ))}
          </div>
          {selectedBayIds.length > 0 && (
            <p className="text-xs text-slate-500">
              {allSelected
                ? "All bays selected"
                : `${selectedBayIds.length} bay${selectedBayIds.length === 1 ? "" : "s"} selected`}
            </p>
          )}
        </div>

        {!fullDay && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="start-time">
              {effectiveMode === "span" ? "Start Time (first day) *" : "Start Time *"}
            </Label>
            <Select
              value={formData.start_time}
              onValueChange={(value) => setFormData({...formData, start_time: value})}
            >
              <SelectTrigger className="h-12">
                <SelectValue placeholder="Choose time" />
              </SelectTrigger>
              <SelectContent>
                {TIME_SLOTS.map(time => (
                  <SelectItem key={time.value} value={time.value}>
                    {time.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="end-time">
              {effectiveMode === "span" ? "End Time (last day) *" : "End Time *"}
            </Label>
            <Select
              value={formData.end_time}
              onValueChange={(value) => setFormData({...formData, end_time: value})}
            >
              <SelectTrigger className="h-12">
                <SelectValue placeholder="Choose time" />
              </SelectTrigger>
              <SelectContent>
                {TIME_SLOTS.map(time => (
                  <SelectItem key={time.value} value={time.value}>
                    {time.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        )}
        {!fullDay && effectiveMode === "span" && (
          <p className="text-xs text-slate-500 -mt-2">
            One continuous block: from your start time on {dateRange?.from ? format(dateRange.from, "MMM d") : "the first day"} through
            your end time on {dateRange?.to ? format(dateRange.to, "MMM d") : "the last day"}. Every day in between is blocked all day.
          </p>
        )}

        <div className="space-y-2">
          <Label htmlFor="reason">Reason *</Label>
          <Select 
            value={formData.reason} 
            onValueChange={(value) => setFormData({...formData, reason: value})}
          >
            <SelectTrigger className="h-12">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="league">League</SelectItem>
              <SelectItem value="maintenance">Maintenance</SelectItem>
              <SelectItem value="event">Event</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes (Optional)</Label>
          <Textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => setFormData({...formData, notes: e.target.value})}
            rows={3}
            placeholder="Additional details..."
          />
        </div>

        {conflicts.length > 0 && (
          <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 space-y-2">
            <div className="flex items-center gap-2 text-amber-800 font-semibold">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span>
                {conflicts.length} existing booking{conflicts.length === 1 ? "" : "s"} overlap
                {conflicts.length === 1 ? "s" : ""} this block
              </span>
            </div>
            <p className="text-sm text-amber-700">
              Blocking won't cancel these reservations — the customers will still be
              expecting their tee time. Please reach out to them if you proceed.
            </p>
            <ul className="text-sm text-amber-900 space-y-1 max-h-40 overflow-y-auto">
              {conflicts.map((c, i) => (
                <li key={i} className="flex flex-wrap gap-x-2">
                  <span className="font-medium">{getBayDisplayName(c.simulator_name)}</span>
                  <span>·</span>
                  <span>{c.booking_date}</span>
                  <span>·</span>
                  <span>{prettyTime(c.start_time)}–{prettyTime(c.end_time)}</span>
                  <span>·</span>
                  <span>{c.who}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {conflicts.length > 0 ? (
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setConflicts([]);
                setPendingRows(null);
              }}
              className="flex-1 h-12"
            >
              Go Back
            </Button>
            <Button
              type="button"
              onClick={() => createBlocks(pendingRows)}
              disabled={isSubmitting || !pendingRows}
              className="flex-1 h-12 bg-amber-600 hover:bg-amber-700"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Block Anyway"
              )}
            </Button>
          </div>
        ) : (
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 h-12"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                isSubmitting ||
                selectedBayIds.length === 0 ||
                !dateRange?.from ||
                (!fullDay && (!formData.start_time || !formData.end_time))
              }
              className="flex-1 h-12 bg-[#2d5567] hover:bg-[#1e3a47]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Checking...
                </>
              ) : (
                "Create Block(s)"
              )}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
