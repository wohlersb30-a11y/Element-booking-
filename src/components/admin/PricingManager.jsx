import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X, Loader2, DollarSign, Plus, Trash2, Calendar } from "lucide-react";
import { format } from "date-fns";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const getBayDisplayName = (originalName) => {
  const nameMap = {
    "East 1": "Bay 1",
    "East 2": "Bay 2",
    "West 1": "Bay 3",
    "West 2": "Bay 4",
    "West 3": "Bay 5",
    "South 1": "Bay 6",
    "South 2": "Bay 7",
    "North 1": "Bay 8",
    "North 2": "Bay 9",
    "Bay 1": "Bay 1",
    "Bay 2": "Bay 2",
    "Bay 3": "Bay 3",
    "Bay 4": "Bay 4",
    "Bay 5": "Bay 5",
    "Bay 6": "Bay 6",
    "Bay 7": "Bay 7",
    "Bay 8": "Bay 8",
    "Bay 9": "Bay 9",
    "Bay 10": "Bay 10",
    "VIP 1": "VIP 1",
    "VIP 2": "VIP 2"
  };
  return nameMap[originalName] || originalName;
};

export default function PricingManager({ simulators, onClose, onComplete }) {
  const [pricing, setPricing] = useState({
    standard_off_peak: 50,
    standard_peak: 60,
    vip_off_peak: 65,
    vip_peak: 85
  });
  const [dateRanges, setDateRanges] = useState([]);
  const [newRange, setNewRange] = useState({
    start_date: null,
    end_date: null,
    standard_off_peak: 50,
    standard_peak: 60,
    vip_off_peak: 65,
    vip_peak: 85,
    label: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddDateRange = () => {
    if (!newRange.start_date || !newRange.end_date) {
      alert("Please select start and end dates");
      return;
    }
    
    setDateRanges([...dateRanges, { ...newRange }]);
    setNewRange({
      start_date: null,
      end_date: null,
      standard_off_peak: 50,
      standard_peak: 60,
      vip_off_peak: 65,
      vip_peak: 85,
      label: ""
    });
  };

  const handleRemoveDateRange = (index) => {
    setDateRanges(dateRanges.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Update each simulator with new pricing data
      const updates = simulators.map(sim => {
        const isVIP = sim.bay_type === "vip";
        
        // Create pricing rules for this bay type
        const pricingRules = dateRanges.map(range => ({
          start_date: format(range.start_date, "yyyy-MM-dd"),
          end_date: format(range.end_date, "yyyy-MM-dd"),
          off_peak_rate: isVIP ? range.vip_off_peak : range.standard_off_peak,
          peak_rate: isVIP ? range.vip_peak : range.standard_peak,
          label: range.label
        }));

        return base44.entities.Simulator.update(sim.id, {
          pricing_off_peak: isVIP ? pricing.vip_off_peak : pricing.standard_off_peak,
          pricing_peak: isVIP ? pricing.vip_peak : pricing.standard_peak,
          pricing_rules: pricingRules
        });
      });

      await Promise.all(updates);
      onComplete();
    } catch (error) {
      console.error("Error updating pricing:", error);
      alert("Error updating pricing. Please try again.");
    }
    setIsSubmitting(false);
  };

  const sortedSimulators = [...simulators].sort((a, b) => {
    const aIsVIP = a.bay_type === "vip";
    const bIsVIP = b.bay_type === "vip";
    if (aIsVIP && !bIsVIP) return 1;
    if (!aIsVIP && bIsVIP) return -1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="p-6 max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Pricing Management</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Default Pricing */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Default Pricing</CardTitle>
            <p className="text-sm text-slate-500">Used when no date-specific pricing applies</p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Regular Bays */}
              <div className="space-y-4">
                <h3 className="font-semibold text-slate-700">Regular Bays</h3>
                <div className="space-y-2">
                  <Label htmlFor="standard-off-peak">Off-Peak Rate ($/hr)</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input
                      id="standard-off-peak"
                      type="number"
                      min="0"
                      step="1"
                      value={pricing.standard_off_peak}
                      onChange={(e) => setPricing({...pricing, standard_off_peak: parseFloat(e.target.value)})}
                      className="pl-10 h-12"
                    />
                  </div>
                  <p className="text-xs text-slate-500">Monday-Thursday & Friday before 3pm</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="standard-peak">Peak Rate ($/hr)</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input
                      id="standard-peak"
                      type="number"
                      min="0"
                      step="1"
                      value={pricing.standard_peak}
                      onChange={(e) => setPricing({...pricing, standard_peak: parseFloat(e.target.value)})}
                      className="pl-10 h-12"
                    />
                  </div>
                  <p className="text-xs text-slate-500">Friday after 3pm & Weekends</p>
                </div>
              </div>

              {/* VIP Bays */}
              <div className="space-y-4">
                <h3 className="font-semibold text-slate-700">VIP Bays</h3>
                <div className="space-y-2">
                  <Label htmlFor="vip-off-peak">Off-Peak Rate ($/hr)</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input
                      id="vip-off-peak"
                      type="number"
                      min="0"
                      step="1"
                      value={pricing.vip_off_peak}
                      onChange={(e) => setPricing({...pricing, vip_off_peak: parseFloat(e.target.value)})}
                      className="pl-10 h-12"
                    />
                  </div>
                  <p className="text-xs text-slate-500">Monday-Thursday & Friday before 3pm</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vip-peak">Peak Rate ($/hr)</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input
                      id="vip-peak"
                      type="number"
                      min="0"
                      step="1"
                      value={pricing.vip_peak}
                      onChange={(e) => setPricing({...pricing, vip_peak: parseFloat(e.target.value)})}
                      className="pl-10 h-12"
                    />
                  </div>
                  <p className="text-xs text-slate-500">Friday after 3pm & Weekends</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Date Range Pricing */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Date-Specific Pricing
            </CardTitle>
            <p className="text-sm text-slate-500">Override default pricing for specific date ranges (holidays, events, etc.)</p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Existing Date Ranges */}
            {dateRanges.length > 0 && (
              <div className="space-y-3">
                {dateRanges.map((range, index) => (
                  <Card key={index} className="bg-slate-50">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Calendar className="w-4 h-4 text-[#2d5567]" />
                            <span className="font-semibold text-slate-800">
                              {range.label || "Custom Pricing"}
                            </span>
                          </div>
                          <p className="text-sm text-slate-600 mb-3">
                            {format(range.start_date, "MMM d, yyyy")} - {format(range.end_date, "MMM d, yyyy")}
                          </p>
                          <div className="grid grid-cols-2 gap-4 text-xs">
                            <div>
                              <p className="font-medium text-slate-700">Regular Bays</p>
                              <p className="text-slate-600">Off-Peak: ${range.standard_off_peak}/hr</p>
                              <p className="text-slate-600">Peak: ${range.standard_peak}/hr</p>
                            </div>
                            <div>
                              <p className="font-medium text-slate-700">VIP Bays</p>
                              <p className="text-slate-600">Off-Peak: ${range.vip_off_peak}/hr</p>
                              <p className="text-slate-600">Peak: ${range.vip_peak}/hr</p>
                            </div>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveDateRange(index)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Add New Date Range */}
            <Card className="border-2 border-dashed border-slate-300">
              <CardContent className="p-4 space-y-4">
                <div className="space-y-2">
                  <Label>Label (Optional)</Label>
                  <Input
                    placeholder="e.g. Holiday Pricing, Spring Break"
                    value={newRange.label}
                    onChange={(e) => setNewRange({...newRange, label: e.target.value})}
                    className="h-10"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left">
                          <Calendar className="w-4 h-4 mr-2" />
                          {newRange.start_date ? format(newRange.start_date, "MMM d, yyyy") : "Select date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <CalendarComponent
                          mode="single"
                          selected={newRange.start_date}
                          onSelect={(date) => setNewRange({...newRange, start_date: date})}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left">
                          <Calendar className="w-4 h-4 mr-2" />
                          {newRange.end_date ? format(newRange.end_date, "MMM d, yyyy") : "Select date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <CalendarComponent
                          mode="single"
                          selected={newRange.end_date}
                          onSelect={(date) => setNewRange({...newRange, end_date: date})}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <h4 className="font-semibold text-sm text-slate-700">Regular Bays</h4>
                    <div className="space-y-2">
                      <Label className="text-xs">Off-Peak ($/hr)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={newRange.standard_off_peak}
                        onChange={(e) => setNewRange({...newRange, standard_off_peak: parseFloat(e.target.value)})}
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Peak ($/hr)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={newRange.standard_peak}
                        onChange={(e) => setNewRange({...newRange, standard_peak: parseFloat(e.target.value)})}
                        className="h-10"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-semibold text-sm text-slate-700">VIP Bays</h4>
                    <div className="space-y-2">
                      <Label className="text-xs">Off-Peak ($/hr)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={newRange.vip_off_peak}
                        onChange={(e) => setNewRange({...newRange, vip_off_peak: parseFloat(e.target.value)})}
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Peak ($/hr)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={newRange.vip_peak}
                        onChange={(e) => setNewRange({...newRange, vip_peak: parseFloat(e.target.value)})}
                        className="h-10"
                      />
                    </div>
                  </div>
                </div>

                <Button
                  type="button"
                  onClick={handleAddDateRange}
                  variant="outline"
                  className="w-full"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Date Range
                </Button>
              </CardContent>
            </Card>
          </CardContent>
        </Card>

        {/* Current Bays */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Current Bays</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {sortedSimulators.map(bay => (
                <div key={bay.id} className="p-3 bg-slate-50 rounded-lg">
                  <p className="font-semibold text-sm">{getBayDisplayName(bay.name)}</p>
                  <p className="text-xs text-slate-600">{bay.bay_type === "vip" ? "VIP" : "Regular"}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="flex-1 h-12"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 h-12 bg-[#2d5567] hover:bg-[#1e3a47]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save All Pricing"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}