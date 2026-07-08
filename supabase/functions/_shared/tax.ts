// Minnesota sales tax configuration (server / source of truth).
//
// This file is MIRRORED by src/config/tax.js. Keep the two in sync — this copy
// is used to build the Stripe authorization holds (adds a visible tax line
// item); the frontend copy only displays the same breakdown before confirming.
//
// IMPORTANT (owner action): 0.06875 is the Minnesota STATE general sales-tax
// rate (6.875%). The combined rate may be higher once county / city / transit
// local option taxes are added. Confirm the correct combined rate for each
// location's address with an accountant or the MN Department of Revenue and
// update SALES_TAX_RATES below.
export const SALES_TAX_RATES: Record<string, number> = {
  vadnais_heights: 0.06875,
  burnsville: 0.06875,
};

export const DEFAULT_SALES_TAX_RATE = 0.06875;

export function salesTaxRate(location?: string): number {
  if (location && location in SALES_TAX_RATES) return SALES_TAX_RATES[location];
  return DEFAULT_SALES_TAX_RATE;
}

export interface TaxBreakdown {
  rate: number;
  subtotal: number;
  tax: number;
  total: number;
}

// Compute sales tax for a subtotal at a given location. Rounds to whole cents
// so the displayed and charged amounts match exactly.
export function computeTax(subtotal: number, location?: string): TaxBreakdown {
  const rate = salesTaxRate(location);
  const sub = Math.round((Number(subtotal) || 0) * 100) / 100;
  const tax = Math.round(sub * rate * 100) / 100;
  const total = Math.round((sub + tax) * 100) / 100;
  return { rate, subtotal: sub, tax, total };
}
