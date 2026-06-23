// Supabase-backed adapter that preserves the legacy `base44.*` surface the app
// was written against (base44.entities.X, base44.functions.invoke,
// base44.auth.me, base44.integrations.Core.SendEmail). This lets all existing
// call sites keep working without edits during the migration off Base44.
import { supabase } from '@/lib/supabaseClient';
import { Booking } from '@/entities/Booking';
import { Simulator } from '@/entities/Simulator';
import { Waitlist } from '@/entities/Waitlist';
import { ScheduleBlock } from '@/entities/ScheduleBlock';
import { Membership } from '@/entities/Membership';
import { MemberBooking } from '@/entities/MemberBooking';
import { Special } from '@/entities/Special';
import { User } from '@/entities/User';
import { SendEmail } from '@/integrations/Core';

// Base44's functions.invoke resolved to an axios-style { data } object, and the
// edge functions return JSON bodies (including {success:false,...} on logical
// errors). Normalize Supabase's { data, error } into { data } and surface the
// function's JSON body even on non-2xx responses.
async function invoke(name, payload) {
  const { data, error } = await supabase.functions.invoke(name, { body: payload });
  if (error) {
    let body = null;
    try {
      if (error.context && typeof error.context.json === 'function') {
        body = await error.context.json();
      }
    } catch {
      // ignore parse failures
    }
    return { data: body ?? { success: false, error: error.message } };
  }
  return { data };
}

export const base44 = {
  entities: {
    Booking,
    Simulator,
    Waitlist,
    ScheduleBlock,
    Membership,
    MemberBooking,
    Special,
    User
  },
  functions: { invoke },
  integrations: { Core: { SendEmail } },
  auth: {
    me: () => User.me(),
    logout: async (redirectUrl) => {
      await supabase.auth.signOut();
      if (redirectUrl && typeof window !== 'undefined') {
        window.location.href = redirectUrl;
      }
    },
    redirectToLogin: () => {
      if (typeof window !== 'undefined') window.location.assign('/Login');
    }
  }
};

export default base44;
