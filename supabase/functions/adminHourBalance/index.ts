import { getUserWithRole, serviceClient } from '../_shared/clients.ts';
import { json, preflight } from '../_shared/cors.ts';

// Admin-only management of customer banked hours. Actions:
//   'lookup'  { email }                                  -> ledger + balance for a customer
//   'adjust'  { email, kind, hours, location, note }     -> credit(+)/debit(-) hours
//   'import'  { entries: [{email, location, peak, off_peak}], note } -> bulk credit
// All writes go through the service role and are stamped with the admin's email,
// so there is a clear audit trail. Import is idempotent-ish: it credits the
// DIFFERENCE only for emails not already imported with the same batch note.
Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const user = await getUserWithRole(req);
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return json({ error: 'Admin only.' }, { status: 403 });

    const db = serviceClient();
    const body = await req.json();
    const action = body?.action;

    const balanceFor = async (email: string) => {
      const { data } = await db
        .from('hour_transactions')
        .select('kind,hours,location')
        .eq('user_email', email.toLowerCase());
      const bal: Record<string, { peak: number; off_peak: number }> = {};
      for (const t of data || []) {
        const loc = t.location || 'unknown';
        bal[loc] = bal[loc] || { peak: 0, off_peak: 0 };
        bal[loc][t.kind === 'peak' ? 'peak' : 'off_peak'] += Number(t.hours || 0);
      }
      return bal;
    };

    if (action === 'lookup') {
      const email = String(body.email || '').toLowerCase();
      if (!email) return json({ error: 'Email required.' }, { status: 400 });
      const { data: ledger } = await db
        .from('hour_transactions')
        .select('*')
        .eq('user_email', email)
        .order('created_at', { ascending: false });
      return json({ success: true, email, balance: await balanceFor(email), ledger: ledger || [] });
    }

    if (action === 'adjust') {
      const email = String(body.email || '').toLowerCase();
      const kind = body.kind === 'peak' ? 'peak' : 'off_peak';
      const hours = Number(body.hours);
      const location = body.location || null;
      if (!email || !hours || Number.isNaN(hours)) {
        return json({ error: 'Email, kind, non-zero hours required.' }, { status: 400 });
      }
      const { error } = await db.from('hour_transactions').insert({
        user_email: email,
        kind,
        hours,
        reason: 'adjustment',
        location,
        created_by: user.email,
        note: body.note || `Admin adjustment by ${user.email}`
      });
      if (error) throw error;
      return json({ success: true, balance: await balanceFor(email) });
    }

    if (action === 'import') {
      const entries: any[] = Array.isArray(body.entries) ? body.entries : [];
      const note = body.note || 'Imported from legacy system';
      const rows: any[] = [];
      const skipped: string[] = [];
      for (const e of entries) {
        const email = String(e.email || '').toLowerCase().trim();
        if (!email) continue;
        const location = e.location || null;
        // Skip a customer who already has an import row with this batch note
        // (so re-running the same import doesn't double-credit).
        const { data: prior } = await db
          .from('hour_transactions')
          .select('id')
          .eq('user_email', email)
          .eq('reason', 'import')
          .eq('note', note)
          .limit(1);
        if (prior && prior.length > 0) {
          skipped.push(email);
          continue;
        }
        const peak = Number(e.peak || e.peak_hours || 0);
        const off = Number(e.off_peak || e.off_peak_hours || 0);
        if (peak > 0) rows.push({ user_email: email, kind: 'peak', hours: peak, reason: 'import', location, created_by: user.email, note });
        if (off > 0) rows.push({ user_email: email, kind: 'off_peak', hours: off, reason: 'import', location, created_by: user.email, note });
      }
      if (rows.length > 0) {
        const { error } = await db.from('hour_transactions').insert(rows);
        if (error) throw error;
      }
      return json({ success: true, credited: rows.length, skipped });
    }

    return json({ error: 'Unknown action.' }, { status: 400 });
  } catch (error) {
    console.error('adminHourBalance error:', (error as any).message);
    return json({ error: (error as any).message || 'Failed.' }, { status: 500 });
  }
});
