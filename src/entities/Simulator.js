import { createEntity } from '@/lib/dataEntity';
import { supabase } from '@/lib/supabaseClient';

// Base data-access object for the `simulators` table.
const base = createEntity('simulators');

// In Base44, each simulator carried a nested `pricing_rules` array (date-range
// price overrides). The Supabase migration split those into a separate
// `pricing_rules` table, but the app's rate-calculation code still reads
// `simulator.pricing_rules`. To keep every read site working unchanged, we
// hydrate that array back onto each simulator on read.
//
// Rule-loading failures are non-fatal: we log and fall back to an empty array
// so a pricing_rules hiccup can never take down the booking/admin pages (they
// simply revert to default peak/off-peak rates).
async function loadRulesFor(ids) {
  const map = {};
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (unique.length === 0) return map;
  try {
    const { data, error } = await supabase
      .from('pricing_rules')
      .select('*')
      .in('simulator_id', unique);
    if (error) throw error;
    for (const rule of data || []) {
      (map[rule.simulator_id] = map[rule.simulator_id] || []).push(rule);
    }
  } catch (err) {
    console.warn('Simulator: failed to load pricing_rules, using defaults:', err?.message || err);
  }
  return map;
}

async function hydrateMany(sims) {
  const list = sims || [];
  const rulesById = await loadRulesFor(list.map((s) => s.id));
  return list.map((s) => ({ ...s, pricing_rules: rulesById[s.id] || [] }));
}

export const Simulator = {
  ...base,
  async list(orderBy) {
    return hydrateMany(await base.list(orderBy));
  },
  async filter(criteria, orderBy) {
    return hydrateMany(await base.filter(criteria, orderBy));
  },
  async get(id) {
    const sim = await base.get(id);
    const rulesById = await loadRulesFor([id]);
    return { ...sim, pricing_rules: rulesById[id] || [] };
  }
};

export default Simulator;
