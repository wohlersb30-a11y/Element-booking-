import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { sendBookingConfirmation } from "@/components/booking/BookingConfirmationEmail";
import { sendBookingConfirmationSMS } from "@/components/booking/BookingConfirmationSMS";

export default function PaymentSuccess() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("processing");
  const [message, setMessage] = useState("");

  const addDebug = (msg) => {
    console.log(msg);
  };

  useEffect(() => {
    verifyPayment();
  }, []);

  const verifyPayment = async () => {
    try {
      addDebug("Starting payment verification...");
      
      const urlParams = new URLSearchParams(window.location.search);
      const sessionId = urlParams.get('session_id');
      addDebug(`Session ID from URL: ${sessionId}`);

      if (!sessionId) {
        addDebug("ERROR: No session ID found in URL");
        setStatus("error");
        setMessage("No session ID found. Please contact support with order details.");
        return;
      }

      addDebug("Calling verifyStripePayment function...");
      const result = await base44.functions.invoke('verifyStripePayment', {
        sessionId: sessionId
      });

      addDebug(`Function response: ${JSON.stringify(result.data)}`);

      if (result.data && result.data.success) {
        addDebug(`SUCCESS! Created ${result.data.bookings?.length || 0} bookings`);
        setStatus("success");
        setMessage("Your booking has been confirmed!");

        // Send a confirmation email + SMS for each booked bay. Best-effort:
        // never block the success UI on message delivery.
        const bookings = result.data.bookings || [];
        await Promise.all(
          bookings.flatMap((b) => [
            sendBookingConfirmation(b).catch((err) =>
              console.error("Confirmation email failed:", err)
            ),
            sendBookingConfirmationSMS(b).catch((err) =>
              console.error("Confirmation SMS failed:", err)
            )
          ])
        );

        setTimeout(() => {
          navigate(createPageUrl("MyReservations"));
        }, 3000);
      } else {
        addDebug(`ERROR: ${result.data?.error || 'Unknown error'}`);
        setStatus("error");
        setMessage(result.data?.error || "Payment verification failed. Please contact support.");
      }
    } catch (error) {
      addDebug(`EXCEPTION: ${error.message}`);
      console.error("Verification error:", error);
      setStatus("error");
      setMessage("An error occurred: " + error.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100">
      <Card className="max-w-2xl w-full">
        <CardContent className="p-8">
          <div className="text-center mb-6">
            {status === "processing" && (
              <>
                <Loader2 className="w-16 h-16 animate-spin text-[#2d5567] mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Processing Payment...</h2>
                <p className="text-slate-600">Please wait while we confirm your reservation.</p>
              </>
            )}

            {status === "success" && (
              <>
                <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Booking Confirmed!</h2>
                <p className="text-slate-600 mb-6">{message}</p>
                <p className="text-sm text-slate-500">Redirecting to your reservations...</p>
              </>
            )}

            {status === "error" && (
              <>
                <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Something Went Wrong</h2>
                <p className="text-slate-600 mb-6">{message}</p>
                <div className="flex gap-3 justify-center">
                  <Button
                    onClick={() => navigate(createPageUrl("BookSimulator"))}
                    className="bg-[#2d5567] hover:bg-[#1e3a47]"
                  >
                    Book Again
                  </Button>
                  <Button
                    onClick={() => navigate(createPageUrl("MyReservations"))}
                    variant="outline"
                  >
                    View Reservations
                  </Button>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}