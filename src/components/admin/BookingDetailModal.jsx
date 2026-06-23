
import React, { useState } from "react";
import { Booking } from "@/entities/all";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Calendar, Clock, MapPin, Users, Phone, Mail, MessageSquare, CreditCard, DollarSign, Loader2 } from "lucide-react";
import { format } from "date-fns";

import CheckInSystem from "./CheckInSystem";
import { Textarea } from "@/components/ui/textarea";

const formatTime = (time24) => {
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
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

const toMinutes = (t) => {
  if (!t) return 0;
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + (m || 0);
};

const isVIPBay = (bay) => bay?.bay_type === "vip" || /vip/i.test(bay?.name || "");

const bayRank = (bay) => {
  const match = (bay?.name || "").match(/\d+/);
  return { vip: isVIPBay(bay) ? 1 : 0, num: match ? parseInt(match[0], 10) : 9999 };
};

export default function BookingDetailModal({ booking, onClose, simulators = [], existingBookings = [] }) {
  const [paymentStatus, setPaymentStatus] = useState(booking.payment_status || "pending");
  const [staffNotes, setStaffNotes] = useState(booking.staff_notes || "");
  const [newBayId, setNewBayId] = useState(booking.simulator_id || "");
  const [isUpdating, setIsUpdating] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // Bays for the same location, ordered standard-first then VIP. This powers the
  // manual override that lets an admin upgrade a group from a normal bay to VIP
  // (or otherwise reassign), even though the auto-optimizer keeps bay types
  // separate.
  const moveableBays = [...simulators]
    .filter((b) => b.is_active !== false && b.location === booking.location)
    .sort((a, b) => {
      const A = bayRank(a);
      const B = bayRank(b);
      if (A.vip !== B.vip) return A.vip - B.vip;
      return A.num - B.num;
    });

  const selectedNewBay = moveableBays.find((b) => b.id === newBayId);
  const isUpgrade = selectedNewBay && isVIPBay(selectedNewBay) && !isVIPBay({ name: booking.simulator_name });

  const handleMoveBay = async () => {
    if (!selectedNewBay || newBayId === booking.simulator_id) return;

    // Conflict check on the target bay for this date/time (ignore self + cancelled).
    const newStart = toMinutes(booking.start_time);
    const newEnd = toMinutes(booking.end_time);
    const conflict = (existingBookings || []).some((b) => {
      if (b.id === booking.id) return false;
      if (b.simulator_id !== newBayId) return false;
      if (b.booking_date !== booking.booking_date) return false;
      if (b.status === "cancelled") return false;
      return newStart < toMinutes(b.end_time) && newEnd > toMinutes(b.start_time);
    });

    if (conflict) {
      alert(`${getBayDisplayName(selectedNewBay.name)} is already booked for this time. Choose another bay.`);
      return;
    }

    setIsMoving(true);
    try {
      await Booking.update(booking.id, {
        simulator_id: selectedNewBay.id,
        simulator_name: selectedNewBay.name
      });
      alert(`Reservation moved to ${getBayDisplayName(selectedNewBay.name)}.`);
      onClose();
    } catch (error) {
      console.error("Error moving booking:", error);
      alert("Error moving booking to the new bay.");
    }
    setIsMoving(false);
  };

  const handleUpdatePaymentStatus = async () => {
    setIsUpdating(true);
    try {
      await Booking.update(booking.id, { payment_status: paymentStatus });
      alert("Payment status updated successfully");
    } catch (error) {
      console.error("Error updating payment status:", error);
      alert("Error updating payment status");
    }
    setIsUpdating(false);
  };

  const handleUpdateStaffNotes = async () => {
    setIsUpdating(true);
    try {
      await Booking.update(booking.id, { staff_notes: staffNotes });
      alert("Staff notes updated successfully");
    } catch (error) {
      console.error("Error updating staff notes:", error);
      alert("Error updating staff notes");
    }
    setIsUpdating(false);
  };

  const handleCancelBooking = async () => {
    if (!confirm("Are you sure you want to cancel this booking?")) return;
    
    setIsCancelling(true);
    try {
      await Booking.update(booking.id, { status: "cancelled" });
      alert("Booking cancelled successfully");
      onClose(); // Close the modal after successful cancellation
    } catch (error) {
      console.error("Error cancelling booking:", error);
      alert("Error cancelling booking");
    }
    setIsCancelling(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between border-b">
          <CardTitle className="text-2xl">Booking Details</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-6 p-6">
          {/* Check-In System */}
          <div>
            <h3 className="font-semibold text-lg mb-3">Check-In Status</h3>
            <CheckInSystem booking={booking} onUpdate={onClose} />
          </div>

          {/* Bay Info */}
          <div>
            <h3 className="font-semibold text-lg mb-2">Bay Information</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-slate-700">
                <MapPin className="w-5 h-5 text-[#2d5567]" />
                <span className="font-medium">{getBayDisplayName(booking.simulator_name)}</span>
              </div>
              <div className="flex items-center gap-3 text-slate-700">
                <Calendar className="w-5 h-5 text-[#2d5567]" />
                <span>{format(new Date(booking.booking_date), "EEEE, MMMM d, yyyy")}</span>
              </div>
              <div className="flex items-center gap-3 text-slate-700">
                <Clock className="w-5 h-5 text-[#2d5567]" />
                <span>{formatTime(booking.start_time)} - {formatTime(booking.end_time)}</span>
              </div>
              <div className="flex items-center gap-3 text-slate-700">
                <Users className="w-5 h-5 text-[#2d5567]" />
                <span>{booking.number_of_players || 1} player{(booking.number_of_players || 1) !== 1 ? 's' : ''}</span>
              </div>
            </div>

            {/* Manual override: move / upgrade this reservation to another bay. */}
            {moveableBays.length > 0 && booking.status !== "cancelled" && (
              <div className="mt-4 p-3 bg-slate-50 rounded-lg space-y-2">
                <label className="text-sm font-semibold text-slate-700">
                  Move / Upgrade Bay
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={newBayId} onValueChange={setNewBayId}>
                    <SelectTrigger className="w-44">
                      <SelectValue placeholder="Choose a bay" />
                    </SelectTrigger>
                    <SelectContent>
                      {moveableBays.map((bay) => (
                        <SelectItem key={bay.id} value={bay.id}>
                          {getBayDisplayName(bay.name)}{isVIPBay(bay) ? " - VIP" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {newBayId !== booking.simulator_id && (
                    <Button
                      size="sm"
                      onClick={handleMoveBay}
                      disabled={isMoving}
                      className="bg-[#2d5567] hover:bg-[#1e3a47]"
                    >
                      {isMoving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : isUpgrade ? (
                        "Upgrade to VIP"
                      ) : (
                        "Move"
                      )}
                    </Button>
                  )}
                </div>
                {isUpgrade && (
                  <p className="text-xs text-amber-700">
                    Heads up: upgrading to a VIP bay does not change the price already on this booking.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Customer Info */}
          <div>
            <h3 className="font-semibold text-lg mb-2">Customer Information</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-slate-700">
                <Users className="w-5 h-5 text-[#2d5567]" />
                <span>{booking.customer_name}</span>
              </div>
              <div className="flex items-center gap-3 text-slate-700">
                <Mail className="w-5 h-5 text-[#2d5567]" />
                <a href={`mailto:${booking.customer_email}`} className="text-blue-600 hover:underline">
                  {booking.customer_email}
                </a>
              </div>
              {booking.customer_phone && (
                <div className="flex items-center gap-3 text-slate-700">
                  <Phone className="w-5 h-5 text-[#2d5567]" />
                  <a href={`tel:${booking.customer_phone}`} className="text-blue-600 hover:underline">
                    {booking.customer_phone}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Add-ons Display */}
          {booking.add_ons && booking.add_ons.length > 0 && (
            <div>
              <h3 className="font-semibold text-lg mb-2">Food & Beverage Orders</h3>
              <div className="space-y-2 p-4 bg-slate-50 rounded-lg">
                {booking.add_ons.map((addon, idx) => (
                  <div key={idx} className="flex justify-between text-slate-700">
                    <span>{addon.item} × {addon.quantity}</span>
                    <span className="font-semibold">${addon.price.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payment Info */}
          <div>
            <h3 className="font-semibold text-lg mb-3">Payment Information</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-[#2d5567]" />
                  <span className="font-semibold">Total Cost:</span>
                </div>
                <span className="text-xl font-bold text-[#2d5567]">${booking.total_cost}</span>
              </div>

              {booking.card_last_four && (
                <div className="flex items-center gap-3 text-slate-700">
                  <CreditCard className="w-5 h-5 text-[#2d5567]" />
                  <span>Card ending in ****{booking.card_last_four}</span>
                </div>
              )}

              <div className="flex items-center gap-3">
                <label className="text-sm font-medium">Payment Status:</label>
                <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="refunded">Refunded</SelectItem>
                  </SelectContent>
                </Select>
                {paymentStatus !== booking.payment_status && (
                  <Button
                    size="sm"
                    onClick={handleUpdatePaymentStatus}
                    disabled={isUpdating}
                    className="bg-[#2d5567] hover:bg-[#1e3a47]"
                  >
                    {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Update"}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Customer Notes */}
          {booking.notes && (
            <div>
              <h3 className="font-semibold text-lg mb-2">Customer Notes</h3>
              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                <MessageSquare className="w-5 h-5 text-[#2d5567] mt-0.5" />
                <p className="text-slate-700">{booking.notes}</p>
              </div>
            </div>
          )}

          {/* Staff Notes */}
          <div>
            <h3 className="font-semibold text-lg mb-3">Staff Notes (Internal)</h3>
            <div className="space-y-3">
              <Textarea
                value={staffNotes}
                onChange={(e) => setStaffNotes(e.target.value)}
                placeholder="Add internal notes about this booking..."
                rows={3}
                className="text-base"
              />
              {staffNotes !== booking.staff_notes && (
                <Button
                  size="sm"
                  onClick={handleUpdateStaffNotes}
                  disabled={isUpdating}
                  className="bg-[#2d5567] hover:bg-[#1e3a47]"
                >
                  {isUpdating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Saving...
                    </>
                  ) : "Save Notes"}
                </Button>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              Close
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelBooking}
              disabled={isCancelling || booking.status === "cancelled"}
              className="flex-1"
            >
              {isCancelling ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Cancelling...
                </>
              ) : (
                "Cancel Booking"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
