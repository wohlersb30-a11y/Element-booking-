import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { X, Clock, Ticket, Crown, AlertTriangle, Loader2 } from "lucide-react";
import { format } from "date-fns";
import {
  getPlan,
  hoursUsedInPeriod,
  guestPassesUsedInPeriod,
  periodBounds
} from "@/config/membershipPlans";

// Staff-facing popup opened by clicking a member reservation on the tee sheet.
// Shows the member's tier, this reservation's status (included vs prime, guest),
// their hour + guest-pass usage for the current period, and — most importantly —
// any amount the front desk needs to collect (prime sim time / guest fee).
//
// Fetches its own data (the membership row + that membership's bookings) so the
// tee sheet only has to hand it the clicked member_booking row. Usage is a
// SHARED pool keyed on membership_id (covers corporate multi-seat + spouse).

const fmtTime = (t) => {
  if (!t || !String(t).includes(":")) return t || "";
  const [h, m] = String(t).split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

const fmtPeriod = (p) => {
  if (!p) return "";
  try {
    const s = format(new Date(p.start + "T00:00:00"), "MMM d");
    const e = format(new Date(p.end + "T00:00:00"), "MMM d");
    return `${s} – ${e}`;
  } catch {
    return `${p.start} – ${p.end}`;
  }
};

function UsageBar({ label, icon: Icon, used, total, accent }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const over = used > total;
  const remaining = Math.max(0, total - used);
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="flex items-center gap-1.5 text-slate-600">
          <Icon className="w-4 h-4" /> {label}
        </span>
        <span className={`font-semibold ${over ? "text-rose-600" : "text-slate-800"}`}>
          {used} / {total} used
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${over ? "bg-rose-500" : accent}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className={`text-xs mt-1 ${over ? "text-rose-600 font-semibold" : "text-slate-500"}`}>
        {over
          ? `Over allotment by ${used - total}`
          : `${remaining} remaining this period`}
      </p>
    </div>
  );
}

