import React, { useState, useEffect } from "react";
import { Booking } from "@/entities/all";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, TrendingUp, CalendarDays, Users, UserX } from "lucide-react";
import { format, subDays } from "date-fns";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from "recharts";

const getBayDisplayName = (originalName) => {
  const nameMap = {
    "East 1": "Bay 1", "East 2": "Bay 2",
    "West 1": "Bay 3", "West 2": "Bay 4", "West 3": "Bay 5",
    "South 1": "Bay 6", "South 2": "Bay 7",
    "North 1": "Bay 8", "North 2": "Bay 9",
    "VIP 1": "VIP 1", "VIP 2": "VIP 2"
  };
  return nameMap[originalName] || originalName;
};

const formatHour = (hour) => {
  const h = hour % 12 || 12;
  const period = hour >= 12 ? "PM" : "AM";
  return `${h}${period}`;
};

export default function AdminAnalytics({ location = null, days = 30 }) {
  const [bookings, setBookings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    load();
  }, [location, days]);

  const load = async () => {
    setIsLoading(true);
    try {
      const all = await Booking.list();
      const cutoff = format(subDays(new Date(), days), "yyyy-MM-dd");
      const filtered = all.filter((b) => {
        if (b.booking_date < cutoff) return false;
        if (location && b.location !== location) return false;
        return true;
      });
      setBookings(filtered);
    } catch (error) {
      console.error("Error loading analytics:", error);
    }
    setIsLoading(false);
  };

  // Bookings that count toward revenue/activity (exclude cancelled).
  const active = bookings.filter((b) => b.status !== "cancelled");

  const totalRevenue = active.reduce((sum, b) => sum + (b.total_cost || 0), 0);
  const totalBookings = active.length;
  const totalPlayers = active.reduce((sum, b) => sum + (b.number_of_players || 0), 0);
  const avgPlayers = totalBookings ? (totalPlayers / totalBookings).toFixed(1) : "0";
  const noShows = bookings.filter((b) => b.status === "no_show").length;
  const noShowRate = totalBookings ? Math.round((noShows / (totalBookings + noShows)) * 100) : 0;

  // Revenue by day
  const revenueByDayMap = {};
  active.forEach((b) => {
    revenueByDayMap[b.booking_date] = (revenueByDayMap[b.booking_date] || 0) + (b.total_cost || 0);
  });
  const revenueByDay = Object.keys(revenueByDayMap)
    .sort()
    .map((date) => ({
      date: format(new Date(date), "MMM d"),
      revenue: Math.round(revenueByDayMap[date])
    }));

  // Bookings by bay
  const byBayMap = {};
  active.forEach((b) => {
    const name = getBayDisplayName(b.simulator_name);
    byBayMap[name] = (byBayMap[name] || 0) + 1;
  });
  const bookingsByBay = Object.keys(byBayMap)
    .map((bay) => ({ bay, bookings: byBayMap[bay] }))
    .sort((a, b) => b.bookings - a.bookings);

  // Bookings by hour (peak times)
  const byHourMap = {};
  active.forEach((b) => {
    if (!b.start_time) return;
    const hour = parseInt(String(b.start_time).split(":")[0], 10);
    byHourMap[hour] = (byHourMap[hour] || 0) + 1;
  });
  const bookingsByHour = Object.keys(byHourMap)
    .map((h) => parseInt(h, 10))
    .sort((a, b) => a - b)
    .map((h) => ({ hour: formatHour(h), bookings: byHourMap[h] }));

  if (isLoading) {
    return (
      <Card className="bg-white">
        <CardContent className="p-12 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[#2d5567]" />
        </CardContent>
      </Card>
    );
  }

  const stat = (label, value, Icon) => (
    <Card className="bg-white">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-600">{label}</p>
            <p className="text-2xl font-bold text-slate-800">{value}</p>
          </div>
          <Icon className="w-8 h-8 text-[#2d5567]" />
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-[#2d5567]" />
        <h2 className="text-xl font-bold text-slate-800">
          Last {days} Days{location ? ` — ${location}` : ""}
        </h2>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stat("Revenue", `$${totalRevenue.toFixed(2)}`, TrendingUp)}
        {stat("Bookings", totalBookings, CalendarDays)}
        {stat("Avg Players", avgPlayers, Users)}
        {stat("No-show Rate", `${noShowRate}%`, UserX)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-white">
          <CardHeader>
            <CardTitle className="text-lg">Revenue by Day</CardTitle>
          </CardHeader>
          <CardContent>
            {revenueByDay.length === 0 ? (
              <p className="text-slate-500 text-sm py-8 text-center">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={revenueByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => [`$${v}`, "Revenue"]} />
                  <Bar dataKey="revenue" fill="#2d5567" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white">
          <CardHeader>
            <CardTitle className="text-lg">Bookings by Bay</CardTitle>
          </CardHeader>
          <CardContent>
            {bookingsByBay.length === 0 ? (
              <p className="text-slate-500 text-sm py-8 text-center">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={bookingsByBay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="bay" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="bookings" fill="#1e3a47" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Peak Hours</CardTitle>
          </CardHeader>
          <CardContent>
            {bookingsByHour.length === 0 ? (
              <p className="text-slate-500 text-sm py-8 text-center">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={bookingsByHour}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="hour" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="bookings" fill="#3b7088" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
