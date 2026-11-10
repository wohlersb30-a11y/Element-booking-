import { getUserWithRole, serviceClient } from '../_shared/clients.ts';
import { json, preflight } from '../_shared/cors.ts';
import { sendEmail } from '../_shared/email.ts';

// Admin tool: email customers who hold prepaid "banked" hours to let them know
// their balance is loaded into the new booking system and how to redeem it.
//
// Two trigger paths (same pattern as inviteMembers):
//   1. An admin (profiles.role = 'admin') calling with their JWT.
//   2. A server call carrying `x-notify-secret: <NOTIFY_SECRET>` — used for the
//      owner's test send. Deployed with --no-verify-jwt so this path works.
//
// Body: { testEmail?, testName?, testPeak?, testOffPeak?, sendAll?, dryRun? }
//   testEmail -> send only to that address (review before the blast). Uses
//                testPeak/testOffPeak (or sample 4/6) for the balance shown.
//   sendAll   -> every customer with a positive banked-hours balance, each
//                emailed their OWN current peak / off-peak totals.
//   dryRun    -> return the recipient list (with balances) without sending.

const APP_URL = Deno.env.get('APP_URL') ?? 'https://book.elementindoorgolf.com';
const LOGO_URL =
  'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68dc695d7506a437cb8f84c0/0ff61e822_Element_Final_Logos_RGB-01.jpg';
const SUPPORT_PHONE = '651-330-1699';

type Recipient = { email: string; name: string | null; peak: number; off_peak: number };

function firstName(name: string | null): string {
  if (!name) return 'there';
  const f = String(name).trim().split(/\s+/)[0];
  return f || 'there';
}

