import { createEntity } from '@/lib/dataEntity';

// A customer's booked lesson (scheduled at checkout or later from their bank).
// RLS scopes reads to the owner (by uid/email); admins see all. Customer-facing
// writes happen server-side via edge functions, so the client only lists/filters.
export const LessonBooking = createEntity('lesson_bookings');
export default LessonBooking;
