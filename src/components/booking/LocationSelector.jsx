import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, Building2 } from "lucide-react";
import { motion } from "framer-motion";

export default function LocationSelector({ selectedLocation, onChange }) {
  const locations = [
    {
      id: "vadnais_heights",
      name: "Vadnais Heights",
      address: "4255 White Bear Parkway Suite 2100, Vadnais Heights MN 55110",
      bays: 11,
      icon: Building2
    },
    {
      id: "burnsville",
      name: "Burnsville",
      address: "14314 Burnhave Drive, Burnsville MN 55306",
      bays: 12,
      icon: Building2
    }
  ];

  return (
    <Card className="bg-white/90 backdrop-blur-sm shadow-2xl border-0 overflow-hidden">
      <div className="bg-gradient-to-r from-[#2d5567] to-[#1e3a47] p-6">
        <h2 className="text-2xl sm:text-3xl font-black text-white heading-font flex items-center gap-3">
          <MapPin className="w-7 h-7" />
          Choose Your Location
        </h2>
        <p className="text-blue-50 mt-2">Select where you'd like to play</p>
      </div>
      <CardContent className="p-6">
        <div className="grid sm:grid-cols-2 gap-4">
          {locations.map((location, index) => (
            <motion.div
              key={location.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <button
                onClick={() => onChange(location.id)}
                className={`w-full text-left p-6 rounded-2xl border-3 transition-all duration-300 active:scale-95 ${
                  selectedLocation === location.id
                    ? 'border-[#2d5567] bg-gradient-to-br from-blue-50 to-slate-50 shadow-xl'
                    : 'border-slate-200 hover:border-[#2d5567]/50 hover:shadow-lg bg-white'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    selectedLocation === location.id
                      ? 'bg-gradient-to-br from-[#2d5567] to-[#1e3a47]'
                      : 'bg-slate-100'
                  }`}>
                    <location.icon className={`w-7 h-7 ${
                      selectedLocation === location.id ? 'text-white' : 'text-slate-600'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-bold text-slate-800 mb-2 heading-font">
                      {location.name}
                    </h3>
                    <p className="text-sm text-slate-600 mb-3 leading-relaxed">
                      {location.address}
                    </p>
                    <div className="flex items-center gap-2 text-sm">
                      <span className={`px-3 py-1 rounded-full font-semibold ${
                        selectedLocation === location.id
                          ? 'bg-[#2d5567] text-white'
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {location.bays} Bays Available
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            </motion.div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}