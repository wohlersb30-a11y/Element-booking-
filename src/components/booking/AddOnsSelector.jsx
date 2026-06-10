import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Minus, UtensilsCrossed } from "lucide-react";

const MENU_ITEMS = [
  { id: "beer", name: "Beer", price: 6, category: "drinks" },
  { id: "wine", name: "Wine", price: 8, category: "drinks" },
  { id: "soda", name: "Soft Drink", price: 3, category: "drinks" },
  { id: "water", name: "Water", price: 2, category: "drinks" },
  { id: "nachos", name: "Nachos", price: 10, category: "food" },
  { id: "wings", name: "Wings", price: 12, category: "food" },
  { id: "burger", name: "Burger & Fries", price: 14, category: "food" },
  { id: "pizza", name: "Personal Pizza", price: 12, category: "food" },
  { id: "appetizer", name: "Appetizer Platter", price: 18, category: "food" }
];

export default function AddOnsSelector({ selectedAddOns, onChange }) {
  const [quantities, setQuantities] = useState({});

  const handleQuantityChange = (itemId, delta) => {
    const currentQty = quantities[itemId] || 0;
    const newQty = Math.max(0, currentQty + delta);
    
    const newQuantities = { ...quantities, [itemId]: newQty };
    if (newQty === 0) delete newQuantities[itemId];
    setQuantities(newQuantities);

    const addOns = Object.entries(newQuantities).map(([id, qty]) => {
      const item = MENU_ITEMS.find(i => i.id === id);
      return {
        item: item.name,
        quantity: qty,
        price: item.price * qty
      };
    });
    onChange(addOns);
  };

  const totalCost = Object.entries(quantities).reduce((sum, [id, qty]) => {
    const item = MENU_ITEMS.find(i => i.id === id);
    return sum + (item.price * qty);
  }, 0);

  return (
    <Card className="bg-white/90 backdrop-blur-sm shadow-xl border-0">
      <CardHeader className="p-4 sm:p-6 pb-3">
        <CardTitle className="text-lg sm:text-xl text-slate-800 flex items-center gap-2">
          <UtensilsCrossed className="w-5 h-5 text-[#2d5567]" />
          Food & Beverage (Optional)
        </CardTitle>
        <p className="text-sm text-slate-600 mt-1">Pre-order and it'll be ready when you arrive</p>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0">
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold text-sm mb-2 text-slate-700">Drinks</h4>
            <div className="grid gap-2">
              {MENU_ITEMS.filter(i => i.category === "drinks").map(item => (
                <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{item.name}</p>
                    <p className="text-xs text-slate-600">${item.price}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleQuantityChange(item.id, -1)}
                      disabled={!quantities[item.id]}
                    >
                      <Minus className="w-4 h-4" />
                    </Button>
                    <span className="w-8 text-center font-semibold">{quantities[item.id] || 0}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleQuantityChange(item.id, 1)}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-2 text-slate-700">Food</h4>
            <div className="grid gap-2">
              {MENU_ITEMS.filter(i => i.category === "food").map(item => (
                <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{item.name}</p>
                    <p className="text-xs text-slate-600">${item.price}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleQuantityChange(item.id, -1)}
                      disabled={!quantities[item.id]}
                    >
                      <Minus className="w-4 h-4" />
                    </Button>
                    <span className="w-8 text-center font-semibold">{quantities[item.id] || 0}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleQuantityChange(item.id, 1)}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {totalCost > 0 && (
            <div className="flex items-center justify-between p-4 bg-[#2d5567]/10 rounded-lg border-2 border-[#2d5567]/20">
              <span className="font-semibold">Add-ons Total:</span>
              <span className="text-xl font-bold text-[#2d5567]">${totalCost.toFixed(2)}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}