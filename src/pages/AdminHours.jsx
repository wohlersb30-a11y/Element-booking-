import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, Upload, Plus } from "lucide-react";
import { format } from "date-fns";

const LOCATIONS = [
  { value: "vadnais_heights", label: "Vadnais Heights" },
  { value: "burnsville", label: "Burnsville" }
];
const LOCATION_LABEL = { vadnais_heights: "Vadnais Heights", burnsville: "Burnsville" };

// Parse a pasted CSV with a header row into { email, location, peak, off_peak }.
// Accepts columns: email, location, peak (or peak_hours), off_peak (or off_peak_hours).
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = (names) => headers.findIndex((h) => names.includes(h));
  const iEmail = idx(["email", "e-mail"]);
  const iLoc = idx(["location", "site"]);
  const iPeak = idx(["peak", "peak_hours", "peak hours"]);
  const iOff = idx(["off_peak", "off_peak_hours", "off-peak", "offpeak", "off peak hours"]);
  const out = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = lines[r].split(",").map((c) => c.trim());
    const email = iEmail >= 0 ? cols[iEmail] : "";
    if (!email) continue;
    out.push({
      email,
      location: iLoc >= 0 ? cols[iLoc] : "",
      peak: iPeak >= 0 ? Number(cols[iPeak] || 0) : 0,
      off_peak: iOff >= 0 ? Number(cols[iOff] || 0) : 0
    });
  }
  return out;
}

export default function AdminHours() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  // Adjust form
  const [adjKind, setAdjKind] = useState("off_peak");
  const [adjHours, setAdjHours] = useState("");
  const [adjLocation, setAdjLocation] = useState("vadnais_heights");
  const [adjNote, setAdjNote] = useState("");

  // Import form
  const [csv, setCsv] = useState("");
  const [importNote, setImportNote] = useState("Imported from legacy system");
  const [importMsg, setImportMsg] = useState("");
  const [importing, setImporting] = useState(false);

  const lookup = async (targetEmail) => {
    const e = (targetEmail ?? email).trim();
    if (!e) return;
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("adminHourBalance", { action: "lookup", email: e });
      const d = res.data || {};
      if (d.success) setResult(d);
      else setError(d.error || "Lookup failed.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const adjust = async () => {
    setError("");
    const hours = Number(adjHours);
    if (!email.trim() || !hours) {
      setError("Enter an email and a non-zero hours value (use a negative number to remove hours).");
      return;
    }
    setLoading(true);
    try {
      const res = await base44.functions.invoke("adminHourBalance", {
        action: "adjust",
        email: email.trim(),
        kind: adjKind,
        hours,
        location: adjLocation,
        note: adjNote
      });
      const d = res.data || {};
      if (d.success) {
        setAdjHours("");
        setAdjNote("");
        await lookup(email);
      } else setError(d.error || "Adjustment failed.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const runImport = async () => {
    setImportMsg("");
    setError("");
    const entries = parseCsv(csv);
    if (entries.length === 0) {
      setError("No rows parsed. Include a header row with email, location, peak, off_peak.");
      return;
    }
    setImporting(true);
    try {
      const res = await base44.functions.invoke("adminHourBalance", {
        action: "import",
        entries,
        note: importNote
      });
      const d = res.data || {};
      if (d.success) {
        setImportMsg(
          `Imported ${d.credited} ledger entr${d.credited === 1 ? "y" : "ies"} for ${entries.length} customer(s).` +
            (d.skipped?.length ? ` Skipped ${d.skipped.length} already imported with this note.` : "")
        );
        setCsv("");
      } else setError(d.error || "Import failed.");
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-3xl font-black heading-font text-slate-800">Banked Hours — Admin</h1>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">{error}</div>
      )}

      {/* Lookup */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Look up a customer</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="customer@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && lookup()}
            />
            <Button onClick={() => lookup()} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>

          {result && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {Object.keys(result.balance || {}).length === 0 ? (
                  <p className="text-slate-500 text-sm">No banked hours on record.</p>
                ) : (
                  Object.entries(result.balance).map(([loc, b]) => (
                    <div key={loc} className="rounded-lg border p-3">
                      <p className="font-semibold text-slate-700">{LOCATION_LABEL[loc] || loc}</p>
                      <p className="text-sm text-slate-600">
                        Peak: <span className="font-bold text-orange-600">{b.peak}</span> ·
                        {" "}Off-peak: <span className="font-bold text-teal-600">{b.off_peak}</span>
                      </p>
                    </div>
                  ))
                )}
              </div>

              {/* Adjust */}
              <div className="rounded-lg border p-4 space-y-3 bg-slate-50">
                <p className="font-semibold text-slate-700 flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Add / remove hours
                </p>
                <div className="grid gap-3 sm:grid-cols-4">
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
                    <Label className="text-xs">Hours (+/-)</Label>
                    <Input type="number" step="0.5" value={adjHours} onChange={(e) => setAdjHours(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Location</Label>
                    <Select value={adjLocation} onValueChange={setAdjLocation}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LOCATIONS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Note</Label>
                    <Input value={adjNote} onChange={(e) => setAdjNote(e.target.value)} placeholder="reason" />
                  </div>
                </div>
                <Button onClick={adjust} disabled={loading} className="bg-[#2d5567]">Apply</Button>
              </div>

              {/* Ledger */}
              <div className="rounded-lg border">
                <p className="font-semibold text-slate-700 px-4 py-2 border-b">History</p>
                <div className="max-h-72 overflow-auto divide-y">
                  {(result.ledger || []).map((t) => (
                    <div key={t.id} className="flex items-center justify-between px-4 py-2 text-sm">
                      <div className="min-w-0">
                        <span className="capitalize font-medium">{t.reason}</span>
                        {t.note ? <span className="text-slate-500"> — {t.note}</span> : null}
                        <div className="text-xs text-slate-400">
                          {t.created_at ? format(new Date(t.created_at), "MMM d, yyyy h:mm a") : ""}
                          {t.location ? ` · ${LOCATION_LABEL[t.location] || t.location}` : ""}
                          {t.created_by ? ` · by ${t.created_by}` : ""}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className={Number(t.hours) >= 0 ? "text-emerald-600 font-bold" : "text-slate-700 font-bold"}>
                          {Number(t.hours) >= 0 ? "+" : ""}{Number(t.hours)}h
                        </span>
                        <Badge variant="outline" className="ml-2 text-xs">{t.kind === "peak" ? "peak" : "off-peak"}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Import */}
      <Card>
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Upload className="w-5 h-5" /> Import existing balances</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-600">
            Paste a CSV export from your current system. First row must be a header. Recognized columns:
            {" "}<code>email, location, peak, off_peak</code>. Location should be
            {" "}<code>vadnais_heights</code> or <code>burnsville</code>. Re-running with the same note skips
            customers already imported under that note.
          </p>
          <div>
            <Label className="text-xs">Batch note</Label>
            <Input value={importNote} onChange={(e) => setImportNote(e.target.value)} />
          </div>
          <textarea
            className="w-full h-40 rounded-lg border p-3 font-mono text-xs"
            placeholder={"email,location,peak,off_peak\njane@example.com,vadnais_heights,4,6\njohn@example.com,burnsville,0,10"}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
          />
          {importMsg && <p className="text-sm text-emerald-700">{importMsg}</p>}
          <Button onClick={runImport} disabled={importing} className="bg-[#2d5567]">
            {importing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing…</> : "Import balances"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
