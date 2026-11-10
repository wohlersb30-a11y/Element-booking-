import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ChevronLeft, Mail, Phone, Clock, Plus, Calendar, History } from "lucide-react";
import { getBayDisplayName } from "@/lib/bayNames";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";

const LOCATION_LABEL = { vadnais_heights: "Vadnais Heights", burnsville: "Burnsville" };

function fmtPhone(p) {
  if (!p) return "";
  const d = String(p).replace(/\D/g, "");
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return p;
}

// Render a stored 'HH:MM' nicely as e.g. "7:00 PM".
function fmtTime(t) {
  if (!t) return "";
  const [h, m] = String(t).split(":").map(Number);
  if (Number.isNaN(h)) return t;
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m || 0).padStart(2, "0")} ${ampm}`;
}

export default function CustomerProfile() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const emailParam = (params.get("email") || "").trim().toLowerCase();

  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Banked hours
  const [total, setTotal] = useState({ peak: 0, off_peak: 0 });
  const [ledger, setLedger] = useState([]);
  const [hoursLoading, setHoursLoading] = useState(false);

  // Reservations
  const [bookings, setBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);

  // Add-hours form
  const [adjKind, setAdjKind] = useState("off_peak");
  const [adjHours, setAdjHours] = useState("");
  const [adjNote, setAdjNote] = useState("");
  const [signature, setSignature] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [saveErr, setSaveErr] = useState("");

  const email = customer?.email || "";

  // Load the banked-hours balance + ledger for this customer.
  const loadHours = useCallback(async (e) => {
    if (!e) return;
    setHoursLoading(true);
    try {
      const res = await base44.functions.invoke("adminHourBalance", { action: "lookup", email: e });
      const d = res?.data;
      if (d?.success) {
        setTotal(d.total || { peak: 0, off_peak: 0 });
        setLedger(d.ledger || []);
      }
    } catch {
      /* non-fatal; header just shows 0s */
    } finally {
      setHoursLoading(false);
    }
  }, []);

  // Load the customer record, then their hours + reservations.
  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        if (!id && !emailParam) throw new Error("No customer specified.");
        // Load the customers row by id, or by email when we arrived from the
        // banked-hours lookup (which only knows the address). If no directory
        // row exists for that email, fall back to a minimal record so the
        // balance / ledger / reservations (all keyed by email) still show.
        let data = null;
        if (id) {
          const { data: byId, error: cErr } = await supabase
            .from("customers")
            .select("id, full_name, email, phone, source, note, created_at")
            .eq("id", id)
            .single();
          if (cErr) throw cErr;
          data = byId;
        } else {
          const { data: byEmail } = await supabase
            .from("customers")
            .select("id, full_name, email, phone, source, note, created_at")
            .eq("email", emailParam)
            .limit(1);
          data = byEmail?.[0] || { id: null, full_name: null, email: emailParam, phone: null };
        }
        if (!active) return;
        setCustomer(data);

        if (data?.email) {
          loadHours(data.email);
          setBookingsLoading(true);
          const { data: bk } = await supabase
            .from("bookings")
            .select("id, booking_date, start_time, end_time, simulator_name, location, status, payment_method, payment_status, total_cost, duration_hours, number_of_players")
            .eq("customer_email", data.email)
            .order("booking_date", { ascending: false })
            .limit(200);
          if (active) {
            setBookings(bk || []);
            setBookingsLoading(false);
          }
        }
      } catch (e) {
        if (active) setError(e.message || "Failed to load customer.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id, emailParam, loadHours]);

  const submitAdjust = async () => {
    setSaveErr("");
    setSaveMsg("");
    const hrs = Number(adjHours);
    if (!hrs || Number.isNaN(hrs)) {
      setSaveErr("Enter a non-zero number of hours (negative removes).");
      return;
    }
    if (!signature.trim()) {
      setSaveErr("An employee signature is required for this adjustment.");
      return;
    }
    setSaving(true);
    try {
      const res = await base44.functions.invoke("adminHourBalance", {
        action: "adjust",
        email,
        kind: adjKind,
        hours: hrs,
        note: adjNote.trim(),
        signature: signature.trim()
      });
      const d = res?.data;
      if (d?.success) {
        setTotal(d.total || total);
        setSaveMsg(`${hrs > 0 ? "Added" : "Removed"} ${Math.abs(hrs)} ${adjKind === "peak" ? "peak" : "off-peak"} hour(s).`);
        setAdjHours("");
        setAdjNote("");
        setSignature("");
        loadHours(email); // refresh ledger
      } else {
        setSaveErr(d?.error || "Could not save the adjustment.");
      }
    } catch (e) {
      setSaveErr(e.message || "Could not save the adjustment.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-[#2d5567]" />
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="min-h-screen p-8">
        <Button variant="outline" size="sm" onClick={() => navigate(createPageUrl("Customers"))}>
          <ChevronLeft className="w-4 h-4" /> Back to Customers
        </Button>
        <p className="text-red-600 mt-6">{error || "Customer not found."}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-8 bg-gradient-to-br from-slate-50 via-emerald-50/30 to-slate-100">
      <div className="max-w-4xl mx-auto space-y-6">
        <Button variant="outline" size="sm" onClick={() => navigate(createPageUrl("Customers"))}>
          <ChevronLeft className="w-4 h-4" /> Back to Customers
        </Button>

        {/* Header */}
        <Card className="border-0 shadow-lg rounded-2xl">
          <CardContent className="p-6">
            <h1 className="text-2xl font-black text-slate-800 heading-font">
              {customer.full_name || customer.email || "Customer"}
            </h1>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 mt-2 text-sm">
              {customer.email && (
                <a href={`mailto:${customer.email}`} className="flex items-center gap-2 text-[#2d5567] hover:underline">
                  <Mail className="w-3.5 h-3.5" /> {customer.email}
                </a>
              )}
              {customer.phone && (
                <a href={`tel:${customer.phone}`} className="flex items-center gap-2 text-slate-600 hover:underline">
                  <Phone className="w-3.5 h-3.5" /> {fmtPhone(customer.phone)}
                </a>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Banked hours */}
        <Card className="border-0 shadow-lg rounded-2xl">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="w-5 h-5" /> Banked Hours
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border-2 border-green-600 bg-green-50 p-4">
              <p className="font-semibold text-green-800">Balance (usable at either club)</p>
              <p className="text-sm text-slate-700 mt-1">
                Peak: <span className="font-bold text-orange-600">{hoursLoading ? "…" : Number(total.peak || 0)}</span> ·{" "}
                Off-peak: <span className="font-bold text-teal-600">{hoursLoading ? "…" : Number(total.off_peak || 0)}</span>
              </p>
            </div>

            {/* Add / remove with required employee signature */}
            <div className="rounded-lg border p-4 space-y-3 bg-slate-50">
              <p className="font-semibold text-slate-700 flex items-center gap-2">
                <Plus className="w-4 h-4" /> Add / remove hours
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Bucket</Label>
                  <Select value={adjKind} onValueChange={setAdjKind}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="off_peak">Off-peak</SelectItem>
                      <SelectItem value="peak">Peak</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Hours (+ adds, − removes)</Label>
                  <Input type="number" step="0.5" value={adjHours} onChange={(e) => setAdjHours(e.target.value)} placeholder="e.g. 4 or -2" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Reason / note (optional)</Label>
                <Input value={adjNote} onChange={(e) => setAdjNote(e.target.value)} placeholder="e.g. Purchased 4-hr package in person" />
              </div>
              <div>
                <Label className="text-xs">
                  Employee signature <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  placeholder="Type your full name to authorize this change"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Required. Your name is recorded with this adjustment for our records.
                </p>
              </div>
              {saveErr && <p className="text-sm text-rose-700">{saveErr}</p>}
              {saveMsg && <p className="text-sm text-emerald-700">{saveMsg}</p>}
              <Button onClick={submitAdjust} disabled={saving} className="bg-[#2d5567]">
                {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : "Save adjustment"}
              </Button>
            </div>

            {/* Hour history */}
            <div>
              <p className="font-semibold text-slate-700 flex items-center gap-2 mb-2">
                <History className="w-4 h-4" /> Hour history
              </p>
              {ledger.length === 0 ? (
                <p className="text-sm text-slate-500">No hour transactions yet.</p>
              ) : (
                <div className="divide-y divide-slate-100 rounded-lg border">
                  {ledger.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <span className={`font-semibold ${Number(t.hours) >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                          {Number(t.hours) >= 0 ? "+" : ""}{Number(t.hours)} {t.kind === "peak" ? "peak" : "off-peak"}
                        </span>
                        <span className="text-slate-500"> · {t.reason}</span>
                        {t.note && <span className="text-slate-400 block truncate">{t.note}</span>}
                      </div>
                      <div className="text-xs text-slate-400 shrink-0 text-right">
                        {t.created_at ? format(new Date(t.created_at), "MMM d, yyyy") : ""}
                        {t.location ? <div>{LOCATION_LABEL[t.location] || t.location}</div> : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Reservations */}
        <Card className="border-0 shadow-lg rounded-2xl">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="w-5 h-5" /> Reservations &amp; history
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {bookingsLoading ? (
              <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-[#2d5567]" /></div>
            ) : bookings.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">No reservations on file for this customer.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {bookings.map((b) => (
                  <div key={b.id} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 px-5 py-3">
                    <div className="sm:w-40 font-semibold text-slate-800">
                      {b.booking_date ? format(new Date(b.booking_date + "T00:00:00"), "EEE MMM d, yyyy") : "—"}
                    </div>
                    <div className="sm:w-32 text-sm text-slate-600">
                      {fmtTime(b.start_time)}{b.end_time ? `–${fmtTime(b.end_time)}` : ""}
                    </div>
                    <div className="sm:flex-1 text-sm text-slate-700 truncate">
                      {getBayDisplayName(b.simulator_name || "", b.location)}
                      <span className="text-slate-400"> · {LOCATION_LABEL[b.location] || b.location}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {b.payment_method === "banked_hours" && (
                        <Badge className="bg-green-600 hover:bg-green-600">Banked</Badge>
                      )}
                      {b.status === "cancelled" ? (
                        <Badge variant="outline" className="text-rose-600 border-rose-300">Cancelled</Badge>
                      ) : b.status === "no_show" ? (
                        <Badge variant="outline" className="text-amber-600 border-amber-300">No-show</Badge>
                      ) : (
                        <Badge variant="outline" className="text-slate-600">{b.status || "confirmed"}</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
