import React, { useState, useEffect } from "react";
import { Booking, Simulator, User, ScheduleBlock } from "@/entities/all";
import { base44 } from "@/api/base44Client";
import { normalizeMemberBooking } from "@/lib/bookingCategories";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Plus, Loader2, Users, DollarSign, Ban, DollarSignIcon, BarChart3, Tag } from "lucide-react";
import { format, addDays, subDays } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { useNavigate } from "react-router-dom";

import DailyScheduleView from "../components/admin/DailyScheduleView";
import ManualBookingForm from "../components/admin/ManualBookingForm";
import BookingDetailModal from "../components/admin/BookingDetailModal";
import BlockScheduleForm from "../components/admin/BlockScheduleForm";
import PricingManager from "../components/admin/PricingManager";
import SpecialsManager from "../components/admin/SpecialsManager";
import AdminAnalytics from "../components/admin/AdminAnalytics";

export default function AdminDashboard() {
  const navigate = useNavigate(); // Initialize useNavigate hook
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [bookings, setBookings] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [simulators, setSimulators] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showManualBooking, setShowManualBooking] = useState(false);
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
  const [showSpecials, setShowSpecials] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [preselectedBay, setPreselectedBay] = useState(null);
  const [preselectedTime, setPreselectedTime] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadBookingsForDate();
  }, [selectedDate]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadBookingsForDate();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [selectedDate]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const user = await User.me();
      setCurrentUser(user);
      
      if (user.role !== 'admin') {
        alert("Access denied. Admin privileges required.");
        return;
      }

      const sims = await Simulator.list();
      const allowedBayNames = [
        "East 1", "East 2",
        "West 1", "West 2", "West 3",
        "South 1", "South 2",
        "North 1", "North 2",
        "VIP 1", "VIP 2"
      ];
      const allowedBays = sims.filter(b => 
        b.is_active && allowedBayNames.includes(b.name)
      );
      setSimulators(allowedBays);
    } catch (error) {
      console.error("Error loading data:", error);
      navigate("/");
    }
    setIsLoading(false);
  };

  const loadBookingsForDate = async () => {
    try {
      const formattedDate = format(selectedDate, "yyyy-MM-dd");
      const [allBookings, allBlocks, allMemberBookings] = await Promise.all([
        Booking.list(),
        ScheduleBlock.list(),
        base44.entities.MemberBooking.list()
      ]);

      const dateBookings = allBookings.filter(
        b => b.booking_date === formattedDate && b.status !== "cancelled"
      );
      const dateMemberBookings = (allMemberBookings || [])
        .filter(b => b.booking_date === formattedDate && b.status !== "cancelled")
        .map(normalizeMemberBooking);
      const dateBlocks = allBlocks.filter(
        b => b.block_date === formattedDate
      );

      setBookings([...dateBookings, ...dateMemberBookings]);
      setBlocks(dateBlocks);
    } catch (error) {
      console.error("Error loading bookings:", error);
    }
  };

  const handlePreviousDay = () => {
    setSelectedDate(subDays(selectedDate, 1));
  };

  const handleNextDay = () => {
    setSelectedDate(addDays(selectedDate, 1));
  };

  const handleToday = () => {
    setSelectedDate(new Date());
  };

  const handleDateSelect = (date) => {
    if (date) {
      setSelectedDate(date);
      setShowDatePicker(false);
    }
  };

  const handleBookingClick = (booking) => {
    setSelectedBooking(booking);
  };

  const handleTimeSlotClick = (bay, time) => {
    setPreselectedBay(bay);
    setPreselectedTime(time);
    setShowManualBooking(true);
  };

  const handleCloseModal = () => {
    setSelectedBooking(null);
    loadBookingsForDate();
  };

  const handleManualBookingComplete = () => {
    setShowManualBooking(false);
    setPreselectedBay(null);
    setPreselectedTime(null);
    loadBookingsForDate();
  };

  const handleBlockComplete = () => {
    setShowBlockForm(false);
    loadBookingsForDate();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  // This check remains as a fallback display in case navigation hasn't occurred yet,
  // or if the user state changes after initial load.
  if (currentUser?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <h2 className="text-2xl font-bold text-red-600 mb-2">Access Denied</h2>
            <p className="text-slate-600">Admin privileges required to access this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalRevenue = bookings.reduce((sum, b) => sum + (b.total_cost || 0), 0);
  const totalPlayers = bookings.reduce((sum, b) => sum + (b.number_of_players || 0), 0);

  return (
    <div className="min-h-screen p-3 sm:p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-3xl sm:text-4xl font-bold text-slate-800 mb-2">
                  Admin Dashboard
                </h1>
                <p className="text-slate-600">Manage bookings and view daily schedule</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={() => setShowAnalytics((v) => !v)}
                  variant="outline"
                  className="h-12 px-4"
                >
                  <BarChart3 className="w-5 h-5 mr-2" />
                  {showAnalytics ? "Hide Analytics" : "Analytics"}
                </Button>
                <Button
                  onClick={() => setShowPricing(true)}
                  variant="outline"
                  className="h-12 px-4"
                >
                  <DollarSignIcon className="w-5 h-5 mr-2" />
                  Pricing
                </Button>
                <Button
                  onClick={() => setShowSpecials(true)}
                  variant="outline"
                  className="h-12 px-4 border-amber-300 text-amber-700 hover:bg-amber-50"
                >
                  <Tag className="w-5 h-5 mr-2" />
                  Specials
                </Button>
                <Button
                  onClick={() => setShowBlockForm(true)}
                  variant="outline"
                  className="h-12 px-4"
                >
                  <Ban className="w-5 h-5 mr-2" />
                  Block Time
                </Button>
                <Button
                  onClick={() => {
                    setPreselectedBay(null);
                    setPreselectedTime(null);
                    setShowManualBooking(true);
                  }}
                  className="bg-[#2d5567] hover:bg-[#1e3a47] h-12 px-6"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Manual Booking
                </Button>
              </div>
            </div>
          </div>

          {/* Date Navigation */}
          <div className="flex items-center justify-between gap-3 mb-6">
            <Button
              variant="outline"
              onClick={handlePreviousDay}
              className="h-10"
            >
              ← Previous
            </Button>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={handleToday}
                className="h-10"
              >
                Today
              </Button>
              <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-10 px-4">
                    <Calendar className="w-4 h-4 mr-2" />
                    {format(selectedDate, "MMM d, yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="center">
                  <CalendarComponent
                    mode="single"
                    selected={selectedDate}
                    onSelect={handleDateSelect}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <Button
              variant="outline"
              onClick={handleNextDay}
              className="h-10"
            >
              Next →
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="bg-white">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600">Total Bookings</p>
                    <p className="text-2xl font-bold text-slate-800">{bookings.length}</p>
                  </div>
                  <Calendar className="w-8 h-8 text-[#2d5567]" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600">Total Players</p>
                    <p className="text-2xl font-bold text-slate-800">{totalPlayers}</p>
                  </div>
                  <Users className="w-8 h-8 text-[#2d5567]" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600">Revenue</p>
                    <p className="text-2xl font-bold text-slate-800">${totalRevenue.toFixed(2)}</p>
                  </div>
                  <DollarSign className="w-8 h-8 text-[#2d5567]" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Analytics */}
        {showAnalytics && (
          <div className="mb-8">
            <AdminAnalytics />
          </div>
        )}

        {/* Schedule View */}
        <DailyScheduleView
          date={selectedDate}
          bookings={bookings}
          blocks={blocks}
          simulators={simulators}
          onBookingClick={handleBookingClick}
          onTimeSlotClick={handleTimeSlotClick}
          onReload={loadBookingsForDate}
        />

        {/* Modals */}
        {showManualBooking && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <ManualBookingForm
                simulators={simulators}
                existingBookings={bookings}
                existingBlocks={blocks}
                onClose={() => {
                  setShowManualBooking(false);
                  setPreselectedBay(null);
                  setPreselectedTime(null);
                }}
                onComplete={handleManualBookingComplete}
                initialDate={selectedDate}
                preselectedBay={preselectedBay}
                preselectedTime={preselectedTime}
              />
            </div>
          </div>
        )}

        {showBlockForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <BlockScheduleForm
                simulators={simulators}
                onClose={() => setShowBlockForm(false)}
                onComplete={handleBlockComplete}
                initialDate={selectedDate}
              />
            </div>
          </div>
        )}

        {showPricing && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <PricingManager
                simulators={simulators}
                onClose={() => setShowPricing(false)}
                onComplete={() => {
                  setShowPricing(false);
                  loadData();
                }}
              />
            </div>
          </div>
        )}

        {showSpecials && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              <SpecialsManager
                defaultLocation="vadnais_heights"
                onClose={() => setShowSpecials(false)}
              />
            </div>
          </div>
        )}

        {selectedBooking && (
          <BookingDetailModal
            booking={selectedBooking}
            onClose={handleCloseModal}
          />
        )}
      </div>
    </div>
  );
}