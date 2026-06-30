import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { createPageUrl } from "@/utils";
import { sendBookingConfirmation } from "@/components/booking/BookingConfirmationEmail";
import { sendBookingConfirmationSMS } from "@/components/booking/BookingConfirmationSMS";

const LOGO_URL =
  "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68dc695d7506a437cb8f84c0/0ff61e822_Element_Final_Logos_RGB-01.jpg";

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
      <Card className="max-w-2xl w-full overflow-hidden border-0 shadow-2xl rounded-2xl">
        {status === "success" ? (
          <>
            <div className="bg-gradient-to-r from-[#2d5567] to-[#1e3a47] px-8 py-10 text-center">
              <img
                src={LOGO_URL}
                alt="Element Indoor Golf"
                className="h-14 mx-auto mb-5 bg-white rounded-xl p-2"
              />
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 14 }}
                className="w-20 h-20 rounded-full bg-white/15 flex items-center justify-center mx-auto mb-4"
              >
                <CheckCircle2 className="w-12 h-12 text-white" />
              </motion.div>
              <h2 className="text-3xl font-black text-white heading-font mb-1">You're Booked! 🏌️</h2>
              <p className="text-blue-50">Your bay is officially reserved.</p>
            </div>
            <CardContent className="p-8 text-center">
              <p className="text-slate-600 mb-6">
                A confirmation email is on its way with everything you need to know. See you on the tee!
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  onClick={() => navigate(createPageUrl("MyReservations"))}
                  className="h-12 px-6 text-base font-bold bg-gradient-to-r from-[#2d5567] to-[#1e3a47] hover:from-[#1e3a47] hover:to-[#0f1f29] rounded-xl"
                >
                  View My Reservations
                </Button>
                <Button
                  onClick={() => navigate(createPageUrl("BookSimulator"))}
                  variant="outline"
                  className="h-12 px-6 text-base font-bold rounded-xl border-2"
                >
                  Book Another
                </Button>
              </div>
            </CardContent>
          </>
        ) : (
          <CardContent className="p-8">
            <div className="text-center mb-6">
              {status === "processing" && (
                <>
                  <Loader2 className="w-16 h-16 animate-spin text-[#2d5567] mx-auto mb-4" />
                  <h2 className="text-2xl font-bold text-slate-800 mb-2">Confirming your reservation…</h2>
                  <p className="text-slate-600">Hang tight — this only takes a moment.</p>
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
        )}
      </Card>
    </div>
  );
}