import { getUser } from '../_shared/clients.ts';
import { sendSMS } from '../_shared/sms.ts';
import { json, preflight } from '../_shared/cors.ts';

// Generic transactional-SMS endpoint used by the frontend (booking
// confirmations). Requires an authenticated user to prevent abuse.
Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const user = await getUser(req);
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const { to, body } = await req.json();
    if (!to || !body) {
      return json({ error: 'Missing to or body' }, { status: 400 });
    }

    const result = await sendSMS({ to, body });
    if (result.error) return json({ success: false, error: result.error }, { status: 502 });

    return json({ success: true, sid: result.sid ?? null, skipped: result.skipped ?? false });
  } catch (error) {
    console.error('send-sms error:', error.message);
    return json({ success: false, error: error.message }, { status: 500 });
  }
});
