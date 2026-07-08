// Minnesota sales tax configuration (frontend copy).
//
// This file is MIRRORED by supabase/functions/_shared/tax.ts. Keep the two in
// sync — the server copy is the source of truth used to build the Stripe
// authorization holds; this copy is only used to DISPLAY the tax breakdown so
// the customer sees the same numbers before they confirm.
//
// IMPORTANT (owner action): 0.06875 is the Minnesota STATE general sales-tax
// rate (6.875%). Your actual combined rate may be higher once county / city /
// transit local option taxes are added (e.g. some metro-area jurisdictions).
// Confirm the correct combined rate for each location's address with your
// accountant or the MN Department of Revenue and update SALES_TAX_RATES below.
export const SALES_TAX_RATES = {
  vadnais_heights: 0.06875,
  burnsville: 0.06875
};

export const DEFAULT_SALES_TAX_RATE = 0.06875;

export function salesTaxRate(location) {
  return SALES_TAX_RATES[location] ?? DEFAULT_SALES_TAX_RATE;
}

// Compute sales tax for a subtotal at a given location. Rounds to whole cents
// so the displayed and charged amounts match exactly.
export function computeTax(subtotal, location) {
  const rate = salesTaxRate(location);
  const sub = Math.round((Number(subtotal) || 0) * 100) / 100;
  const tax = Math.round(sub * rate * 100) / 100;
  const total = Math.round((sub + tax) * 100) / 100;
  return { rate, subtotal: sub, tax, total };
}
