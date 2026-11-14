import { createEntity } from '@/lib/dataEntity';

// Time-off blocks set by the lesson pro (Brandon) per location. A block covers
// either a one-off calendar date (block_date) OR a recurring weekday (weekday),
// and either the whole day (all_day) or a time range (start_time/end_time 'HH:MM').
// Any lesson start overlapping an active block is removed from availability by
// the open_lesson_times RPC. RLS: any authenticated user may read; only the
// lesson scheduler (admin or lesson_pro) may write.
export const LessonBlock = createEntity('lesson_blocks');
export default LessonBlock;
