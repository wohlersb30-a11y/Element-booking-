import React from "react";
import { useNavigate } from "react-router-dom";
import { MapPin } from "lucide-react";

// Admin-only schedule switcher. Renders inside the admin dashboards (which are
// gated by <AdminRoute>), letting a signed-in admin jump between the two
// location schedules. `current` is "vadnais_heights" | "burnsville".
const LOCATIONS = [
  { id: "vadnais_heights", label: "Vadnais Heights", path: "/AdminDashboardVadnaisHeights" },
  { id: "burnsville", label: "Burnsville", path: "/AdminDashboardBurnsville" }
];

export default function LocationSwitcher({ current }) {
  const navigate = useNavigate();

  return (
    <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
      <MapPin className="w-4 h-4 text-slate-500 ml-2 mr-1" />
      {LOCATIONS.map((loc) => {
        const isActive = loc.id === current;
        return (
          <button
            key={loc.id}
            type="button"
            onClick={() => {
              if (!isActive) navigate(loc.path);
            }}
            aria-pressed={isActive}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              isActive
                ? "bg-[#2d5567] text-white shadow"
                : "text-slate-600 hover:bg-white"
            }`}
          >
            {loc.label}
          </button>
        );
      })}
    </div>
  );
}
