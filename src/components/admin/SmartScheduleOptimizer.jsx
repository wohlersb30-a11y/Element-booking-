import React, { useMemo, useState } from "react";
import { Booking } from "@/entities/all";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sparkles,
  ArrowRight,
  X,
  Loader2,
  CheckCircle2,
  Lock,
  Info
} from "lucide-react";
import { format } from "date-fns";

// ---------- helpers ----------
const toMinutes = (t) => {
  if (!t) return 0;
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + (m || 0);
};

const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && aEnd > bStart;

// Treat anything flagged vip OR named "VIP ..." as a VIP bay so we never move a
// standard booking onto a VIP bay (or vice-versa) — that would change the
// customer's experience and the price tier.
const isVIPBay = (bay) =>
  bay?.bay_type === "vip" || /vip/i.test(bay?.name || "");

// Sort bays: standard first, VIP last, numeric within group (Bay 2 before Bay 10).
const bayRank = (bay) => {
  const match = (bay?.name || "").match(/\d+/);
  return {
    vip: isVIPBay(bay) ? 1 : 0,
    num: match ? parseInt(match[0], 10) : 9999
  };
};

const sortedBays = (bays) =>
  [...bays].sort((a, b) => {
    const A = bayRank(a);
    const B = bayRank(b);
    if (A.vip !== B.vip) return A.vip - B.vip;
    return A.num - B.num;
  });

/**
 * Pure planner. Keeps locked bookings + blocks pinned to their current bay,
 * then first-fit packs every movable booking onto the lowest-ranked compatible
 * bay. First-fit naturally consolidates onto the earliest bays, freeing the
 * higher-numbered bays entirely so longer/new bookings can fit.
 *
 * Returns { moves, freedBays, baysUsedBefore, baysUsedAfter }.
 */
function buildPlan({ bookings, blocks, simulators }) {
  const bays = sortedBays(simulators.filter((b) => b.is_active !== false));
  const bayById = new Map(bays.map((b) => [b.id, b]));

  // occupancy[bayId] = array of {start,end} that are committed/fixed
  const occupancy = new Map();
  bays.forEach((b) => occupancy.set(b.id, []));

  const addOccupancy = (bayId, start, end) => {
    if (!occupancy.has(bayId)) occupancy.set(bayId, []);
    occupancy.get(bayId).push({ start, end });
  };

  const fits = (bayId, start, end) =>
    !(occupancy.get(bayId) || []).some((iv) =>
      overlaps(start, end, iv.start, iv.end)
    );

  const active = bookings.filter((b) => b.status !== "cancelled");

  // 1) Pin blocks (admin-blocked time) to their bay.
  (blocks || []).forEach((bl) => {
    if (bl.simulator_id) {
      addOccupancy(bl.simulator_id, toMinutes(bl.start_time), toMinutes(bl.end_time));
    }
  });

  // 2) Pin locked bookings to their current bay.
  const locked = active.filter((b) => b.bay_locked);
  locked.forEach((b) =>
    addOccupancy(b.simulator_id, toMinutes(b.start_time), toMinutes(b.end_time))
  );

  // 3) First-fit pack movable bookings (start asc, longer first on ties).
  const movable = active
    .filter((b) => !b.bay_locked)
    .map((b) => ({
      booking: b,
      start: toMinutes(b.start_time),
      end: toMinutes(b.end_time),
      vip: isVIPBay(bayById.get(b.simulator_id)) ? 1 : 0
    }))
    .sort((a, b) => a.start - b.start || b.end - b.end);

  const moves = [];
  for (const item of movable) {
    const { booking, start, end, vip } = item;
    // candidate bays must match the booking's category (standard/VIP)
    const candidates = bays.filter((bay) => (isVIPBay(bay) ? 1 : 0) === vip);
    let placed = false;
    for (const bay of candidates) {
      if (fits(bay.id, start, end)) {
        addOccupancy(bay.id, start, end);
        if (bay.id !== booking.simulator_id) {
          moves.push({
            booking,
            fromId: booking.simulator_id,
            fromName: booking.simulator_name || bayById.get(booking.simulator_id)?.name || "—",
            toId: bay.id,
            toName: bay.name
          });
        }
        placed = true;
        break;
      }
    }
    // If somehow nothing fits (shouldn't happen — it already fit originally),
    // leave it where it is so we never drop a reservation.
    if (!placed) {
      addOccupancy(booking.simulator_id, start, end);
    }
  }

  // Metrics: which bays are used before vs after.
  const usedBefore = new Set();
  active.forEach((b) => usedBefore.add(b.simulator_id));
  (blocks || []).forEach((bl) => bl.simulator_id && usedBefore.add(bl.simulator_id));

  const usedAfter = new Set();
  occupancy.forEach((ivs, bayId) => {
    if (ivs.length > 0) usedAfter.add(bayId);
  });

  const freedBays = bays.filter(
    (b) => usedBefore.has(b.id) && !usedAfter.has(b.id)
  );

  return {
    moves,
    freedBays,
    baysUsedBefore: usedBefore.size,
    baysUsedAfter: usedAfter.size
  };
}

