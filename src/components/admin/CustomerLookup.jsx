import React, { useState, useEffect } from "react";
import { Booking } from "@/entities/all";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, X, Calendar, Phone, Mail, MapPin } from "lucide-react";
import { format } from "date-fns";

const formatTime = (time24) => {
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
};

export default function CustomerLookup({ onClose, onBookingSelect }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [bookings, setBookings] = useState([]);
  const [filteredBookings, setFilteredBookings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadBookings();
  }, []);

  useEffect(() => {
    if (searchTerm.trim() === "") {
      setFilteredBookings([]);
      return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = bookings.filter(b => 
      b.customer_name.toLowerCase().includes(term) ||
      b.customer_email.toLowerCase().includes(term) ||
      (b.customer_phone && b.customer_phone.includes(term))
    );
    setFilteredBookings(filtered);
  }, [searchTerm, bookings]);

  const loadBookings = async () => {
    setIsLoading(false);
    try {
      const allBookings = await Booking.list("-booking_date");
      setBookings(allBookings);
    } catch (error) {
      console.error("Error loading bookings:", error);
    }
    setIsLoading(false);
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
          {searchTerm.trim() === "" && (
            <p className="text-center text-slate-500 py-8">Start typing to search for customers</p>
          )}

          {searchTerm.trim() !== "" && filteredBookings.length === 0 && (
            <p className="text-center text-slate-500 py-8">No customers found</p>
          )}

          {Object.values(groupedBookings).map((group, idx) => (
            <Card key={idx} className="bg-slate-50">
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
                        <span>{group.customer.phone}</span>
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
        </div>
      </CardContent>
    </Card>
  );
}