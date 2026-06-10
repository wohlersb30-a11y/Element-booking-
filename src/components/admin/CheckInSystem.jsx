import React, { useState } from "react";
import { Booking } from "@/entities/all";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";

export default function CheckInSystem({ booking, onUpdate }) {
  const [isUpdating, setIsUpdating] = useState(false);

  const handleCheckIn = async (status) => {
    // On a no-show, optionally charge the authorization hold per the
    // cancellation/no-show policy.
    if (status === "no_show" && booking.stripe_payment_id && booking.payment_status !== "paid") {
      const charge = window.confirm(
        `Charge the $${Number(booking.total_cost || 0).toFixed(2)} authorization hold for this no-show?\n\nOK = charge the card. Cancel = mark no-show without charging.`
      );
      if (charge) {
        setIsUpdating(true);
        try {
          const result = await base44.functions.invoke("captureStripeHold", {
            bookingId: booking.id
          });
          if (!result.data || !result.data.success) {
            alert(result.data?.error || "Could not charge the hold. Marking no-show without charge.");
          }
        } catch (error) {
          console.error("Error capturing hold:", error);
          alert("Could not charge the hold. Marking no-show without charge.");
        }
        setIsUpdating(false);
      }
    }

    setIsUpdating(true);
    try {
      const updateData = {
        check_in_status: status,
        checked_in_at: status === "checked_in" ? new Date().toISOString() : null
      };

      if (status === "no_show") {
        updateData.status = "no_show";
      }

      await Booking.update(booking.id, updateData);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Error updating check-in status:", error);
      alert("Error updating check-in status");
    }
    setIsUpdating(false);
  };

  const getStatusBadge = () => {
    switch (booking.check_in_status) {
      case "checked_in":
        return <Badge className="bg-green-500"><CheckCircle2 className="w-4 h-4 mr-1" />Checked In</Badge>;
      case "no_show":
        return <Badge className="bg-red-500"><XCircle className="w-4 h-4 mr-1" />No Show</Badge>;
      default:
        return <Badge variant="outline"><Clock className="w-4 h-4 mr-1" />Not Arrived</Badge>;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="font-medium">Status:</span>
        {getStatusBadge()}
      </div>

      {booking.checked_in_at && (
        <p className="text-sm text-slate-600">
          Checked in at {new Date(booking.checked_in_at).toLocaleTimeString()}
        </p>
      )}

      {booking.check_in_status !== "checked_in" && (
        <div className="flex gap-2">
          <Button
            onClick={() => handleCheckIn("checked_in")}
            disabled={isUpdating}
            className="flex-1 bg-green-600 hover:bg-green-700"
          >
            {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            Check In
          </Button>
          {booking.check_in_status !== "no_show" && (
            <Button
              onClick={() => handleCheckIn("no_show")}
              disabled={isUpdating}
              variant="destructive"
              className="flex-1"
            >
              {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
              No Show
            </Button>
          )}
        </div>
      )}
    </div>
  );
}