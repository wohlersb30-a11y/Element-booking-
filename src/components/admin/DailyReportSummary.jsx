import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, Calendar, TrendingUp, Clock, XCircle, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DailyReportSummary({ bookings, date }) {
  const totalRevenue = bookings.reduce((sum, b) => sum + (b.total_cost || 0), 0);
  const totalPlayers = bookings.reduce((sum, b) => sum + (b.number_of_players || 1), 0);
  const checkedIn = bookings.filter(b => b.check_in_status === "checked_in").length;
  const noShows = bookings.filter(b => b.check_in_status === "no_show").length;
  const addOnsRevenue = bookings.reduce((sum, b) => {
    if (!b.add_ons || !Array.isArray(b.add_ons)) return sum;
    return sum + b.add_ons.reduce((aSum, addon) => aSum + (addon.price || 0), 0);
  }, 0);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-4 print:space-y-2">
      <div className="flex items-center justify-between print:hidden">
        <h3 className="text-lg font-bold">Daily Summary</h3>
        <Button onClick={handlePrint} variant="outline" size="sm">
          <Printer className="w-4 h-4 mr-2" />
          Print Report
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:gap-2">
        <Card>
          <CardContent className="p-3 print:p-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-600">Revenue</p>
                <p className="text-lg sm:text-xl font-bold text-[#2d5567] print:text-base">${totalRevenue.toFixed(2)}</p>
              </div>
              <DollarSign className="w-6 h-6 text-[#2d5567] print:w-4 print:h-4" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 print:p-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-600">Bookings</p>
                <p className="text-lg sm:text-xl font-bold text-[#2d5567] print:text-base">{bookings.length}</p>
              </div>
              <Calendar className="w-6 h-6 text-[#2d5567] print:w-4 print:h-4" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 print:p-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-600">Checked In</p>
                <p className="text-lg sm:text-xl font-bold text-green-600 print:text-base">{checkedIn}</p>
              </div>
              <Clock className="w-6 h-6 text-green-600 print:w-4 print:h-4" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 print:p-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-600">No Shows</p>
                <p className="text-lg sm:text-xl font-bold text-red-600 print:text-base">{noShows}</p>
              </div>
              <XCircle className="w-6 h-6 text-red-600 print:w-4 print:h-4" />
            </div>
          </CardContent>
        </Card>
      </div>

      {addOnsRevenue > 0 && (
        <Card>
          <CardContent className="p-3 print:p-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Food & Beverage Revenue</p>
                <p className="text-2xl font-bold text-[#2d5567] print:text-lg">${addOnsRevenue.toFixed(2)}</p>
              </div>
              <TrendingUp className="w-6 h-6 text-[#2d5567] print:w-4 print:h-4" />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}