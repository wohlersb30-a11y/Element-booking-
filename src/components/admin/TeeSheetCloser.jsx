import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Lock, Unlock, AlertTriangle } from "lucide-react";

const LOCATION_LABELS = {
  vadnais_heights: "Vadnais Heights",
  burnsville: "Burnsville",
};

// Self-contained control that closes/reopens a location's tee sheet.
// Renders a prominent red banner (with the reason) while closed, and a
// "Close Teesheet" / "Reopen Tee Sheet" toggle button. Placed once per
// location dashboard.
export default function TeeSheetCloser({ location, className = "" }) {
  const [closure, setClosure] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const rows = await base44.entities.TeeSheetClosure.filter(
        { location, is_active: true },
        "-created_at"
      );
      setClosure(rows && rows.length ? rows[0] : null);
    } catch (e) {
      console.error("Failed to load tee sheet closure:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  const handleClose = async () => {
    setError("");
    if (!reason.trim()) {
      setError("Please enter a reason so we can let customers know.");
      return;
    }
    setSaving(true);
    try {
      let createdBy = "";
      try {
        const me = await base44.auth.me();
        createdBy = me?.email || "";
      } catch {
        /* non-fatal */
      }
      await base44.entities.TeeSheetClosure.create({
        location,
        reason: reason.trim(),
        is_active: true,
        created_by: createdBy,
      });
      setReason("");
      setShowModal(false);
      await load();
    } catch (e) {
      setError(e.message || "Could not close the tee sheet. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleReopen = async () => {
    if (!closure) return;
    if (
      !window.confirm(
        `Reopen the ${LOCATION_LABELS[location] || location} tee sheet? Customers will be able to book online again.`
      )
    )
      return;
    setSaving(true);
    try {
      await base44.entities.TeeSheetClosure.update(closure.id, { is_active: false });
      await load();
    } catch (e) {
      alert(e.message || "Could not reopen the tee sheet.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <div className={className}>
      {closure ? (
        <Card className="border-2 border-red-300 bg-red-50">
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-start gap-3 flex-1">
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                <Lock className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="font-bold text-red-800">
                  Tee sheet is CLOSED — online booking is turned off
                </p>
                {closure.reason && (
                  <p className="text-sm text-red-700 mt-0.5">
                    Reason shown to customers: “{closure.reason}”
                  </p>
                )}
              </div>
            </div>
            <Button
              onClick={handleReopen}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 h-11 px-5 shrink-0"
            >
              {saving ? (
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              ) : (
                <Unlock className="w-5 h-5 mr-2" />
              )}
              Reopen Tee Sheet
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex justify-end">
          <Button
            onClick={() => {
              setError("");
              setReason("");
              setShowModal(true);
            }}
            variant="outline"
            className="h-11 px-4 border-red-300 text-red-700 hover:bg-red-50"
          >
            <Lock className="w-5 h-5 mr-2" />
            Close Teesheet
          </Button>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-11 h-11 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-800 heading-font">
                  Close {LOCATION_LABELS[location] || location} Tee Sheet
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  This turns off all online booking for this location until you
                  reopen it. Customers will see the reason below.
                </p>
              </div>
            </div>

            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Reason for closing
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={280}
              placeholder="e.g. We're closed today for a private event. We can't wait to welcome you back tomorrow!"
              className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d5567]"
            />
            <p className="text-xs text-slate-400 mt-1">
              Shown to customers in a friendly message. {280 - reason.length} characters left.
            </p>

            {error && <p className="text-sm text-red-600 mt-2">{error}</p>}

            <div className="flex justify-end gap-3 mt-5">
              <Button
                variant="outline"
                onClick={() => setShowModal(false)}
                disabled={saving}
                className="h-11 px-5"
              >
                Cancel
              </Button>
              <Button
                onClick={handleClose}
                disabled={saving}
                className="bg-red-600 hover:bg-red-700 h-11 px-5"
              >
                {saving ? (
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                ) : (
                  <Lock className="w-5 h-5 mr-2" />
                )}
                Close Tee Sheet
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
