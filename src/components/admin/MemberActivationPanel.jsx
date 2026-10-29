import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/SupabaseAuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, Send, Users, Eye, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

// Admin-only panel (shown on the Admin hub) to send the "activate your account"
// email to members. Three actions:
//   Preview      -> dryRun: lists the active-member recipients without sending.
//   Send test    -> sends only to the signed-in admin's own address.
//   Send to all  -> sends to every active member + authorized account holder
//                   (requires a second click to confirm).
//
// Calls the inviteMembers edge function with the admin's JWT (base44 attaches it),
// so no secret is needed in-app. The function creates each Supabase account (if
// needed) and emails a branded set-password link.
export default function MemberActivationPanel() {
  const { user } = useAuth();
  const [busy, setBusy] = useState("");          // "preview" | "test" | "all"
  const [confirmAll, setConfirmAll] = useState(false);
  const [preview, setPreview] = useState(null);  // { count, recipients }
  const [result, setResult] = useState(null);    // { sent, requested, failed }
  const [error, setError] = useState("");

  const run = async (payload, which) => {
    setBusy(which);
    setError("");
    setResult(null);
    if (which !== "preview") setPreview(null);
    try {
      const res = await base44.functions.invoke("inviteMembers", payload);
      const d = res?.data || {};
      if (d.error) {
        setError(d.error);
      } else if (d.dryRun) {
        setPreview({ count: d.count, recipients: d.recipients || [] });
      } else {
        setResult({
          sent: d.sent || 0,
          requested: d.requested || 0,
          failed: d.failed || []
        });
      }
    } catch (e) {
      setError(e?.message || "Request failed.");
    }
    setBusy("");
    setConfirmAll(false);
  };

  const sendTest = () => {
    if (!user?.email) {
      setError("Couldn't read your account email.");
      return;
    }
    run({ testEmail: user.email, testName: user.full_name || null }, "test");
  };

  return (
    <Card className="border-0 shadow-md rounded-2xl">
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shrink-0">
            <Mail className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-slate-800 heading-font">Member Account Activation</h2>
            <p className="text-sm text-slate-500 mt-1">
              Email active members a branded link to set their password for the new
              booking system. Preview the list, send yourself a test, then send to all.
            </p>

            <div className="flex flex-wrap gap-2 mt-4">
              <Button
                type="button"
                variant="outline"
                disabled={!!busy}
                onClick={() => run({ dryRun: true, sendAll: true }, "preview")}
              >
                {busy === "preview" ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Eye className="w-4 h-4 mr-2" />
                )}
                Preview recipients
              </Button>

              <Button
                type="button"
                variant="outline"
                disabled={!!busy}
                onClick={sendTest}
              >
                {busy === "test" ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                Send test to me
              </Button>

              {!confirmAll ? (
                <Button
                  type="button"
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                  disabled={!!busy}
                  onClick={() => {
                    setConfirmAll(true);
                    setError("");
                    setResult(null);
                  }}
                >
                  <Users className="w-4 h-4 mr-2" />
                  Send to all members
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    className="bg-rose-600 hover:bg-rose-700 text-white"
                    disabled={!!busy}
                    onClick={() => run({ sendAll: true }, "all")}
                  >
                    {busy === "all" ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 mr-2" />
                    )}
                    Confirm — send to everyone
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={!!busy}
                    onClick={() => setConfirmAll(false)}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>

            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {preview && (
              <div className="mt-4 rounded-xl border bg-slate-50 p-3 text-sm">
                <p className="font-semibold text-slate-800">
                  {preview.count} recipient{preview.count === 1 ? "" : "s"} would be emailed
                </p>
                {preview.recipients.length > 0 && (
                  <ul className="mt-2 max-h-40 overflow-auto text-slate-600 space-y-0.5">
                    {preview.recipients.map((r, i) => (
                      <li key={i}>
                        {r.email}
                        {r.name ? ` — ${r.name}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-slate-400 mt-2">
                  Nothing was sent. Use “Send to all members” when ready.
                </p>
              </div>
            )}

            {result && (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                <p className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  Sent {result.sent} of {result.requested}.
                </p>
                {result.failed.length > 0 && (
                  <div className="mt-2 text-rose-800">
                    <p className="font-semibold">
                      {result.failed.length} failed:
                    </p>
                    <ul className="mt-1 max-h-40 overflow-auto space-y-0.5">
                      {result.failed.map((f, i) => (
                        <li key={i}>
                          {f.email}: {f.error}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
