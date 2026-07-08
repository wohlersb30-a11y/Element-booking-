import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Crown, Star, Award, Gem, Building2, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { MEMBERSHIP_PLANS, PLAN_ORDER } from "@/config/membershipPlans";

const TIER_STYLE = {
  junior: { icon: Award, color: "from-emerald-500 to-emerald-700" },
  silver: { icon: Star, color: "from-slate-400 to-slate-600" },
  platinum: { icon: Crown, color: "from-purple-500 to-indigo-600" },
  diamond: { icon: Gem, color: "from-cyan-400 to-blue-600" },
  corporate: { icon: Building2, color: "from-slate-700 to-slate-900" }
};

const MEMBERSHIP_TIERS = PLAN_ORDER.map((id) => {
  const plan = MEMBERSHIP_PLANS[id];
  const period = plan.hoursPeriod === "week" ? "week" : "month";
  return {
    id,
    name: plan.name,
    icon: TIER_STYLE[id].icon,
    color: TIER_STYLE[id].color,
    price: plan.price,
    priceUnit: plan.priceUnit,
    popular: !!plan.recommended,
    features: [`${plan.hours} hours / ${period} included (Oct–Apr)`, ...plan.perks]
  };
});

export default function MemberSignup() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [existingMembership, setExistingMembership] = useState(null);
  const [selectedTier, setSelectedTier] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    setIsLoading(true);
    try {
      const user = await base44.auth.me();
      setCurrentUser(user);

      // Check if user already has a membership
      const memberships = await base44.entities.Membership.filter({ user_email: user.email });
      const activeMembership = memberships.find(m => m.status === 'active');
      
      if (activeMembership) {
        setExistingMembership(activeMembership);
      }
    } catch (error) {
      console.error("Error loading user data:", error);
    }
    setIsLoading(false);
  };

  const handleSignup = async () => {
    if (!selectedTier || !selectedLocation) {
      alert("Please select a membership tier and location");
      return;
    }

    setIsSubmitting(true);
    try {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setFullYear(endDate.getFullYear() + 1); // 1 year membership

      await base44.entities.Membership.create({
        user_email: currentUser.email,
        user_name: currentUser.full_name,
        membership_level: selectedTier,
        location: selectedLocation,
        status: "active",
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        payment_status: "paid"
      });

      alert("Membership created successfully! You can now book member sessions.");
      navigate(createPageUrl("MemberBookings"));
    } catch (error) {
      console.error("Error creating membership:", error);
      alert("Error creating membership. Please try again.");
    }
    setIsSubmitting(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-[#2d5567]" />
      </div>
    );
  }

  if (existingMembership) {
    return (
      <div className="min-h-screen p-6 bg-gradient-to-br from-slate-50 via-purple-50/30 to-slate-100">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Active Membership</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-6 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border-2 border-green-200">
                <div className="flex items-center gap-3 mb-4">
                  <Check className="w-8 h-8 text-green-600" />
                  <div>
                    <h3 className="text-2xl font-bold text-slate-800 capitalize">{existingMembership.membership_level} Member</h3>
                    <p className="text-slate-600">Status: Active</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <p><span className="font-semibold">Location:</span> {existingMembership.location === 'vadnais_heights' ? 'Vadnais Heights' : 'Burnsville'}</p>
                  <p><span className="font-semibold">Valid Until:</span> {new Date(existingMembership.end_date).toLocaleDateString()}</p>
                </div>
              </div>
              <Button
                onClick={() => navigate(createPageUrl("MemberBookings"))}
                className="w-full h-12 bg-[#2d5567] hover:bg-[#1e3a47]"
              >
                Go to Member Bookings
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 bg-gradient-to-br from-slate-50 via-purple-50/30 to-slate-100">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-black text-slate-800 mb-4 heading-font">
            Become a <span className="bg-gradient-to-r from-purple-600 to-indigo-600 text-transparent bg-clip-text">Member</span>
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Unlimited summer play · included sim-time hours Oct–April · guest passes & member rates
          </p>
        </div>

        <div className="mb-8 max-w-md mx-auto">
          <Label className="text-base font-semibold mb-2 block">Select Your Home Location</Label>
          <Select value={selectedLocation} onValueChange={setSelectedLocation}>
            <SelectTrigger className="h-12">
              <SelectValue placeholder="Choose location" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vadnais_heights">Vadnais Heights</SelectItem>
              <SelectItem value="burnsville">Burnsville</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
          {MEMBERSHIP_TIERS.map((tier) => {
            const Icon = tier.icon;
            const isSelected = selectedTier === tier.id;

            return (
              <Card
                key={tier.id}
                className={`relative cursor-pointer transition-all duration-300 ${
                  isSelected
                    ? 'ring-4 ring-[#2d5567] shadow-2xl scale-105'
                    : 'hover:shadow-xl hover:scale-102'
                } ${tier.popular ? 'border-4 border-purple-400' : ''}`}
                onClick={() => setSelectedTier(tier.id)}
              >
                {tier.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <Badge className="bg-purple-600 text-white px-4 py-1">Most Popular</Badge>
                  </div>
                )}
                <CardHeader className={`bg-gradient-to-r ${tier.color} text-white p-6`}>
                  <Icon className="w-12 h-12 mb-3" />
                  <CardTitle className="text-2xl font-bold">{tier.name}</CardTitle>
                  <div className="mt-4">
                    <span className="text-4xl font-black">${tier.price.toLocaleString()}</span>
                    <span className="text-sm opacity-90">/{tier.priceUnit}</span>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <ul className="space-y-3">
                    {tier.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm">
                        <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span className="text-slate-700">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {selectedTier && selectedLocation && (
          <div className="mt-12 max-w-md mx-auto">
            <Button
              onClick={handleSignup}
              disabled={isSubmitting}
              className="w-full h-14 text-lg font-bold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                `Sign Up for ${MEMBERSHIP_TIERS.find(t => t.id === selectedTier)?.name} - $${MEMBERSHIP_TIERS.find(t => t.id === selectedTier)?.price.toLocaleString()}/${MEMBERSHIP_TIERS.find(t => t.id === selectedTier)?.priceUnit}`
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}