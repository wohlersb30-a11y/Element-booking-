import { createEntity } from '@/lib/dataEntity';

// Full tee-sheet closures. Admins toggle a location closed (with a reason);
// customers can read the active closure so the booking page shows a friendly
// closed message. Write access is admin-only (enforced by RLS).
export const TeeSheetClosure = createEntity('tee_sheet_closures');
