import { createEntity } from '@/lib/dataEntity';

// Availability slots for lessons with the teaching pro, set by admins per
// location. RLS: any authenticated user may read; only admins write.
export const LessonSlot = createEntity('lesson_slots');
export default LessonSlot;
