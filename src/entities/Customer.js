import { createEntity } from '@/lib/dataEntity';

// Admin-only customer directory (imported legacy contacts). Search/pagination
// in the Customers page queries Supabase directly for ilike + range paging.
export const Customer = createEntity('customers');
