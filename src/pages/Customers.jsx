import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Users, Search, Loader2, Mail, Phone, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 50;

// Format a digits-only phone as (XXX) XXX-XXXX when it's a 10-digit US number.
function fmtPhone(p) {
  if (!p) return "";
  const d = String(p).replace(/\D/g, "");
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return p;
}

export default function Customers() {
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Debounce the search box so we don't hit the DB on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(term.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [term]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        let query = supabase
          .from("customers")
          .select("id, full_name, email, phone, source", { count: "exact" });

        if (debounced) {
          // Search name/email across the raw term; phone against digits only.
          const digits = debounced.replace(/\D/g, "");
          const esc = debounced.replace(/[%,]/g, " ");
          const ors = [
            `full_name.ilike.%${esc}%`,
            `email.ilike.%${esc}%`
          ];
          if (digits) ors.push(`phone.ilike.%${digits}%`);
          query = query.or(ors.join(","));
        }

        const from = page * PAGE_SIZE;
        query = query
          .order("full_name", { ascending: true, nullsFirst: false })
          .range(from, from + PAGE_SIZE - 1);

        const { data, count, error } = await query;
        if (error) throw error;
        if (!active) return;
        setRows(data || []);
        setTotal(count || 0);
      } catch (e) {
        if (active) setError(e.message || "Failed to load customers.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [debounced, page]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeLabel = useMemo(() => {
    if (total === 0) return "0";
    const start = page * PAGE_SIZE + 1;
    const end = Math.min(total, (page + 1) * PAGE_SIZE);
    return `${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()}`;
  }, [page, total]);

  return (
    <div className="min-h-screen p-4 sm:p-8 bg-gradient-to-br from-slate-50 via-emerald-50/30 to-slate-100">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-[#2d5567] flex items-center justify-center">
            <Users className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-800 heading-font">Customers</h1>
            <p className="text-sm text-slate-500">
              {total.toLocaleString()} contacts in the directory
            </p>
          </div>
        </div>

        <Card className="border-0 shadow-lg rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Search by name, email, or phone…"
                className="pl-9 h-11"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {error && (
              <div className="p-6 text-center text-red-600">{error}</div>
            )}

            {loading ? (
              <div className="p-12 flex justify-center">
                <Loader2 className="w-7 h-7 animate-spin text-[#2d5567]" />
              </div>
            ) : rows.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                No customers match “{debounced}”.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {rows.map((c) => (
                  <div
                    key={c.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-6 px-5 py-3 hover:bg-slate-50"
                  >
                    <div className="font-semibold text-slate-800 sm:w-56 truncate">
                      {c.full_name || <span className="text-slate-400">—</span>}
                    </div>
                    <a
                      href={`mailto:${c.email}`}
                      className="flex items-center gap-2 text-sm text-[#2d5567] hover:underline sm:flex-1 truncate"
                    >
                      <Mail className="w-3.5 h-3.5 shrink-0" />
                      {c.email || <span className="text-slate-400">—</span>}
                    </a>
                    <a
                      href={`tel:${c.phone}`}
                      className="flex items-center gap-2 text-sm text-slate-600 hover:underline sm:w-40"
                    >
                      <Phone className="w-3.5 h-3.5 shrink-0" />
                      {fmtPhone(c.phone) || <span className="text-slate-400">—</span>}
                    </a>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-slate-500">{rangeLabel}</p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0 || loading}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="w-4 h-4" /> Prev
            </Button>
            <span className="text-sm text-slate-600 tabular-nums">
              {page + 1} / {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= pageCount || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
