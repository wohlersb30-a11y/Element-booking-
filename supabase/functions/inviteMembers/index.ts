import { createClient } from 'npm:@supabase/supabase-js@2';
import { getUserWithRole, serviceClient } from '../_shared/clients.ts';
import { json, preflight } from '../_shared/cors.ts';
import { sendEmail } from '../_shared/email.ts';

// Admin tool: email active members an "activate your account" message for the
// new booking system. For each member we create their Supabase account (if it
// doesn't exist) and generate a secure set-password link, then send our own
// branded copy via Resend (generateLink does NOT send Supabase's email).
//
// Two trigger paths:
//   1. An admin (profiles.role = 'admin') calling with their JWT — used by the
//      Admin hub buttons.
//   2. A server call carrying `x-invite-secret: <INVITE_SECRET>` — used for the
//      owner's test send. Deployed with --no-verify-jwt so this path works.
//
// Body: { testEmail?, sendAll?, dryRun? }
//   testEmail -> send only to that one address (review before the blast)
//   sendAll   -> every active member + authorized account holder
//   dryRun    -> return the recipient list without sending or creating accounts

const APP_URL = Deno.env.get('APP_URL') ?? 'https://book.elementindoorgolf.com';
const REDIRECT_TO = `${APP_URL}/ResetPassword`;
const LOGO_URL =
  'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68dc695d7506a437cb8f84c0/0ff61e822_Element_Final_Logos_RGB-01.jpg';
const SUPPORT_PHONE = '651-330-1699';

type Recipient = { email: string; name: string | null };

function firstName(name: string | null): string {
  if (!name) return 'there';
  const f = String(name).trim().split(/\s+/)[0];
  return f || 'there';
}

function activationEmailHtml(name: string | null, actionLink: string): string {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;">
    <div style="text-align:center;padding:8px 0 16px;">
      <img src="${LOGO_URL}" alt="Element Indoor Golf" style="height:64px;width:auto;" />
    </div>
    <p style="font-size:15px;">Hi ${firstName(name)},</p>
    <p style="font-size:15px;line-height:1.55;">
      We've upgraded to a brand-new reservation system to make booking your bay
      faster and easier &mdash; and to give members a dedicated portal for your
      included hours and guest passes.
    </p>
    <p style="font-size:15px;line-height:1.55;">
      <strong>Your membership is already set up.</strong> To start making
      reservations, you just need to set a password for your account:
    </p>
    <div style="text-align:center;margin:28px 0;">
      <a href="${actionLink}"
         style="display:inline-block;background:#2d5567;color:#ffffff;text-decoration:none;
                font-weight:bold;font-size:16px;padding:14px 28px;border-radius:10px;">
        Set My Password
      </a>
    </div>
    <p style="font-size:15px;line-height:1.55;">
      Once your password is set, sign in anytime at
      <a href="${APP_URL}" style="color:#2d5567;">book.elementindoorgolf.com</a> to:
    </p>
    <ul style="font-size:15px;line-height:1.6;padding-left:20px;">
      <li>Book your included member hours at either location</li>
      <li>See your remaining hours and guest passes for the month</li>
      <li>Manage your upcoming reservations</li>
    </ul>
    <p style="font-size:13px;color:#64748b;line-height:1.5;">
      This secure link will expire for your protection &mdash; if it does, just use
      &ldquo;Forgot password?&rdquo; on the sign-in page to get a new one.
    </p>
    <p style="font-size:15px;line-height:1.55;">
      Questions? Reply to this email or call us at ${SUPPORT_PHONE}.
    </p>
    <p style="font-size:15px;margin-top:20px;">
      See you on the course,<br/>
      <strong>The Element Indoor Golf Team</strong>
    </p>
  </div>`;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    // ---- Authorize: admin JWT OR the server secret header ----
    const secret = Deno.env.get('INVITE_SECRET');
    const providedSecret = req.headers.get('x-invite-secret');
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

    // Build the recipient list.
    let recipients: Recipient[] = [];
    if (testEmail) {
      recipients = [{ email: testEmail, name: body?.testName ?? null }];
    } else {
      const { data: memberships, error } = await db
        .from('memberships')
        .select('user_email, user_name, authorized_emails, status')
        .eq('status', 'active');
      if (error) return json({ error: error.message }, { status: 500 });

      const seen = new Set<string>();
      for (const m of memberships || []) {
        const primary = (m.user_email || '').trim().toLowerCase();
        if (primary && !seen.has(primary)) {
          seen.add(primary);
          recipients.push({ email: primary, name: m.user_name || null });
        }
        for (const extra of Array.isArray(m.authorized_emails) ? m.authorized_emails : []) {
          const e = (extra || '').trim().toLowerCase();
          if (e && !seen.has(e)) {
            seen.add(e);
            recipients.push({ email: e, name: null });
          }
        }
      }
    }

    if (dryRun) {
      return json({ dryRun: true, count: recipients.length, recipients });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );

    const sent: string[] = [];
    const failed: { email: string; error: string }[] = [];

    for (const r of recipients) {
      try {
        // Create the account + get a set-password link. New accounts use the
        // invite link; existing accounts get a recovery (set-password) link.
        let actionLink: string | undefined;
        const invite = await admin.auth.admin.generateLink({
          type: 'invite',
          email: r.email,
          options: { redirectTo: REDIRECT_TO }
        });
        if (invite.error) {
          const rec = await admin.auth.admin.generateLink({
            type: 'recovery',
            email: r.email,
            options: { redirectTo: REDIRECT_TO }
          });
          if (rec.error) {
            failed.push({ email: r.email, error: rec.error.message });
            continue;
          }
          actionLink = rec.data.properties?.action_link;
        } else {
          actionLink = invite.data.properties?.action_link;
        }

        if (!actionLink) {
          failed.push({ email: r.email, error: 'No action link generated.' });
          continue;
        }

        const result = await sendEmail({
          from_name: 'Element Indoor Golf',
          to: r.email,
          subject: 'Set your password — Element Indoor Golf has a new booking system',
          body: activationEmailHtml(r.name, actionLink)
        });
        if (result.error) {
          failed.push({ email: r.email, error: result.error });
        } else {
          sent.push(r.email);
        }
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
    console.error('inviteMembers error:', (error as any)?.message);
    return json({ error: (error as any)?.message || 'Invite failed.' }, { status: 500 });
  }
});
