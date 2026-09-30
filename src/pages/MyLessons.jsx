import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, GraduationCap, CalendarDays, Award, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format, parseISO } from "date-fns";
import LessonSlotPicker from "@/components/lessons/LessonSlotPicker";

const LOCATION_LABEL = { vadnais_heights: "Vadnais Heights", burnsville: "Burnsville" };

function to12h(t) {
  if (!t || typeof t !== "string" || !t.includes(":")) return String(t ?? "");
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h)) return t;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function todayStr() {
  return format(new Date(), "yyyy-MM-dd");
}

export default function MyLessons() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [credits, setCredits] = useState([]);
  const [bookings, setBookings] = useState([]);

  // Book-from-bank flow.
  const [bankLocation, setBankLocation] = useState(null);
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const me = await base44.auth.me();
      const lowerEmail = (me?.email || "").toLowerCase();
      setEmail(lowerEmail);
      const [tx, bk] = await Promise.all([
        base44.entities.LessonCredit.filter({ user_email: lowerEmail }, "-created_at"),
        base44.entities.LessonBooking.filter({ customer_email: lowerEmail }, "-lesson_date")
      ]);
      setCredits(tx || []);
      setBookings(bk || []);
    } catch (e) {
      console.error("Failed to load lessons:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Balance per location = SUM(delta).
  const balances = {};
  for (const t of credits) {
    const loc = t.location || "unknown";
    balances[loc] = (balances[loc] || 0) + Number(t.delta || 0);
  }
  const locationsWithCredits = Object.keys(balances).filter((l) => balances[l] > 0);

  const today = todayStr();
  const upcoming = bookings
    .filter((b) => b.status !== "cancelled" && b.lesson_date >= today)
    .sort((a, b) =>
      a.lesson_date === b.lesson_date
        ? String(a.start_time).localeCompare(String(b.start_time))
        : a.lesson_date.localeCompare(b.lesson_date)
    );

  const openBankBooking = (loc) => {
    setError("");
    setSelectedSlot(null);
    setBankLocation(loc);
    setSlotsLoading(true);
    supabase
      .rpc("open_lesson_slots", { p_location: loc })
      .then(({ data, error: rpcErr }) => {
        if (rpcErr) {
          console.error("open_lesson_slots failed:", rpcErr);
          setSlots([]);
        } else {
          setSlots(data || []);
        }
      })
      .finally(() => setSlotsLoading(false));
  };

  const confirmBankBooking = async () => {
    if (!selectedSlot) return setError("Please pick a time.");
    setBooking(true);
    setError("");
    try {
      const res = await base44.functions.invoke("bookLessonFromBank", {
        slotId: selectedSlot.id
      });
      const d = res.data || {};
      if (d.success) {
        setBankLocation(null);
        setSelectedSlot(null);
        setLoading(true);
        await load();
      } else {
        setError(d.error || "Could not book that time. Please try another.");
      }
    } catch (e) {
      setError(e.message || "Something went wrong.");
    } finally {
      setBooking(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#2d5567]" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl font-black heading-font text-slate-800 flex items-center gap-2">
          <GraduationCap className="w-7 h-7 text-[#2d5567]" /> My Lessons
        </h1>
        <Button
          onClick={() => navigate(createPageUrl("Lessons"))}
          className="bg-gradient-to-r from-[#2d5567] to-[#1e3a47]"
        >
          <Plus className="w-4 h-4 mr-2" /> Buy Lessons
        </Button>
      </div>

      {/* Credit balances / book from bank */}
      {locationsWithCredits.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {locationsWithCredits.map((loc) => (
            <Card key={loc} className="border-2 border-teal-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">{LOCATION_LABEL[loc] || loc}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 flex items-center gap-1">
                    <Award className="w-4 h-4 text-teal-500" /> Lessons in your bank
                  </span>
                  <span className="text-3xl font-black text-teal-600">{balances[loc]}</span>
                </div>
                <Button variant="outline" className="w-full" onClick={() => openBankBooking(loc)}>
                  <CalendarDays className="w-4 h-4 mr-2" /> Schedule a lesson
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Book-from-bank slot picker */}
      {bankLocation && (
        <Card className="border-2 border-[#2d5567]">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">
              Schedule a lesson — {LOCATION_LABEL[bankLocation] || bankLocation}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <LessonSlotPicker
              slots={slots}
              bookings={[]}
              location={bankLocation}
              loading={slotsLoading}
              selectedSlotId={selectedSlot?.id}
              onSelect={setSelectedSlot}
            />
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
                {error}
              </div>
            )}
            <div className="flex gap-3">
              <Button
                onClick={confirmBankBooking}
                disabled={booking || !selectedSlot}
                className="bg-gradient-to-r from-[#2d5567] to-[#1e3a47]"
              >
                {booking ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Booking…</>
                ) : (
                  "Confirm (uses 1 lesson)"
                )}
              </Button>
              <Button variant="ghost" onClick={() => setBankLocation(null)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upcoming lessons */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Upcoming Lessons</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {upcoming.length === 0 ? (
            <p className="p-6 text-slate-500 text-sm">
              No upcoming lessons.{" "}
              {locationsWithCredits.length > 0
                ? "Use the buttons above to schedule one from your bank."
                : "Buy a package to get started."}
            </p>
          ) : (
            <div className="divide-y">
              {upcoming.map((b) => (
                <div key={b.id} className="flex items-center gap-3 px-4 sm:px-6 py-3">
                  <CalendarDays className="w-5 h-5 text-[#2d5567] flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-800 text-sm">
                      {format(parseISO(b.lesson_date), "EEEE, MMM d")} · {to12h(b.start_time)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {LOCATION_LABEL[b.location] || b.location} · with Brandon Sigette
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs capitalize">{b.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {locationsWithCredits.length === 0 && upcoming.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-slate-600 space-y-3">
            <GraduationCap className="w-10 h-10 mx-auto text-slate-300" />
            <p>You don't have any lessons yet.</p>
            <Button onClick={() => navigate(createPageUrl("Lessons"))} className="bg-gradient-to-r from-[#2d5567] to-[#1e3a47]">
              Book Lessons with Brandon
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
