import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Clock, Check, Ticket } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { HOUR_PACKAGES } from "@/config/hourPackages";
import { computeTax } from "@/config/tax";

const LOCATIONS = [
  { value: "vadnais_heights", label: "Vadnais Heights" },
  { value: "burnsville", label: "Burnsville" }
];

export default function BuyHours() {
  const navigate = useNavigate();
  const [location, setLocation] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => setUser(null));
  }, []);

  const buy = async (pkg) => {
    setError("");
    if (!location) {
      setError("Please choose a location first.");
      return;
    }
    setBusyId(pkg.id);
    try {
      const origin = window.location.origin;
      const res = await base44.functions.invoke("purchaseHourPackage", {
        packageId: pkg.id,
        location,
        successUrl: `${origin}${createPageUrl("PaymentSuccess")}?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}${createPageUrl("BuyHours")}`
      });
      const d = res.data || {};
      if (d.url) {
        window.location.href = d.url;
        return;
      }
      setError(d.error || "Could not start checkout. Please try again.");
    } catch (e) {
      setError(e.message || "Something went wrong.");
    } finally {
      setBusyId(null);
    }
  };

  const grouped = [10, 20].map((size) => ({
    size,
    options: HOUR_PACKAGES.filter((p) => p.size === size)
  }));

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-black heading-font text-slate-800">Buy Banked Hours</h1>
        <p className="text-slate-600">
          Purchase simulator hours in bulk and use them whenever you want. We keep a running tally
          of every hour used. Hours never expire and can be split with your group.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 sm:p-6">
          <Label className="font-semibold">Location</Label>
          <p className="text-sm text-slate-500 mb-2">
            Hours are used at the location where you buy them.
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
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
          {error}
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        {grouped.flatMap((g) =>
          g.options.map((pkg) => {
            const isPeak = pkg.kind === "peak";
            const { tax, total } = computeTax(pkg.price, location || "vadnais_heights");
            return (
              <Card
                key={pkg.id}
                className={`border-2 ${isPeak ? "border-orange-300" : "border-teal-300"}`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl flex items-center gap-2">
                      <Ticket className={`w-5 h-5 ${isPeak ? "text-orange-500" : "text-teal-500"}`} />
                      {pkg.size} Hours
                    </CardTitle>
                    <Badge className={isPeak ? "bg-orange-100 text-orange-800" : "bg-teal-100 text-teal-800"}>
                      {isPeak ? "Peak — anytime" : "Off-Peak"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <span className="text-3xl font-black text-slate-800">${pkg.price}</span>
                    <span className="text-slate-500 text-sm"> + tax · ${pkg.perHour}/hr</span>
                    <p className="text-xs text-slate-500 mt-1">
                      With tax: ${total.toFixed(2)} (${tax.toFixed(2)} MN sales tax)
                    </p>
                  </div>
                  <ul className="text-sm text-slate-600 space-y-1">
                    <li className="flex items-center gap-2"><Clock className="w-4 h-4 text-slate-400" /> {pkg.size} hours added to your account</li>
                    <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-500" /> Never expires</li>
                    <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-500" />
                      {isPeak ? "Use for any time slot" : "Use for off-peak slots (weekdays + Fri before 3pm)"}
                    </li>
                  </ul>
                  <Button
                    onClick={() => buy(pkg)}
                    disabled={busyId === pkg.id}
                    className="w-full h-11 font-bold bg-gradient-to-r from-[#2d5567] to-[#1e3a47]"
                  >
                    {busyId === pkg.id ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Redirecting…</>
                    ) : (
                      `Buy for $${total.toFixed(2)}`
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <p className="text-center text-sm text-slate-500">
        Already have hours?{" "}
        <button className="underline font-medium" onClick={() => navigate(createPageUrl("MyHours"))}>
          View your balance
        </button>
      </p>
    </div>
  );
}