export default function SmartScheduleOptimizer({
  date,
  location,
  bookings = [],
  blocks = [],
  simulators = [],
  onClose,
  onApplied
}) {
  const [applying, setApplying] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const plan = useMemo(
    () => buildPlan({ bookings, blocks, simulators }),
    [bookings, blocks, simulators]
  );

  const lockedCount = bookings.filter(
    (b) => b.status !== "cancelled" && b.bay_locked
  ).length;
  const movableCount = bookings.filter(
    (b) => b.status !== "cancelled" && !b.bay_locked
  ).length;

  const applyMoves = async () => {
    if (plan.moves.length === 0) return;
    setApplying(true);
    setError("");
    try {
      for (const m of plan.moves) {
        await Booking.update(m.booking.id, {
          simulator_id: m.toId,
          simulator_name: m.toName
        });
      }
      setDone(true);
      if (onApplied) onApplied();
    } catch (e) {
      console.error("Optimizer apply error:", e);
      setError(e.message || "Failed to apply some moves. Please reload and retry.");
    }
    setApplying(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-[#2d5567] to-[#1e3a47] p-6 flex items-start justify-between rounded-t-xl">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <Sparkles className="w-6 h-6" />
              Smart Schedule Optimizer
            </h2>
            <p className="text-blue-50 mt-1">
              {format(date, "EEEE, MMM d, yyyy")} ·{" "}
              {location === "burnsville" ? "Burnsville" : "Vadnais Heights"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white"
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Summary line */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="border-slate-200">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-black text-slate-800">{movableCount}</p>
                <p className="text-xs text-slate-500 mt-1">Movable</p>
              </CardContent>
            </Card>
            <Card className="border-slate-200">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-black text-slate-800 flex items-center justify-center gap-1">
                  <Lock className="w-5 h-5 text-slate-400" />
                  {lockedCount}
                </p>
                <p className="text-xs text-slate-500 mt-1">Locked to bay</p>
              </CardContent>
            </Card>
            <Card className="border-emerald-200 bg-emerald-50">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-black text-emerald-700">
                  {plan.freedBays.length}
                </p>
                <p className="text-xs text-emerald-600 mt-1">Bays freed</p>
              </CardContent>
            </Card>
          </div>

          {done ? (
            <div className="text-center py-8">
              <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
              <p className="text-xl font-bold text-slate-800 mb-1">Schedule optimized</p>
              <p className="text-slate-500">
                {plan.moves.length} reservation{plan.moves.length === 1 ? "" : "s"} moved.
              </p>
              <Button onClick={onClose} className="mt-6 bg-[#2d5567] hover:bg-[#1e3a47]">
                Done
              </Button>
            </div>
          ) : plan.moves.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto mb-3" />
              <p className="text-lg font-semibold text-slate-800">
                Already optimal
              </p>
              <p className="text-slate-500 mt-1 max-w-sm mx-auto">
                There are no movable reservations to consolidate right now. Locked
                bookings ("I prefer this bay") and blocked times always stay put.
              </p>
              <Button onClick={onClose} variant="outline" className="mt-6">
                Close
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>
                  Suggested moves keep each booking's date, time, duration, price,
                  and bay type the same — only the bay assignment changes. Customers
                  who chose "I prefer this bay" and blocked times are never moved.
                </span>
              </div>

              <div className="space-y-2">
                {plan.moves.map((m) => (
                  <div
                    key={m.booking.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 bg-white"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 truncate">
                        {m.booking.customer_name || "Reservation"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {m.booking.start_time}–{m.booking.end_time}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 text-sm font-medium">
                      <span className="px-2 py-1 rounded bg-slate-100 text-slate-600">
                        {m.fromName}
                      </span>
                      <ArrowRight className="w-4 h-4 text-slate-400" />
                      <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-700">
                        {m.toName}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {plan.freedBays.length > 0 && (
                <p className="text-sm text-slate-600">
                  Frees up:{" "}
                  <span className="font-semibold text-emerald-700">
                    {plan.freedBays.map((b) => b.name).join(", ")}
                  </span>{" "}
                  for the whole day.
                </p>
              )}

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                  {error}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="flex-1"
                  disabled={applying}
                >
                  Cancel
                </Button>
                <Button
                  onClick={applyMoves}
                  disabled={applying}
                  className="flex-1 bg-[#2d5567] hover:bg-[#1e3a47]"
                >
                  {applying ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Applying...
                    </>
                  ) : (
                    <>Apply {plan.moves.length} move{plan.moves.length === 1 ? "" : "s"}</>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
