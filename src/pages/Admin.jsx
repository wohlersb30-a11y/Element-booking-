import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, MapPin, Clock, Users, ChevronRight } from "lucide-react";

// Central admin landing page. Gives staff one memorable destination (/Admin)
// that links out to every admin tool, instead of hunting through the sidebar.
const TOOLS = [
  {
    title: "Vadnais Heights Dashboard",
    description: "Daily schedule, manual bookings, pricing, specials & analytics.",
    to: createPageUrl("AdminDashboardVadnaisHeights"),
    icon: MapPin,
    accent: "from-[#2d5567] to-[#1e3a47]",
  },
  {
    title: "Burnsville Dashboard",
    description: "Daily schedule, manual bookings, pricing, specials & analytics.",
    to: createPageUrl("AdminDashboardBurnsville"),
    icon: MapPin,
    accent: "from-[#2d5567] to-[#1e3a47]",
  },
  {
    title: "Hours Admin",
    description: "Look up, adjust, and import customers' banked hour balances.",
    to: createPageUrl("AdminHours"),
    icon: Clock,
    accent: "from-teal-600 to-teal-800",
  },
  {
    title: "Customers",
    description: "Search the full customer directory by name, email, or phone.",
    to: createPageUrl("Customers"),
    icon: Users,
    accent: "from-slate-600 to-slate-800",
  },
];

export default function Admin() {
  return (
    <div className="min-h-screen p-4 sm:p-8 bg-gradient-to-br from-slate-50 via-emerald-50/30 to-slate-100">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-[#2d5567] flex items-center justify-center">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-800 heading-font">Admin Home</h1>
            <p className="text-sm text-slate-500">Manage bookings, hours, and customers</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {TOOLS.map((tool) => (
            <Link key={tool.title} to={tool.to} className="group">
              <Card className="border-0 shadow-md hover:shadow-xl transition-all duration-200 rounded-2xl h-full group-hover:-translate-y-0.5">
                <CardContent className="p-6 flex items-start gap-4">
                  <div
                    className={`w-12 h-12 rounded-xl bg-gradient-to-br ${tool.accent} flex items-center justify-center shrink-0`}
                  >
                    <tool.icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="font-bold text-slate-800 heading-font">{tool.title}</h2>
                      <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-[#2d5567] transition-colors shrink-0" />
                    </div>
                    <p className="text-sm text-slate-500 mt-1">{tool.description}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
