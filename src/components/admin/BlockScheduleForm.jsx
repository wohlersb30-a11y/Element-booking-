
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

  const buildRows = () => {
    // Every day in the (inclusive) range; falls back to a single day when no
    // end date is chosen.
    const start = dateRange.from;
    const end = dateRange.to || dateRange.from;
    const days = eachDayOfInterval({ start, end });

    const baysToBlock = simulators.filter((s) => selectedBayIds.includes(s.id));

    // One block row per bay × per day.
    const rows = [];
    for (const day of days) {
      const formattedDate = format(day, "yyyy-MM-dd");
      for (const bay of baysToBlock) {
        rows.push({
          simulator_id: bay.id,
          simulator_name: bay.name,
          location: location,
          block_date: formattedDate,
          start_time: formData.start_time,
          end_time: formData.end_time,
          reason: formData.reason,
          notes: formData.notes
        });
      }
    }
    return rows;
  };

  // Find existing customer bookings (regular + prime member) that overlap the
  // requested block window, so the admin isn't surprised to be blocking over
  // people who already reserved those bays.
  const findConflicts = async (rows) => {
    const bayIds = [...new Set(rows.map((r) => r.simulator_id))];
    const dates = [...new Set(rows.map((r) => r.block_date))];
    const blockStart = toMinutes(formData.start_time);
    const blockEnd = toMinutes(formData.end_time);

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

    const overlaps = (b) =>
      blockStart < toMinutes(b.end_time) && blockEnd > toMinutes(b.start_time);

    const found = [];
    for (const b of reg || []) {
      if (overlaps(b)) found.push({ ...b, who: b.customer_name || "Customer" });
    }
    for (const b of mem || []) {
      if (overlaps(b)) found.push({ ...b, who: `${b.member_name || "Member"} (member)` });
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
              {dateRange.to && format(dateRange.to, "yyyy-MM-dd") !== format(dateRange.from, "yyyy-MM-dd")
                ? `Blocking ${format(dateRange.from, "MMM d")} – ${format(dateRange.to, "MMM d, yyyy")}`
                : `Blocking ${format(dateRange.from, "MMM d, yyyy")}`}
            </p>
          )}
        </div>

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

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="start-time">Start Time *</Label>
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
            <Label htmlFor="end-time">End Time *</Label>
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
                !formData.start_time ||
                !formData.end_time
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
