import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Trophy, Loader2, Check, ExternalLink } from "lucide-react";

const LOCATION_LABELS = {
  vadnais_heights: "Vadnais Heights",
  burnsville: "Burnsville",
};

// Admin control to set the "League Sign Up" destination URL for a location.
// The customer location-selection page reads this and shows a League Sign Up
// button that opens the URL. Leaving it blank hides the button. Writes to
// `location_settings`. Placed once per location dashboard.
export default function LeagueSignupEditor({ location, className = "" }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const { data } = await supabase
        .from("location_settings")
        .select("league_signup_url")
        .eq("location", location)
        .maybeSingle();
      setUrl(data?.league_signup_url || "");
    } catch (e) {
      console.error("Failed to load league signup URL:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  const save = async () => {
    setError("");
    const trimmed = url.trim();
    // Basic sanity check: allow blank (to remove the button) or an http(s) URL.
    if (trimmed && !/^https?:\/\/.+/i.test(trimmed)) {
      setError("Enter a full URL starting with http:// or https:// (or leave blank to hide the button).");
      return;
    }
    setSaving(true);
    try {
      const { error: upErr } = await supabase.from("location_settings").upsert({
        location,
        league_signup_url: trimmed || null,
        updated_at: new Date().toISOString(),
      });
      if (upErr) throw upErr;
      setUrl(trimmed);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    } catch (e) {
      setError(e.message || "Could not save the URL. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  const summary = url
    ? url
    : "No League Sign Up button shown — add a URL to display it.";

  return (
    <div className={className}>
      <Card className="border border-slate-200">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-[#2d5567]/10 flex items-center justify-center shrink-0">
                <Trophy className="w-5 h-5 text-[#2d5567]" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-slate-800">
                  League Sign Up link — {LOCATION_LABELS[location] || location}
                </p>
                <p className="text-sm text-slate-500 mt-0.5 truncate">{summary}</p>
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
              {panelOpen ? "Close" : "Edit link"}
            </Button>
          </div>

          {panelOpen && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="text-sm text-slate-500 mb-3">
                Paste the web address where customers should go to sign up for
                leagues. This shows as a "League Sign Up" button on the customer
                booking page for {LOCATION_LABELS[location] || location}. Leave it
                blank to hide the button.
              </p>
              <Input
                type="url"
                inputMode="url"
                placeholder="https://your-league-signup-page.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="h-11"
              />

              {url.trim() && /^https?:\/\/.+/i.test(url.trim()) && (
                <a
                  href={url.trim()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-[#2d5567] hover:underline mt-2"
                >
                  <ExternalLink className="w-4 h-4" /> Preview link
                </a>
              )}

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
                    "Save link"
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
