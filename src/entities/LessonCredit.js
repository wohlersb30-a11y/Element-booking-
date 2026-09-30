import { createEntity } from '@/lib/dataEntity';

// Append-only ledger of lesson-credit purchases (credit) and bookings (debit).
// Current balance = SUM(delta) per location. RLS scopes reads to the owner
// (admins see all); all writes happen server-side via edge functions.
export const LessonCredit = createEntity('lesson_credit_transactions');
export default LessonCredit;
