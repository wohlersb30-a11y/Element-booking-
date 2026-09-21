import { createEntity } from '@/lib/dataEntity';

// Date-range pricing overrides. In Base44 these lived as a `pricing_rules`
// array on each simulator; the Supabase migration moved them into their own
// `pricing_rules` table (columns: simulator_id, name, start_date, end_date,
// peak_rate, off_peak_rate).
export const PricingRule = createEntity('pricing_rules');
export default PricingRule;
