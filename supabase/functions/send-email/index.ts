import { getUser } from '../_shared/clients.ts';
import { sendEmail } from '../_shared/email.ts';
import { json, preflight } from '../_shared/cors.ts';

// Generic transactional-email endpoint used by the frontend's
// @/integrations/Core SendEmail shim (booking confirmations, etc.).
// Requires an authenticated user to prevent open-relay abuse.
Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const user = await getUser(req);
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const { from_name, to, subject, body } = await req.json();
    if (!to || !subject || !body) {
      return json({ error: 'Missing to, subject, or body' }, { status: 400 });
    }

    const result = await sendEmail({ from_name, to, subject, body });
    if (result.error) return json({ success: false, error: result.error }, { status: 502 });

    return json({ success: true, id: result.id ?? null, skipped: result.skipped ?? false });
  } catch (error) {
    console.error('send-email error:', error.message);
    return json({ success: false, error: error.message }, { status: 500 });
  }
});
