import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Check, GraduationCap, Award } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format, addDays } from "date-fns";
import { LESSON_PACKAGES, LESSON_PRO } from "@/config/lessons";
import { computeTax } from "@/config/tax";
import { trackInitiateCheckout } from "@/lib/metaPixel";
import LessonSlotPicker from "@/components/lessons/LessonSlotPicker";

const LOCATIONS = [
  { value: "vadnais_heights", label: "Vadnais Heights" },
  { value: "burnsville", label: "Burnsville" }
];

function initials(name) {
  return (name || "")
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function Lessons() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [location, setLocation] = useState("");
  const [packageId, setPackageId] = useState("single");
  const [times, setTimes] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedTime, setSelectedTime] = useState(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selectedPackage = LESSON_PACKAGES.find((p) => p.id === packageId) || LESSON_PACKAGES[0];

  useEffect(() => {
    base44.auth.me()
      .then((u) => {
        setUser(u);
        setName(u?.full_name || u?.user_metadata?.full_name || "");
        setPhone(u?.phone || u?.user_metadata?.phone || "");
      })
      .catch(() => setUser(null));
  }, []);

  // Load open lesson times (next 45 days) whenever the location changes.
  useEffect(() => {
    setSelectedTime(null);
    if (!location) {
      setTimes([]);
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    const from = format(new Date(), "yyyy-MM-dd");
    const to = format(addDays(new Date(), 45), "yyyy-MM-dd");
    supabase
      .rpc("open_lesson_times", { p_location: location, p_from: from, p_to: to })
      .then(({ data, error: rpcErr }) => {
        if (cancelled) return;
        if (rpcErr) {
          console.error("open_lesson_times failed:", rpcErr);
          setTimes([]);
        } else {
          setTimes(data || []);
        }
      })
      .finally(() => !cancelled && setSlotsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [location]);

  const noOpenSlots = !slotsLoading && location && times.length === 0;

  const purchase = async () => {
    setError("");
    if (!location) return setError("Please choose a location first.");
    if (!name.trim()) return setError("Please enter your name.");
    if (!phone.trim()) return setError("Please enter a phone number so Brandon can reach you.");
    if (!selectedTime && !noOpenSlots) {
      return setError("Please pick a time for your first lesson.");
    }

    setBusy(true);
    try {
      const origin = window.location.origin;
      const res = await base44.functions.invoke("createLessonCheckout", {
        packageId: selectedPackage.id,
        location,
        lessonDate: selectedTime?.lesson_date || null,
        startTime: selectedTime?.start_time || null,
        customerName: name.trim(),
        customerPhone: phone.trim(),
        successUrl: `${origin}${createPageUrl("PaymentSuccess")}?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}${createPageUrl("Lessons")}`
      });
      const d = res.data || {};
      if (d.url) {
        trackInitiateCheckout({
          value: computeTax(selectedPackage.price, location).total,
          contentType: "product",
          numItems: 1
        });
        const url = d.url;
        try {
          if (window.top && window.top !== window.self) {
            window.top.location.href = url;
          } else {
            window.location.href = url;
          }
        } catch {
          window.location.href = url;
        }
        return;
      }
      setError(d.error || "Could not start checkout. Please try again.");
    } catch (e) {
      setError(e.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const { tax, total } = computeTax(selectedPackage.price, location || "vadnais_heights");

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Pro intro */}
      <Card className="overflow-hidden border-2 border-teal-200">
        <div className="bg-gradient-to-r from-[#2d5567] to-[#1e3a47] p-6 sm:p-8 text-white flex flex-col sm:flex-row items-center gap-6">
          {LESSON_PRO.headshotUrl ? (
            <img
              src={LESSON_PRO.headshotUrl}
              alt={LESSON_PRO.name}
              className="w-28 h-28 rounded-2xl object-cover flex-shrink-0 bg-white/10"
            />
          ) : (
            <div className="w-28 h-28 rounded-2xl bg-white/15 flex items-center justify-center text-4xl font-black flex-shrink-0">
              {initials(LESSON_PRO.name)}
            </div>
          )}
          <div className="text-center sm:text-left">
            <div className="flex items-center gap-2 justify-center sm:justify-start">
              <GraduationCap className="w-6 h-6" />
              <h1 className="text-3xl font-black heading-font">Lessons with {LESSON_PRO.name}</h1>
            </div>
            <p className="text-blue-100 font-medium mt-1">{LESSON_PRO.title}</p>
            <p className="text-blue-50 mt-3 max-w-xl">{LESSON_PRO.intro}</p>
          </div>
        </div>
        <CardContent className="p-6 space-y-4">
          {LESSON_PRO.bio.map((para, i) => (
            <p key={i} className="text-slate-600">{para}</p>
          ))}
          <ul className="grid sm:grid-cols-2 gap-2">
            {LESSON_PRO.highlights.map((h, i) => (
              <li key={i} className="flex items-center gap-2 text-slate-700 text-sm">
                <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" /> {h}
              </li>
            ))}
          </ul>
          {LESSON_PRO.website && (
            <a
              href={LESSON_PRO.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm text-[#2d5567] underline font-medium"
            >
              More about {LESSON_PRO.name.split(" ")[0]} →
            </a>
          )}
        </CardContent>
      </Card>

      {/* Pick a package */}
      <div>
        <h2 className="text-2xl font-black heading-font text-slate-800 mb-3">Choose a Package</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {LESSON_PACKAGES.map((pkg) => {
            const active = pkg.id === packageId;
            return (
              <button
                key={pkg.id}
                type="button"
                onClick={() => setPackageId(pkg.id)}
                className={`text-left rounded-xl border-2 p-5 transition ${
                  active ? "border-[#2d5567] bg-teal-50/60 shadow" : "border-slate-200 bg-white hover:border-teal-300"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-slate-800">{pkg.label}</span>
                  {pkg.save > 0 && (
                    <Badge className="bg-emerald-100 text-emerald-800">Save ${pkg.save}</Badge>
                  )}
                </div>
                <div className="text-3xl font-black text-slate-900">${pkg.price}</div>
                <p className="text-xs text-slate-500 mt-1">+ tax</p>
                <p className="text-sm text-slate-600 mt-2 flex items-center gap-1">
                  <Award className="w-4 h-4 text-teal-500" />
                  {pkg.credits} {pkg.credits === 1 ? "lesson" : "lessons"}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Location + schedule + details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Book Your First Lesson</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label className="font-semibold">Location</Label>
            <p className="text-sm text-slate-500 mb-2">
              Lessons (and any remaining credits) are used at the location you choose.
            </p>
            <Select value={location} onValueChange={setLocation}>
              <SelectTrigger className="max-w-sm">
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                {LOCATIONS.map((l) => (
                  <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {location && (
            <div>
              <Label className="font-semibold">Pick a time for your first lesson</Label>
              {selectedPackage.credits > 1 && (
                <p className="text-sm text-slate-500 mb-2">
                  Your other {selectedPackage.credits - 1} {selectedPackage.credits - 1 === 1 ? "lesson" : "lessons"} will
                  be saved in your account to schedule anytime.
                </p>
              )}
              <p className="text-sm text-slate-500 mb-2">
                Each lesson is 60 minutes. Times start every half hour.
              </p>
              <div className="mt-2">
                <LessonSlotPicker
                  times={times}
                  location={location}
                  loading={slotsLoading}
                  selected={selectedTime}
                  onSelect={setSelectedTime}
                />
              </div>
              {noOpenSlots && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                  No open times right now — you can still purchase, and all {selectedPackage.credits}{" "}
                  {selectedPackage.credits === 1 ? "lesson" : "lessons"} will be saved in your account to schedule later.
                </p>
              )}
            </div>
          )}

          {location && (
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label className="font-semibold">Your name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="mt-1" />
              </div>
              <div>
                <Label className="font-semibold">Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" className="mt-1" />
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
              {error}
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2">
            <Button
              onClick={purchase}
              disabled={busy || !location}
              className="h-12 px-6 font-bold bg-gradient-to-r from-[#2d5567] to-[#1e3a47] flex-1"
            >
              {busy ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Redirecting…</>
              ) : (
                `Continue to Payment — $${total.toFixed(2)}`
              )}
            </Button>
            <p className="text-xs text-slate-500">
              {selectedPackage.label} · ${selectedPackage.price} + ${tax.toFixed(2)} MN tax
            </p>
          </div>
        </CardContent>
      </Card>

      <p className="text-center text-sm text-slate-500">
        Already purchased lessons?{" "}
        <button className="underline font-medium" onClick={() => navigate(createPageUrl("MyLessons"))}>
          View your lesson account
        </button>
      </p>
    </div>
  );
}
