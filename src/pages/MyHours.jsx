import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Clock, Ticket, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";

const LOCATION_LABEL = { vadnais_heights: "Vadnais Heights", burnsville: "Burnsville" };

const REASON_LABEL = {
  purchase: "Purchased",
  import: "Transferred in",
  booking: "Used for booking",
  refund: "Refund",
  adjustment: "Adjustment"
};

export default function MyHours() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [email, setEmail] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const me = await base44.auth.me();
        setEmail(me?.email || "");
        const txns = await base44.entities.HourTransaction.filter(
          { user_email: (me?.email || "").toLowerCase() },
          "-created_at"
        );
        setRows(txns || []);
      } catch (e) {
        console.error("Failed to load hours:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Balance per location -> { peak, off_peak }.
  const balances = {};
  for (const t of rows) {
    const loc = t.location || "unknown";
    balances[loc] = balances[loc] || { peak: 0, off_peak: 0 };
    balances[loc][t.kind === "peak" ? "peak" : "off_peak"] += Number(t.hours || 0);
  }
  const locations = Object.keys(balances);

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
        <h1 className="text-3xl font-black heading-font text-slate-800">My Banked Hours</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(createPageUrl("BuyHours"))}>
            <Ticket className="w-4 h-4 mr-2" /> Buy More
          </Button>
          <Button
            onClick={() => navigate(createPageUrl("BookSimulator"))}
            className="bg-gradient-to-r from-[#2d5567] to-[#1e3a47]"
          >
            Book a Bay
          </Button>
        </div>
      </div>

      {locations.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-slate-600 space-y-3">
            <Clock className="w-10 h-10 mx-auto text-slate-300" />
            <p>You don't have any banked hours yet.</p>
            <Button onClick={() => navigate(createPageUrl("BuyHours"))} className="bg-gradient-to-r from-[#2d5567] to-[#1e3a47]">
              Buy Hours
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {locations.map((loc) => (
            <Card key={loc} className="border-2 border-teal-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">{LOCATION_LABEL[loc] || loc}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Peak hours (anytime)</span>
                  <span className="text-2xl font-black text-orange-600">
                    {Math.max(0, balances[loc].peak).toFixed(balances[loc].peak % 1 ? 1 : 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Off-peak hours</span>
                  <span className="text-2xl font-black text-teal-600">
                    {Math.max(0, balances[loc].off_peak).toFixed(balances[loc].off_peak % 1 ? 1 : 0)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="p-6 text-slate-500 text-sm">No activity yet.</p>
          ) : (
            <div className="divide-y">
              {rows.map((t) => {
                const credit = Number(t.hours) >= 0;
                return (
                  <div key={t.id} className="flex items-center gap-3 px-4 sm:px-6 py-3">
                    {credit ? (
                      <ArrowUpCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                    ) : (
                      <ArrowDownCircle className="w-5 h-5 text-slate-400 flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-800 text-sm">
                        {REASON_LABEL[t.reason] || t.reason}
                        {t.note ? <span className="text-slate-500 font-normal"> — {t.note}</span> : null}
                      </p>
                      <p className="text-xs text-slate-500">
                        {t.created_at ? format(new Date(t.created_at), "MMM d, yyyy h:mm a") : ""}
                        {t.location ? ` · ${LOCATION_LABEL[t.location] || t.location}` : ""}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={`font-bold ${credit ? "text-emerald-600" : "text-slate-700"}`}>
                        {credit ? "+" : ""}{Number(t.hours)} h
                      </span>
                      <Badge variant="outline" className="ml-2 text-xs">
                        {t.kind === "peak" ? "peak" : "off-peak"}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
