import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditCard, Shield, DollarSign, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function PaymentMethodSelector({ totalCost }) {
  return (
    <Card className="bg-white/90 backdrop-blur-sm shadow-xl border-0">
      <CardHeader className="p-4 sm:p-6 pb-3">
        <CardTitle className="text-lg sm:text-xl text-slate-800 flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <span className="leading-tight">Secure Payment Authorization</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4 sm:p-6 pt-0">
        <Alert className="bg-blue-50 border-blue-200">
          <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 flex-shrink-0" />
          <AlertDescription className="text-blue-800 text-sm sm:text-base font-medium">
            Total: <span className="font-bold text-lg sm:text-xl">${totalCost.toFixed(2)}</span>
          </AlertDescription>
        </Alert>

        <div className="flex items-start space-x-2 sm:space-x-3 p-4 sm:p-5 rounded-xl border-2 border-emerald-500 bg-emerald-50">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard className="w-5 h-5 flex-shrink-0 text-emerald-700" />
              <span className="text-base sm:text-lg font-bold text-emerald-900">Credit Card Authorization</span>
              <Shield className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            </div>
            <p className="text-xs sm:text-sm text-emerald-800 leading-relaxed mb-3">
              You'll be redirected to Stripe's secure checkout to authorize this amount on your credit card.
            </p>
            <Alert className="bg-amber-50 border-amber-200">
              <Info className="h-4 w-4 text-amber-600 flex-shrink-0" />
              <AlertDescription className="text-xs sm:text-sm text-amber-800">
                <strong>Important:</strong> This is an authorization hold, not an immediate charge. 
                Your card will only be charged if you violate our 24-hour cancellation policy or fail to show up for your reservation.
              </AlertDescription>
            </Alert>
          </div>
        </div>

        <div className="text-xs text-slate-500 space-y-1 mt-4">
          <p>• Free cancellation up to 24 hours before your booking</p>
          <p>• Authorization will automatically expire after your booking</p>
          <p>• Secure payment processing by Stripe</p>
        </div>
      </CardContent>
    </Card>
  );
}