export default function MemberUsageModal({ member, onClose }) {
  const [loading, setLoading] = useState(true);
  const [membership, setMembership] = useState(null);
  const [bookings, setBookings] = useState([]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const [mships, mbookings] = await Promise.all([
          member?.membership_id
            ? base44.entities.Membership.filter({ id: member.membership_id })
            : Promise.resolve([]),
          member?.membership_id
            ? base44.entities.MemberBooking.filter({ membership_id: member.membership_id })
            : Promise.resolve([])
        ]);
        if (!active) return;
        setMembership(mships?.[0] || null);
        setBookings(mbookings || []);
      } catch (e) {
        console.error("MemberUsageModal load error:", e);
      }
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [member?.membership_id]);

  // Anchor the usage period to the reservation's own date so staff see the month
  // (or week) the booking falls in, not necessarily today.
  const ref = member?.booking_date ? new Date(member.booking_date + "T00:00:00") : new Date();
  const plan = membership ? getPlan(membership.membership_level) : null;

  const hoursUsed = plan ? hoursUsedInPeriod(plan, bookings, ref) : 0;
  const passesUsed = plan ? guestPassesUsedInPeriod(plan, bookings, ref) : 0;
  const hoursPeriod = plan ? periodBounds(plan.hoursPeriod, ref) : null;
  const passPeriod = plan ? periodBounds(plan.guestPassPeriod, ref) : null;

  const discountPct = plan ? Math.round((plan.discount || 0) * 100) : 0;

  // Amounts the front desk needs to collect / capture for THIS reservation.
  const prompts = [];
  if (member?.is_prime) {
    prompts.push({
      tone: "amber",
      title: "Prime time — not included in membership",
      detail:
        Number(member.total_cost) > 0
          ? `Member rate (${discountPct}% off): $${Number(member.total_cost).toFixed(2)} + MN tax. A card hold was placed online — capture it at check-in.`
          : "This slot is outside the member's included hours/window and is billed as prime time."
    });
  }
  if (member?.guest_charge_due) {
    prompts.push({
      tone: "rose",
      title: "Guest fee due at desk",
      detail: "Member is out of guest passes this period. Collect your standard guest rate at the front desk."
    });
  }
  if (plan && hoursUsed > plan.hours) {
    prompts.push({
      tone: "amber",
      title: "Over included hours",
      detail: `This member has used ${hoursUsed} of ${plan.hours} included hours this period. Additional sim time is billed at the ${discountPct}% member rate.`
    });
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-5 py-4 flex items-start justify-between">
          <div className="text-white">
            <div className="flex items-center gap-2">
              <Crown className="w-5 h-5" />
              <span className="font-bold">
                {member?.member_name || member?.customer_name || "Member"}
              </span>
            </div>
            <p className="text-purple-50 text-xs mt-0.5">
              {plan ? `${plan.name} member` : "Member"}
              {member?.member_email ? ` · ${member.member_email}` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white rounded-lg p-1"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* This reservation */}
          <div className="rounded-xl border bg-slate-50 p-3 text-sm">
            <p className="font-semibold text-slate-800">
              {member?.simulator_name || "Bay"} ·{" "}
              {member?.booking_date
                ? format(new Date(member.booking_date + "T00:00:00"), "EEE, MMM d")
                : ""}
            </p>
            <p className="text-slate-600">
              {fmtTime(member?.start_time)} – {fmtTime(member?.end_time)} (
              {member?.duration_hours || 0}h)
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  member?.is_prime
                    ? "bg-amber-100 text-amber-800"
                    : "bg-emerald-100 text-emerald-800"
                }`}
              >
                {member?.is_prime ? "Prime time" : "Included"}
              </span>
              {member?.guest_pass_used && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
                  Guest pass used
                </span>
              )}
              {member?.guest_charge_due && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                  Guest fee at desk
                </span>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-6 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : !plan ? (
            <p className="text-sm text-slate-500">
              Couldn't load this member's plan details.
            </p>
          ) : (
            <>
              {/* Usage this period */}
              <div className="space-y-4">
                <UsageBar
                  label={`Sim hours (${plan.hoursPeriod === "week" ? "this week" : "this month"})`}
                  icon={Clock}
                  used={hoursUsed}
                  total={plan.hours}
                  accent="bg-[#2d5567]"
                />
                <p className="text-[11px] text-slate-400 -mt-2">
                  Period: {fmtPeriod(hoursPeriod)}
                </p>
                <UsageBar
                  label="Guest passes (this month)"
                  icon={Ticket}
                  used={passesUsed}
                  total={plan.guestPasses}
                  accent="bg-purple-500"
                />
                <p className="text-[11px] text-slate-400 -mt-2">
                  Period: {fmtPeriod(passPeriod)}
                </p>
              </div>

              {/* Collect / capture prompts */}
              {prompts.length > 0 && (
                <div className="space-y-2">
                  {prompts.map((p, i) => (
                    <div
                      key={i}
                      className={`rounded-xl border p-3 text-sm flex gap-2 ${
                        p.tone === "rose"
                          ? "border-rose-200 bg-rose-50"
                          : "border-amber-200 bg-amber-50"
                      }`}
                    >
                      <AlertTriangle
                        className={`w-4 h-4 mt-0.5 shrink-0 ${
                          p.tone === "rose" ? "text-rose-600" : "text-amber-600"
                        }`}
                      />
                      <div>
                        <p
                          className={`font-semibold ${
                            p.tone === "rose" ? "text-rose-800" : "text-amber-800"
                          }`}
                        >
                          {p.title}
                        </p>
                        <p
                          className={
                            p.tone === "rose" ? "text-rose-700" : "text-amber-700"
                          }
                        >
                          {p.detail}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {prompts.length === 0 && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  No extra charges — this reservation is covered by the membership.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
