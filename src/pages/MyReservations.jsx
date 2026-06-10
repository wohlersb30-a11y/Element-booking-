
import React, { useState, useEffect } from "react";
import { Booking, User } from "@/entities/all";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, MapPin, Loader2, Trash2, Users, MessageSquare, CreditCard, FileText } from "lucide-react";
import { format } from "date-fns";
import { jsPDF } from "jspdf";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";

const formatTime = (time24) => {
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
};

const getPaymentMethodLabel = (method) => {
  const labels = {
    pay_at_venue: "Pay at Venue",
    card_on_file: "Card on File",
    other: "Other Arrangement"
  };
  return labels[method] || method;
};

const getPaymentStatusColor = (status) => {
  const colors = {
    pending: "bg-amber-100 text-amber-800 border-amber-200",
    paid: "bg-[#2d5567]/10 text-[#2d5567] border-[#2d5567]/20",
    refunded: "bg-slate-100 text-slate-800 border-slate-200"
  };
  return colors[status] || "bg-slate-100 text-slate-800";
};

const getBayDisplayName = (originalName) => {
  const nameMap = {
    "East 1": "Bay 1",
    "East 2": "Bay 2",
    "West 1": "Bay 3",
    "West 2": "Bay 4",
    "West 3": "Bay 5",
    "South 1": "Bay 6",
    "South 2": "Bay 7",
    "North 1": "Bay 8",
    "North 2": "Bay 9",
    "VIP 1": "VIP 1",
    "VIP 2": "VIP 2"
  };
  return nameMap[originalName] || originalName;
};

// Helper function for page URLs
const createPageUrl = (pageName) => {
  switch (pageName) {
    case "BookSimulator":
      return "/BookSimulator";
    default:
      return "/";
  }
};

