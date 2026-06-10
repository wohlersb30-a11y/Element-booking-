import React, { useState } from "react";
import { Waitlist } from "@/entities/all";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Clock, CheckCircle2, Loader2 } from "lucide-react";

export default function WaitlistForm({ 
  location, 
  date, 
  time, 
  duration, 
  playerCount,
  customerName,
  customerEmail,
  customerPhone,
  onClose 
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await Waitlist.create({
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        location,
        preferred_date: date,
        preferred_time: time,
        duration_hours: duration,
        number_of_players: playerCount,
        status: "active"
      });

      setSubmitted(true);
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (error) {
      console.error("Error joining waitlist:", error);
      alert("Error joining waitlist. Please try again.");
    }
    setIsSubmitting(false);
  };

  if (submitted) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-slate-800 mb-2">You're on the Waitlist!</h2>
            <p className="text-slate-600">We'll notify you if a spot opens up for your preferred time.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-[#2d5567]" />
            Join Waitlist
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="mb-4 bg-blue-50 border-blue-200">
            <AlertDescription className="text-sm">
              No bays available at your preferred time. Join the waitlist and we'll notify you if a spot opens up!
            </AlertDescription>
          </Alert>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Preferred Time</Label>
              <p className="text-sm text-slate-600">{date} at {time} for {duration}hr</p>
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 bg-[#2d5567] hover:bg-[#1e3a47]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Joining...
                  </>
                ) : (
                  "Join Waitlist"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}