function bankedHoursEmailHtml(r: Recipient): string {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;">
    <div style="text-align:center;padding:8px 0 16px;">
      <img src="${LOGO_URL}" alt="Element Indoor Golf" style="height:64px;width:auto;" />
    </div>
    <p style="font-size:15px;">Hi ${firstName(r.name)},</p>
    <p style="font-size:15px;line-height:1.55;">
      Good news &mdash; your prepaid hours are now loaded into our new booking
      system and ready to use.
    </p>

    <div style="background:#ecfdf5;border:2px solid #16a34a;border-radius:10px;padding:16px;margin:20px 0;">
      <p style="font-size:14px;font-weight:bold;color:#166534;margin:0 0 6px;">Your current balance</p>
      <p style="font-size:15px;margin:0;">
        <strong>${r.peak}</strong> peak hour(s)<br/>
        <strong>${r.off_peak}</strong> off-peak hour(s)
      </p>
    </div>

    <p style="font-size:15px;line-height:1.55;margin:0 0 6px;"><strong>A few things to know:</strong></p>
    <ul style="font-size:15px;line-height:1.6;padding-left:20px;margin-top:0;">
      <li><strong>Use them at either club</strong> &mdash; Vadnais Heights or Burnsville. Your hours are a single shared balance.</li>
      <li><strong>Peak vs. off-peak:</strong> Peak hours can be redeemed anytime. Off-peak hours apply to off-peak times (peak is Friday noon through Sunday close). The system handles this automatically when you book.</li>
      <li><strong>Hours never expire.</strong></li>
      <li><strong>No credit card needed.</strong> When you book with banked hours, there's nothing to pay and no card required &mdash; your time is simply deducted from your balance.</li>
    </ul>

    <p style="font-size:15px;line-height:1.55;margin:18px 0 6px;"><strong>How to redeem your hours online:</strong></p>
    <ol style="font-size:15px;line-height:1.6;padding-left:20px;margin-top:0;">
      <li>Go to <a href="${APP_URL}" style="color:#2d5567;">book.elementindoorgolf.com</a> and sign in (or create your account with this email address).</li>
      <li>Pick your club, date, time, and bay.</li>
      <li>At checkout, choose <strong>&ldquo;Redeem banked hours&rdquo;</strong> as your payment method.</li>
      <li>Confirm &mdash; your reservation is booked and the hours come straight out of your balance. No card, no charge.</li>
    </ol>

    <p style="font-size:15px;line-height:1.55;">
      <strong>Prefer to call?</strong> Just give us a ring at ${SUPPORT_PHONE} and we'll book it
      for you over the phone and deduct the hours for you.
    </p>
    <p style="font-size:15px;line-height:1.55;">
      We'd love to see you back on the simulators. Come swing with us soon!
    </p>
    <p style="font-size:15px;margin-top:20px;">
      <strong>Element Indoor Golf</strong>
    </p>
  </div>`;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    // ---- Authorize: admin JWT OR the server secret header ----
    const secret = Deno.env.get('NOTIFY_SECRET');
    const providedSecret = req.headers.get('x-notify-secret');
    const secretOk = !!secret && providedSecret === secret;

    if (!secretOk) {
      const caller = await getUserWithRole(req);
      if (!caller || caller.role !== 'admin') {
        return json({ error: 'Admin access required.' }, { status: 403 });
      }
    }

    const body = await req.json().catch(() => ({}));
    const testEmail: string | undefined = body?.testEmail?.trim?.().toLowerCase();
    const sendAll: boolean = !!body?.sendAll;
    const dryRun: boolean = !!body?.dryRun;

    if (!testEmail && !sendAll) {
      return json({ error: 'Pass testEmail or sendAll.' }, { status: 400 });
    }

    const db = serviceClient();

    // Build the recipient list with each person's current balance.
    let recipients: Recipient[] = [];

    if (testEmail) {
      recipients = [{
        email: testEmail,
        name: body?.testName ?? null,
        peak: Number(body?.testPeak ?? 4),
        off_peak: Number(body?.testOffPeak ?? 6)
      }];
    } else {
      // Sum the ledger per customer; keep only those with a positive balance.
      const { data: ledger, error } = await db
        .from('hour_transactions')
        .select('user_email, kind, hours');
      if (error) return json({ error: error.message }, { status: 500 });

      const bal: Record<string, { peak: number; off_peak: number }> = {};
      for (const t of ledger || []) {
        const e = (t.user_email || '').trim().toLowerCase();
        if (!e) continue;
        bal[e] = bal[e] || { peak: 0, off_peak: 0 };
        bal[e][t.kind === 'peak' ? 'peak' : 'off_peak'] += Number(t.hours || 0);
      }

      const emails = Object.keys(bal).filter(
        (e) => (bal[e].peak + bal[e].off_peak) > 0
      );

      // Pull names from the customer directory where we have them.
      const names: Record<string, string | null> = {};
      if (emails.length) {
        const { data: custs } = await db
          .from('customers')
          .select('email, full_name')
          .in('email', emails);
        for (const c of custs || []) {
          const e = (c.email || '').trim().toLowerCase();
          if (e) names[e] = c.full_name || null;
        }
      }

      recipients = emails.map((e) => ({
        email: e,
        name: names[e] ?? null,
        peak: Math.round(bal[e].peak * 100) / 100,
        off_peak: Math.round(bal[e].off_peak * 100) / 100
      }));
    }

    if (dryRun) {
      return json({ dryRun: true, count: recipients.length, recipients });
    }

    const sent: string[] = [];
    const failed: { email: string; error: string }[] = [];

    for (const r of recipients) {
      try {
        const result = await sendEmail({
          from_name: 'Element Indoor Golf',
          to: r.email,
          subject: 'Your banked golf hours are ready at Element Indoor Golf ⛳',
          body: bankedHoursEmailHtml(r)
        });
        if (result.error) failed.push({ email: r.email, error: result.error });
        else sent.push(r.email);
      } catch (err) {
        failed.push({ email: r.email, error: (err as any)?.message || 'send failed' });
      }
    }

    return json({
      success: true,
      requested: recipients.length,
      sent: sent.length,
      failed,
      sentTo: sent
    });
  } catch (error) {
    console.error('notifyBankedHours error:', (error as any)?.message);
    return json({ error: (error as any)?.message || 'Notify failed.' }, { status: 500 });
  }
});