export default function MyReservations() {
  const [bookings, setBookings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleBooking, setRescheduleBooking] = useState(null);

  useEffect(() => {
    loadBookings();
  }, []);

  const loadBookings = async () => {
    setIsLoading(true);
    try {
      const user = await User.me();
      const allBookings = await Booking.filter(
        { customer_email: user.email },
        "-booking_date"
      );
      setBookings(allBookings);
    } catch (error) {
      console.error("Error loading bookings:", error);
    }
    setIsLoading(false);
  };

  const handleCancelClick = (booking) => {
    setSelectedBooking(booking);
    setShowCancelDialog(true);
  };

  const handleCancelConfirm = async () => {
    if (!selectedBooking) return;
    
    setCancellingId(selectedBooking.id);
    try {
      // Use the backend function so the Stripe authorization hold is released,
      // the customer is emailed, and any matching waitlist entries are notified.
      const result = await base44.functions.invoke("cancelBooking", {
        bookingId: selectedBooking.id
      });
      if (result.data && result.data.success) {
        await loadBookings();
      } else {
        alert(result.data?.error || "Could not cancel the booking. Please try again.");
      }
    } catch (error) {
      console.error("Error cancelling booking:", error);
      alert("Could not cancel the booking. Please try again.");
    }
    setCancellingId(null);
    setShowCancelDialog(false);
    setSelectedBooking(null);
  };

  const handleRescheduleClick = (booking) => {
    setRescheduleBooking(booking);
    setShowReschedule(true);
  };

  const handleDownloadReceipt = (booking) => {
    const doc = new jsPDF();
    const left = 20;
    let y = 24;

    doc.setFontSize(20);
    doc.setTextColor(45, 85, 103);
    doc.text("Element Indoor Golf", left, y);
    y += 8;
    doc.setFontSize(12);
    doc.setTextColor(100, 116, 139);
    doc.text("Booking Receipt", left, y);
    y += 12;

    doc.setDrawColor(226, 232, 240);
    doc.line(left, y, 190, y);
    y += 12;

    const rows = [
      ["Confirmation ID", String(booking.id || "—")],
      ["Bay", getBayDisplayName(booking.simulator_name)],
      ["Location", booking.location || "—"],
      ["Date", format(new Date(booking.booking_date), "EEEE, MMMM d, yyyy")],
      ["Time", `${formatTime(booking.start_time)} - ${formatTime(booking.end_time)}`],
      ["Duration", durationText(booking.duration_hours)],
      ["Players", String(booking.number_of_players || 1)],
      ["Payment", getPaymentMethodLabel(booking.payment_method)],
      ["Status", booking.status || "—"]
    ];

    doc.setFontSize(11);
    rows.forEach(([label, value]) => {
      doc.setTextColor(71, 85, 105);
      doc.text(label, left, y);
      doc.setTextColor(30, 41, 59);
      doc.text(String(value), 90, y);
      y += 9;
    });

    y += 6;
    doc.setDrawColor(226, 232, 240);
    doc.line(left, y, 190, y);
    y += 12;
    doc.setFontSize(16);
    doc.setTextColor(45, 85, 103);
    doc.text(`Total: $${Number(booking.total_cost || 0).toFixed(2)}`, left, y);

    y += 16;
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.text("Thank you for booking with Element Indoor Golf.", left, y);

    doc.save(`receipt-${booking.id || "booking"}.pdf`);
  };

  const canReschedule = (booking) => {
    const bookingDateTime = new Date(`${booking.booking_date}T${booking.start_time}`);
    const now = new Date();
    const hoursDiff = (bookingDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursDiff > 4; // Can reschedule if more than 4 hours away
  };

  const canCancel = (booking) => {
    const bookingDateTime = new Date(`${booking.booking_date}T${booking.start_time}`);
    const now = new Date();
    const hoursDiff = (bookingDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursDiff > 4; // Can cancel if more than 4 hours away
  };

  const upcomingBookings = bookings.filter(
    b => b.status === "confirmed" && new Date(b.booking_date) >= new Date()
  );
  const pastBookings = bookings.filter(
    b => b.status !== "confirmed" || new Date(b.booking_date) < new Date()
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  const durationText = (hours) => {
    if (hours % 1 === 0) {
      return hours === 1 ? "1 hour" : `${hours} hours`;
    } else {
      const wholeHours = Math.floor(hours);
      const minutes = (hours - wholeHours) * 60;
      let text = "";
      if (wholeHours > 0) {
        text += `${wholeHours} hour${wholeHours > 1 ? 's' : ''}`;
      }
      if (minutes > 0) {
        if (text !== "") {
          text += " ";
        }
        text += `${minutes} min`;
      }
      return text.trim();
    }
  };

  return (
    <div className="min-h-screen p-3 sm:p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-slate-800 mb-2 leading-tight">
            My Reservations
          </h1>
          <p className="text-slate-600 text-base sm:text-lg">
            View and manage your bookings
          </p>
        </div>

        {/* Upcoming Bookings */}
        <div className="mb-12">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800 mb-4 sm:mb-6">
            Upcoming ({upcomingBookings.length})
          </h2>
          
          {upcomingBookings.length === 0 ? (
            <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
              <CardContent className="p-8 sm:p-12 text-center">
                <Calendar className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 text-slate-300" />
                <p className="text-slate-600 text-base sm:text-lg">No upcoming reservations</p>
                <p className="text-slate-500 mt-2 text-sm">Book a simulator to get started!</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:gap-6">
              <AnimatePresence>
                {upcomingBookings.map((booking) => (
                  <motion.div
                    key={booking.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                  >
                    <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-shadow">
                      <CardHeader className="px-4 py-4 sm:p-6 pb-3">
                        <div className="flex items-start justify-between gap-3">
                          <CardTitle className="text-lg sm:text-xl text-slate-800 leading-tight">
                            {getBayDisplayName(booking.simulator_name)}
                          </CardTitle>
                          <div className="flex flex-col gap-2 items-end flex-shrink-0">
                            <Badge className="bg-emerald-100 text-emerald-800 text-xs">
                              Confirmed
                            </Badge>
                            {booking.payment_status && (
                              <Badge variant="outline" className={`${getPaymentStatusColor(booking.payment_status)} text-xs`}>
                                {booking.payment_status.charAt(0).toUpperCase() + booking.payment_status.slice(1)}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3 px-4 pb-4 sm:p-6">
                        <div className="flex items-center gap-3 text-slate-600 text-sm sm:text-base">
                          <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-[#2d5567] flex-shrink-0" />
                          <span className="font-medium">
                            {format(new Date(booking.booking_date), "EEE, MMM d, yyyy")}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-slate-600 text-sm sm:text-base">
                          <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-[#2d5567] flex-shrink-0" />
                          <span>
                            {formatTime(booking.start_time)} - {formatTime(booking.end_time)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-slate-600 text-sm sm:text-base">
                          <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-[#2d5567] flex-shrink-0" />
                          <span>{durationText(booking.duration_hours)}</span>
                        </div>
                        <div className="flex items-center gap-3 text-slate-600 text-sm sm:text-base">
                          <Users className="w-4 h-4 sm:w-5 sm:h-5 text-[#2d5567] flex-shrink-0" />
                          <span>
                            {(booking.number_of_players || 1)}{" "}
                            player{(booking.number_of_players || 1) !== 1 ? 's' : ''}
                          </span>
                        </div>
                        {booking.payment_method && (
                          <div className="flex items-center gap-3 text-slate-600 text-sm">
                            <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-[#2d5567] flex-shrink-0" />
                            <span>{getPaymentMethodLabel(booking.payment_method)}</span>
                          </div>
                        )}
                        {booking.card_last_four && (
                          <div className="flex items-center gap-3 text-slate-600 text-sm p-3 bg-slate-50 rounded-lg">
                            <CreditCard className="w-4 h-4 text-[#2d5567] mt-0.5 flex-shrink-0" />
                            <span>Card ending in ****{booking.card_last_four}</span>
                          </div>
                        )}
                        {booking.notes && (
                          <div className="flex items-start gap-3 text-slate-600 text-sm p-3 bg-slate-50 rounded-lg">
                            <MessageSquare className="w-4 h-4 text-[#2d5567] mt-0.5 flex-shrink-0" />
                            <span className="break-words">{booking.notes}</span>
                          </div>
                        )}
                        
                        {/* Add-ons Display */}
                        {booking.add_ons && booking.add_ons.length > 0 && (
                          <div className="p-3 bg-slate-50 rounded-lg">
                            <p className="text-sm font-semibold mb-2">Food & Beverage:</p>
                            {booking.add_ons.map((addon, idx) => (
                              <div key={idx} className="text-sm text-slate-600 flex justify-between">
                                <span>{addon.item} × {addon.quantity}</span>
                                <span>${addon.price.toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-3 flex-wrap">
                          <div>
                            <span className="text-2xl font-bold text-[#2d5567]">
                              ${booking.total_cost}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDownloadReceipt(booking)}
                              className="text-slate-600 hover:bg-slate-100"
                            >
                              <FileText className="w-4 h-4 sm:mr-2" />
                              <span className="hidden sm:inline">Receipt</span>
                            </Button>
                            {canReschedule(booking) && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleRescheduleClick(booking)}
                                className="text-[#2d5567] hover:bg-[#2d5567]/10"
                              >
                                Reschedule
                              </Button>
                            )}
                            {canCancel(booking) && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleCancelClick(booking)}
                                disabled={cancellingId === booking.id}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50 active:scale-95 transition-transform flex-shrink-0"
                              >
                                {cancellingId === booking.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <>
                                    <Trash2 className="w-4 h-4 sm:mr-2" />
                                    <span className="hidden sm:inline">Cancel</span>
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Past Bookings */}
        {pastBookings.length > 0 && (
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-800 mb-4 sm:mb-6">
              Past & Cancelled ({pastBookings.length})
            </h2>
            <div className="grid gap-4 sm:gap-6">
              {pastBookings.map((booking) => (
                <Card key={booking.id} className="bg-slate-50 border-0 opacity-70">
                  <CardHeader className="px-4 py-4 sm:p-6 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="text-base sm:text-xl text-slate-700">
                        {getBayDisplayName(booking.simulator_name)}
                      </CardTitle>
                      <div className="flex flex-col gap-2 items-end flex-shrink-0">
                        <Badge variant="outline" className={`${
                          booking.status === "cancelled" 
                            ? "bg-red-50 text-red-700 border-red-200"
                            : "bg-slate-100 text-slate-700"
                        } text-xs`}>
                          {booking.status}
                        </Badge>
                        {booking.payment_status && (
                          <Badge variant="outline" className={`${getPaymentStatusColor(booking.payment_status)} text-xs`}>
                            {booking.payment_status.charAt(0).toUpperCase() + booking.payment_status.slice(1)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-slate-600 px-4 pb-4 sm:p-6">
                    <div className="flex items-center gap-3 text-sm">
                      <Calendar className="w-4 h-4 flex-shrink-0" />
                      <span>
                        {format(new Date(booking.booking_date), "MMM d, yyyy")}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Clock className="w-4 h-4 flex-shrink-0" />
                      <span>
                        {formatTime(booking.start_time)} - {formatTime(booking.end_time)}
                      </span>
                    </div>
                    {booking.payment_method && (
                      <div className="flex items-center gap-3 text-sm">
                        <CreditCard className="w-4 h-4 flex-shrink-0" />
                        <span>{getPaymentMethodLabel(booking.payment_method)}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Cancel Confirmation Dialog */}
        <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
          <AlertDialogContent className="mx-4 max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg sm:text-xl">Cancel Reservation?</AlertDialogTitle>
              <AlertDialogDescription className="text-base">
                Are you sure you want to cancel this booking? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col sm:flex-row gap-2">
              <AlertDialogCancel className="w-full sm:w-auto">Keep Booking</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleCancelConfirm}
                className="w-full sm:w-auto bg-red-600 hover:bg-red-700"
              >
                Yes, Cancel
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Reschedule Dialog */}
        <Dialog open={showReschedule} onOpenChange={setShowReschedule}>
          <DialogContent className="mx-4 max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg sm:text-xl">Reschedule Booking</DialogTitle>
              <DialogDescription className="text-base">
                To reschedule your booking, please call us at (555) 123-4567 or make a new booking and we'll cancel this one.
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-3 mt-4">
              <Button
                variant="outline"
                onClick={() => setShowReschedule(false)}
                className="flex-1"
              >
                Close
              </Button>
              <Button
                onClick={() => {
                  setShowReschedule(false);
                  window.location.href = createPageUrl("BookSimulator");
                }}
                className="flex-1 bg-[#2d5567] hover:bg-[#1e3a47]"
              >
                Make New Booking
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
