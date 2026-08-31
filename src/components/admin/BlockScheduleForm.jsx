
import React, { useState } from "react";
import { ScheduleBlock } from "@/entities/ScheduleBlock";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { X, Loader2 } from "lucide-react";
import { format, eachDayOfInterval } from "date-fns";

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
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

      if (rows.length === 0) {
        alert("Please select at least one bay and a date.");
        setIsSubmitting(false);
        return;
      }

      await ScheduleBlock.bulkCreate(rows);

      onComplete();
    } catch (error) {
      console.error("Error creating block:", error);
      alert("Error creating block. Please try again.");
    }
    setIsSubmitting(false);
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
                Creating...
              </>
            ) : (
              "Create Block(s)"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
