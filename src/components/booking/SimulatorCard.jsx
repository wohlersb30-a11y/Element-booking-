import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";

export default function SimulatorCard({ simulator, onSelect, isSelected }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card 
        className={`cursor-pointer transition-all duration-300 hover:shadow-xl ${
          isSelected 
            ? 'ring-2 ring-emerald-600 shadow-lg bg-emerald-50/50' 
            : 'hover:ring-2 hover:ring-emerald-300 bg-white'
        }`}
        onClick={onSelect}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <CardTitle className="text-xl font-bold text-slate-800">
              {simulator.name}
            </CardTitle>
            {isSelected && (
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            )}
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-slate-600 text-sm mb-4">{simulator.description}</p>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-2xl font-bold text-emerald-700">
                ${simulator.hourly_rate}
              </span>
              <span className="text-slate-500 text-sm ml-1">/hour</span>
            </div>
            <Button 
              variant={isSelected ? "default" : "outline"}
              className={isSelected ? "bg-emerald-600 hover:bg-emerald-700" : ""}
            >
              {isSelected ? "Selected" : "Select"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}