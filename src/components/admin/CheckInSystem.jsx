import React, { useState } from "react";
import { Booking } from "@/entities/all";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, Loader2, CreditCard } from "lucide-react";

export default function CheckInSystem({ booking, onUpdate }) {
  const [isUpdating, setIsUpdating] = useState(false);

  // An authorization hold that can still be released (not yet charged/released).
  const hasActiveHold =
    booking.stripe_payment_id && booking.payment_status === "authorized";

  const handleReleaseHold = async () => {
    const ok = window.confirm(
      `Release the $${Number(booking.total_cost || 0).toFixed(
        2
      )} authorization hold on this card?\n\nThe customer is NOT charged and the booking stays on the schedule. Use this once they've arrived/paid so the hold drops off their card right away instead of expiring in up to 7 days.`
    );
    if (!ok) return;

    setIsUpdating(true);
    try {
      const result = await base44.functions.invoke("releaseHold", {
        bookingId: booking.id
      });
      if (result.data && result.data.success) {
        alert("Hold released — the funds will drop off the customer's card.");
        if (onUpdate) onUpdate();
      } else {
        alert(result.data?.error || "Could not release the hold.");
      }
    } catch (error) {
      console.error("Error releasing hold:", error);
      alert("Could not release the hold: " + (error.message || "unknown error"));
    }
    setIsUpdating(false);
  };

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

      {/* Release the authorization hold without cancelling the booking — use
          once the guest has arrived/paid so funds aren't held for up to 7 days. */}
      {hasActiveHold && (
        <Button
          onClick={handleReleaseHold}
          disabled={isUpdating}
          variant="outline"
          className="w-full border-[#2d5567] text-[#2d5567] hover:bg-[#2d5567]/5"
        >
          {isUpdating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CreditCard className="w-4 h-4 mr-2" />
          )}
          Release Hold (no charge)
        </Button>
      )}

      {booking.stripe_payment_id && booking.payment_status === "released" && (
        <p className="text-sm text-emerald-700 flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4" />
          Authorization hold released — no charge.
        </p>
      )}
    </div>
  );
}