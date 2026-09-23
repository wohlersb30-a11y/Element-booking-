import React, { useState } from "react";
import { ScheduleBlock } from "@/entities/ScheduleBlock";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { X, Loader2, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { useLocationHours, buildHourChoices, toMinutes } from "@/config/hours";
import { getBayDisplayName } from "@/lib/bayNames";

const prettyDate = (d) => {
  // block_date is a "yyyy-MM-dd" string; parse as local, not UTC.
  if (!d) return "";
  const [y, m, day] = String(d).split("-").map(Number);
  if (!y || !m || !day) return String(d);
  return format(new Date(y, m - 1, day), "EEE, MMM d, yyyy");
};

// Edit (or delete) a single existing schedule block in place, so an admin can
// tweak the time / reason / notes without deleting and recreating it.
export default function EditBlockModal({ block, simulators = [], location, onClose, onComplete }) {
  const hours = useLocationHours(location);
  const TIME_SLOTS = buildHourChoices(hours.open, hours.close);

  const [startTime, setStartTime] = useState(block.start_time || "");
  const [endTime, setEndTime] = useState(block.end_time || "");
  const [reason, setReason] = useState(block.reason || "league");
  const [notes, setNotes] = useState(block.notes || "");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");

  const bay = simulators.find((s) => s.id === block.simulator_id);
  const bayName = getBayDisplayName(bay?.name || block.simulator_name || "Bay", location);

  const save = async () => {
    setError("");
    if (toMinutes(endTime) <= toMinutes(startTime)) {
      setError("End time must be after start time.");
      return;
    }
    setIsSaving(true);
    try {
      await ScheduleBlock.update(block.id, {
        start_time: startTime,
        end_time: endTime,
        reason,
        notes
      });
      onComplete();
    } catch (e) {
      console.error("Error updating block:", e);
      setError(e?.message || "Could not save changes. Please try again.");
      setIsSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Remove this block? This can't be undone.")) return;
    setError("");
    setIsDeleting(true);
    try {
      await ScheduleBlock.delete(block.id);
      onComplete();
    } catch (e) {
      console.error("Error deleting block:", e);
      setError(e?.message || "Could not delete this block. Please try again.");
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Edit Block</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="space-y-6">
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
          <p className="text-sm text-slate-500">Bay</p>
          <p className="font-semibold text-slate-800">{bayName}</p>
          <p className="text-sm text-slate-500 mt-2">Date</p>
          <p className="font-semibold text-slate-800">{prettyDate(block.block_date)}</p>
          <p className="text-xs text-slate-400 mt-2">
            To change the bay or date, delete this block and create a new one.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Start Time *</Label>
            <Select value={startTime} onValueChange={setStartTime}>
              <SelectTrigger className="h-12">
                <SelectValue placeholder="Choose time" />
              </SelectTrigger>
              <SelectContent>
                {TIME_SLOTS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>End Time *</Label>
            <Select value={endTime} onValueChange={setEndTime}>
              <SelectTrigger className="h-12">
                <SelectValue placeholder="Choose time" />
              </SelectTrigger>
              <SelectContent>
                {TIME_SLOTS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Reason *</Label>
          <Select value={reason} onValueChange={setReason}>
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
          <Label>Notes (Optional)</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Additional details..."
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={remove}
            disabled={isSaving || isDeleting}
            className="h-12 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Removing...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete block
              </>
            )}
          </Button>
          <div className="flex gap-3 sm:ml-auto">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSaving || isDeleting}
              className="flex-1 h-12"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={save}
              disabled={isSaving || isDeleting || !startTime || !endTime}
              className="flex-1 h-12 bg-[#2d5567] hover:bg-[#1e3a47]"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
