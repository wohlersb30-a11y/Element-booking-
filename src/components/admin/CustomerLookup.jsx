import React, { useState, useEffect } from "react";
import { Booking } from "@/entities/all";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, X, Calendar, Phone, Mail, MapPin, Loader2 } from "lucide-react";
import { format } from "date-fns";

const formatTime = (time24) => {
  if (!time24 || typeof time24 !== "string" || !time24.includes(":")) return "";
  const [h, m] = time24.split(":");
  const hours = Number(h);
  const minutes = Number(m);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return "";
  const period = hours >= 12 ? "PM" : "AM";
  const hours12 = hours % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${period}`;
};

// Format a digits-only phone as (XXX) XXX-XXXX when it's a 10-digit US number.
const fmtPhone = (p) => {
  if (!p) return "";
  const d = String(p).replace(/\D/g, "");
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return p;
};

const DIRECTORY_LIMIT = 50;

export default function CustomerLookup({ onClose, onBookingSelect }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [bookings, setBookings] = useState([]);
  const [filteredBookings, setFilteredBookings] = useState([]);
  // Matches from the full imported customer directory (customers table).
  const [directory, setDirectory] = useState([]);
  const [dirLoading, setDirLoading] = useState(false);

  useEffect(() => {
    loadBookings();
  }, []);

  // Debounce the search box so we don't hit the DB on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(searchTerm.trim()), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Client-side filter over the (already loaded) bookings.
  useEffect(() => {
    if (debounced === "") {
      setFilteredBookings([]);
      return;
    }
    const term = debounced.toLowerCase();
    const filtered = bookings.filter(b =>
      (b.customer_name || "").toLowerCase().includes(term) ||
      (b.customer_email || "").toLowerCase().includes(term) ||
      (b.customer_phone && b.customer_phone.includes(term))
    );
    setFilteredBookings(filtered);
  }, [debounced, bookings]);

  // Server-side search over the full imported customer directory.
  useEffect(() => {
    if (debounced === "") {
      setDirectory([]);
      return;
    }
    let active = true;
    (async () => {
      setDirLoading(true);
      try {
        const digits = debounced.replace(/\D/g, "");
        const esc = debounced.replace(/[%,]/g, " ");
        const ors = [`full_name.ilike.%${esc}%`, `email.ilike.%${esc}%`];
        if (digits) ors.push(`phone.ilike.%${digits}%`);
        const { data, error } = await supabase
          .from("customers")
          .select("id, full_name, email, phone")
          .or(ors.join(","))
          .order("full_name", { ascending: true, nullsFirst: false })
          .limit(DIRECTORY_LIMIT);
        if (error) throw error;
        if (active) setDirectory(data || []);
      } catch (e) {
        console.error("Error searching customer directory:", e);
        if (active) setDirectory([]);
      } finally {
        if (active) setDirLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [debounced]);

  const loadBookings = async () => {
    try {
      const allBookings = await Booking.list("-booking_date");
      setBookings(allBookings);
    } catch (error) {
      console.error("Error loading bookings:", error);
    }
  };

  const groupedBookings = filteredBookings.reduce((acc, booking) => {
    const key = `${booking.customer_name}-${booking.customer_email}`;
    if (!acc[key]) {
      acc[key] = {
        customer: {
          name: booking.customer_name,
          email: booking.customer_email,
          phone: booking.customer_phone
        },
        bookings: []
      };
    }
    acc[key].bookings.push(booking);
    return acc;
  }, {});

  const bookingGroups = Object.values(groupedBookings);

  // Emails/phones already shown via bookings, so we don't list a directory
  // contact twice (once with history, once as a bare contact).
  const seenEmails = new Set(
    bookingGroups.map((g) => (g.customer.email || "").toLowerCase()).filter(Boolean)
  );
  const seenPhones = new Set(
    bookingGroups
      .map((g) => (g.customer.phone || "").replace(/\D/g, ""))
      .filter(Boolean)
  );

  const directoryOnly = directory.filter((c) => {
    const email = (c.email || "").toLowerCase();
    const phone = (c.phone || "").replace(/\D/g, "");
    if (email && seenEmails.has(email)) return false;
    if (phone && seenPhones.has(phone)) return false;
    return true;
  });

  const hasResults = bookingGroups.length > 0 || directoryOnly.length > 0;

  return (
    <Card className="max-w-4xl w-full">
      <CardHeader className="flex flex-row items-center justify-between border-b">
        <CardTitle className="text-2xl">Customer Lookup</CardTitle>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </CardHeader>
      <CardContent className="p-6">
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              type="text"
              placeholder="Search by name, email, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-12 text-base"
              autoFocus
            />
          </div>
        </div>

        <div className="space-y-6 max-h-96 overflow-y-auto">
          {debounced === "" && (
            <p className="text-center text-slate-500 py-8">Start typing to search for customers</p>
          )}

          {debounced !== "" && !hasResults && dirLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-[#2d5567]" />
            </div>
          )}

          {debounced !== "" && !hasResults && !dirLoading && (
            <p className="text-center text-slate-500 py-8">No customers found</p>
          )}

          {bookingGroups.map((group, idx) => (
            <Card key={`b-${idx}`} className="bg-slate-50">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-lg text-slate-800">{group.customer.name}</h3>
                    <div className="flex items-center gap-2 text-sm text-slate-600 mt-1">
                      <Mail className="w-4 h-4" />
                      <span>{group.customer.email}</span>
                    </div>
                    {group.customer.phone && (
                      <div className="flex items-center gap-2 text-sm text-slate-600 mt-1">
                        <Phone className="w-4 h-4" />
                        <span>{fmtPhone(group.customer.phone)}</span>
                      </div>
                    )}
                  </div>
                  <Badge className="bg-[#2d5567]">
                    {group.bookings.length} Booking{group.bookings.length !== 1 ? 's' : ''}
                  </Badge>
                </div>

                <div className="space-y-2 mt-4">
                  {group.bookings.slice(0, 5).map(booking => (
                    <button
                      key={booking.id}
                      onClick={() => onBookingSelect(booking)}
                      className="w-full text-left p-3 bg-white rounded-lg hover:shadow-md transition-shadow border border-slate-200"
                    >
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm">
                            <MapPin className="w-4 h-4 text-[#2d5567]" />
                            <span className="font-semibold">{booking.simulator_name}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            <Calendar className="w-4 h-4" />
                            <span>{format(new Date(booking.booking_date), "MMM d, yyyy")}</span>
                            <span>•</span>
                            <span>{formatTime(booking.start_time)}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge variant={booking.status === "confirmed" ? "default" : "outline"}>
                            {booking.status}
                          </Badge>
                          <div className="text-sm font-semibold text-[#2d5567] mt-1">
                            ${booking.total_cost}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                  {group.bookings.length > 5 && (
                    <p className="text-xs text-slate-500 text-center">
                      +{group.bookings.length - 5} more booking{group.bookings.length - 5 !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Directory contacts (no bookings yet) */}
          {directoryOnly.length > 0 && (
            <div className="space-y-3">
              {bookingGroups.length > 0 && (
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 pt-2">
                  Directory contacts (no bookings yet)
                </p>
              )}
              {directoryOnly.map((c) => (
                <Card key={`d-${c.id}`} className="bg-white border border-slate-200">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-bold text-lg text-slate-800">
                          {c.full_name || <span className="text-slate-400">—</span>}
                        </h3>
                        {c.email && (
                          <a
                            href={`mailto:${c.email}`}
                            className="flex items-center gap-2 text-sm text-[#2d5567] hover:underline mt-1"
                          >
                            <Mail className="w-4 h-4" />
                            <span>{c.email}</span>
                          </a>
                        )}
                        {c.phone && (
                          <a
                            href={`tel:${c.phone}`}
                            className="flex items-center gap-2 text-sm text-slate-600 hover:underline mt-1"
                          >
                            <Phone className="w-4 h-4" />
                            <span>{fmtPhone(c.phone)}</span>
                          </a>
                        )}
                      </div>
                      <Badge variant="outline" className="text-slate-500">Contact</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {directory.length >= DIRECTORY_LIMIT && (
                <p className="text-xs text-slate-500 text-center">
                  Showing the first {DIRECTORY_LIMIT} directory matches — refine your search to narrow it down.
                </p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}