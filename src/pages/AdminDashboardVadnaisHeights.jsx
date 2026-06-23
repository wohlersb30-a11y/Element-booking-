
import React, { useState, useEffect } from "react";
import { Booking, Simulator, User, ScheduleBlock } from "@/entities/all";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Plus, Loader2, Users, DollarSign, Ban, DollarSignIcon, BarChart3, Tag, Sparkles } from "lucide-react";
import { format, addDays, subDays } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

import AdminAnalytics from "../components/admin/AdminAnalytics";
import DailyScheduleView from "../components/admin/DailyScheduleView";
import ManualBookingForm from "../components/admin/ManualBookingForm";
import BookingDetailModal from "../components/admin/BookingDetailModal";
import BlockScheduleForm from "../components/admin/BlockScheduleForm";
import PricingManager from "../components/admin/PricingManager";
import SpecialsManager from "../components/admin/SpecialsManager";
import SmartScheduleOptimizer from "../components/admin/SmartScheduleOptimizer";
import LocationSwitcher from "../components/admin/LocationSwitcher";
import CustomerLookup from "../components/admin/CustomerLookup";
import DailyReportSummary from "../components/admin/DailyReportSummary";

export default function AdminDashboardVadnaisHeights() {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [bookings, setBookings] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [simulators, setSimulators] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showManualBooking, setShowManualBooking] = useState(false);
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
  const [showSpecials, setShowSpecials] = useState(false);
  const [showOptimizer, setShowOptimizer] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [preselectedBay, setPreselectedBay] = useState(null);
  const [preselectedTime, setPreselectedTime] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showCustomerLookup, setShowCustomerLookup] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadBookingsForDate();
  }, [selectedDate]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadBookingsForDate();
    }, 30000);

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
      
      // Filter and deduplicate bays - keep only the most recent of each bay name
      const filteredBays = sims.filter(b => 
        b.is_active && allowedBayNames.includes(b.name) && b.location === "vadnais_heights"
      );
      
      // Deduplicate by bay name - keep most recently created
      const uniqueBays = [];
      const seenNames = new Set();
      
      // Sort by created_date descending (most recent first)
      filteredBays.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
      
      for (const bay of filteredBays) {
        if (!seenNames.has(bay.name)) {
          uniqueBays.push(bay);
          seenNames.add(bay.name);
        }
      }
      
      setSimulators(uniqueBays);
    } catch (error) {
      console.error("Error loading data:", error);
      navigate(createPageUrl("BookSimulator"));
    }
    setIsLoading(false);
  };

  const loadBookingsForDate = async () => {
    try {
      const formattedDate = format(selectedDate, "yyyy-MM-dd");
      const [allBookings, allBlocks] = await Promise.all([
        Booking.list(),
        ScheduleBlock.list()
      ]);
      
      const dateBookings = allBookings.filter(
        b => b.booking_date === formattedDate && b.status !== "cancelled" && b.location === "vadnais_heights"
      );
      const dateBlocks = allBlocks.filter(
        b => b.block_date === formattedDate && b.location === "vadnais_heights"
      );
      
      setBookings(dateBookings);
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
        <Loader2 className="w-8 h-8 animate-spin text-[#2d5567]" />
      </div>
    );
  }

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
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-3xl sm:text-4xl font-bold text-slate-800 mb-2">
                  Vadnais Heights Dashboard
                </h1>
                <p className="text-slate-600 mb-3">Manage bookings and view daily schedule</p>
                <LocationSwitcher current="vadnais_heights" />
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
                  onClick={() => setShowCustomerLookup(true)}
                  variant="outline"
                  className="h-12 px-4"
                >
                  <Users className="w-5 h-5 mr-2" />
                  Customer Lookup
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
                  onClick={() => setShowOptimizer(true)}
                  variant="outline"
                  className="h-12 px-4 border-[#2d5567]/40 text-[#2d5567] hover:bg-[#2d5567]/10"
                >
                  <Sparkles className="w-5 h-5 mr-2" />
                  Optimize
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
          <DailyReportSummary bookings={bookings} date={selectedDate} />
        </div>

        {showAnalytics && (
          <div className="mb-8">
            <AdminAnalytics location="vadnais_heights" />
          </div>
        )}

        <DailyScheduleView
          date={selectedDate}
          bookings={bookings}
          blocks={blocks}
          simulators={simulators}
          onBookingClick={handleBookingClick}
          onTimeSlotClick={handleTimeSlotClick}
          onReload={loadBookingsForDate}
        />

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
                location="vadnais_heights"
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
                location="vadnais_heights"
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

        {showOptimizer && (
          <SmartScheduleOptimizer
            date={selectedDate}
            location="vadnais_heights"
            bookings={bookings}
            blocks={blocks}
            simulators={simulators}
            onClose={() => setShowOptimizer(false)}
            onApplied={loadBookingsForDate}
          />
        )}

        {selectedBooking && (
          <BookingDetailModal
            booking={selectedBooking}
            onClose={handleCloseModal}
            simulators={simulators}
            existingBookings={bookings}
          />
        )}

        {showCustomerLookup && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <CustomerLookup
                onClose={() => setShowCustomerLookup(false)}
                onBookingSelect={(booking) => {
                  setSelectedBooking(booking);
                  setShowCustomerLookup(false);
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
