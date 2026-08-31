import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Clock, Loader2, Check } from "lucide-react";
import {
  DEFAULT_HOURS,
  HOURS_BOUNDS,
  normalizeHours,
  buildHourChoices,
  formatHourLabel,
  toMinutes,
} from "@/config/hours";

const LOCATION_LABELS = {
  vadnais_heights: "Vadnais Heights",
  burnsville: "Burnsville",
};

// Self-contained admin control to set a location's tee-sheet operating hours.
// Extends the classic 9 AM–11 PM window (open as early as 6 AM, close as late as
// midnight). Writes to `location_hours`; the whole app reads those hours to
// build its bookable time slots. Placed once per location dashboard.
export default function OperatingHoursEditor({ location, className = "" }) {
  const [hours, setHours] = useState(DEFAULT_HOURS);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const { data } = await supabase
        .from("location_hours")
        .select("*")
        .eq("location", location)
        .maybeSingle();
      setHours(normalizeHours(data));
    } catch (e) {
      console.error("Failed to load operating hours:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  // Open can be as early as 6 AM and no later than 11 PM; close/sunday-close can
  // be as late as midnight. Cross-field validity is enforced on save.
  const openChoices = buildHourChoices(HOURS_BOUNDS.minOpen, "23:00");
  const closeChoices = buildHourChoices("07:00", HOURS_BOUNDS.maxClose);

  const setField = (key, value) => setHours((h) => ({ ...h, [key]: value }));

  const save = async () => {
    setError("");
    if (toMinutes(hours.close) <= toMinutes(hours.open)) {
      setError("Close time must be after open time.");
      return;
    }
    if (toMinutes(hours.sunday_close) <= toMinutes(hours.open)) {
      setError("Sunday close must be after open time.");
      return;
    }
    setSaving(true);
    try {
      const { error: upErr } = await supabase.from("location_hours").upsert({
        location,
        open_time: hours.open,
        close_time: hours.close,
        sunday_close_time: hours.sunday_close,
        updated_at: new Date().toISOString(),
      });
      if (upErr) throw upErr;
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    } catch (e) {
      setError(e.message || "Could not save hours. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  const summary = `Open ${formatHourLabel(hours.open)} · Close ${formatHourLabel(
    hours.close
  )} · Sun close ${formatHourLabel(hours.sunday_close)}`;

  return (
    <div className={className}>
      <Card className="border border-slate-200">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-start gap-3 flex-1">
              <div className="w-10 h-10 rounded-lg bg-[#2d5567]/10 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-[#2d5567]" />
              </div>
              <div>
                <p className="font-bold text-slate-800">
                  Tee sheet hours — {LOCATION_LABELS[location] || location}
                </p>
                <p className="text-sm text-slate-500 mt-0.5">{summary}</p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setError("");
                setPanelOpen((v) => !v);
              }}
              className="h-11 px-4 shrink-0"
            >
              {panelOpen ? "Close" : "Edit hours"}
            </Button>
          </div>

          {panelOpen && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="text-sm text-slate-500 mb-3">
                Set when customers can book. You can open as early as 6:00 AM and
                close as late as midnight. Sundays can close earlier if you like.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">Open</label>
                  <Select value={hours.open} onValueChange={(v) => setField("open", v)}>
                    <SelectTrigger className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {openChoices.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">Close</label>
                  <Select value={hours.close} onValueChange={(v) => setField("close", v)}>
                    <SelectTrigger className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {closeChoices.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">
                    Sunday close
                  </label>
                  <Select
                    value={hours.sunday_close}
                    onValueChange={(v) => setField("sunday_close", v)}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {closeChoices.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

              <div className="flex items-center justify-end gap-3 mt-4">
                {justSaved && (
                  <span className="text-sm text-emerald-600 flex items-center gap-1">
                    <Check className="w-4 h-4" /> Saved
                  </span>
                )}
                <Button
                  onClick={save}
                  disabled={saving}
                  className="h-11 px-5 bg-[#2d5567] hover:bg-[#1e3a47]"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save hours"
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
