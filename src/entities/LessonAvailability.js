import { createEntity } from '@/lib/dataEntity';

// Brandon's recurring weekly availability windows, set by admins per location
// (e.g. Mondays 09:00-16:00). Customers book fixed 60-minute lessons that may
// start every 30 minutes inside a window. RLS: any authenticated user may read;
// only admins write.
export const LessonAvailability = createEntity('lesson_availability');
export default LessonAvailability;
