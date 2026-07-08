import { createEntity } from '@/lib/dataEntity';

// Append-only ledger of banked-hours credits (purchases/imports) and debits
// (bookings). RLS scopes reads to the owner (admins see all); all writes happen
// server-side via edge functions, so the client only ever lists/filters.
export const HourTransaction = createEntity('hour_transactions');
export default HourTransaction;
