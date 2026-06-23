import { serviceClient } from '../_shared/clients.ts';
import { sendEmail } from '../_shared/email.ts';
import { sendSMS } from '../_shared/sms.ts';
import { json, preflight } from '../_shared/cors.ts';
import { BRAND, locationInfo } from '../_shared/locations.ts';

// Scheduled job (call from pg_cron, see migration 0007). For every active,
// upcoming booking it sends a 24-hour "see you tomorrow" reminder and a 2-hour
// "almost tee time" reminder — once each — over both email and SMS. Idempotent
// via the reminder_24h_sent / reminder_2h_sent flags.

const formatTime = (time24: string) => {
  const [hours, minutes] = String(time24).split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
};

const formatDate = (dateStr: string) =>
  new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  });

// Current wall-clock time at the venue (America/Chicago), as parts.
function chicagoNowMs(): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(new Date())) p[part.type] = part.value;
  const hour = p.hour === '24' ? 0 : Number(p.hour);
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), hour, Number(p.minute));
}

function minutesUntil(booking_date: string, start_time: string, nowMs: number): number {
  const [by, bmo, bd] = booking_date.split('-').map(Number);
  const [bh, bm] = start_time.split(':').map(Number);
  const startMs = Date.UTC(by, bmo - 1, bd, bh, bm);
  return Math.round((startMs - nowMs) / 60000);
}

function reminderEmail(kind: '24h' | '2h', b: any) {
  const loc = locationInfo(b.location);
  const when = kind === '24h'
    ? `tomorrow, ${formatDate(b.booking_date)}`
    : `today at ${formatTime(b.start_time)}`;
  const heading = kind === '24h' ? "See You Tomorrow! \u26F3" : "Almost Tee Time! \u26F3";
  const opener = kind === '24h'
    ? `Just a friendly nudge — your bay is reserved for ${when} and the simulators are getting warmed up.`
    : `Game time is nearly here! Your bay is ready ${when}. Time to grab your clubs (and maybe a snack).`;
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#334155;max-width:600px;margin:0 auto;padding:20px;">
  <div style="text-align:center;padding:28px;background:linear-gradient(135deg,#2d5567,#1e3a47);color:#fff;border-radius:10px 10px 0 0;">
    <h1 style="margin:0;font-size:26px;">${heading}</h1>
    <p style="margin:8px 0 0;">${BRAND.name}</p>
  </div>
  <div style="background:#fff;padding:28px;border:1px solid #e2e8f0;border-top:none;">
    <p>Hi ${b.customer_name},</p>
    <p>${opener}</p>
    <div style="background:#f8fafc;padding:18px;border-radius:8px;margin:18px 0;">
      <p style="margin:6px 0;"><strong>Bay:</strong> ${b.simulator_name}</p>
      <p style="margin:6px 0;"><strong>When:</strong> ${formatDate(b.booking_date)} at ${formatTime(b.start_time)} \u2013 ${formatTime(b.end_time)}</p>
      <p style="margin:6px 0;"><strong>Where:</strong> ${loc.label}${loc.address ? ` \u2014 ${loc.address}` : ''}</p>
    </div>
    <p>\u23F0 Do yourself a favor and arrive <strong>10 minutes early</strong> to check in and settle in.</p>
    <p>Need to change or cancel? Give us a ring at <strong>${BRAND.phone}</strong>.</p>
    <p style="margin-top:24px;">See you soon \u2014 game on!<br/><strong>The ${BRAND.name} Team</strong></p>
  </div>
  <div style="text-align:center;padding:18px;color:#64748b;font-size:13px;">
    ${BRAND.name} \u2022 ${BRAND.phone} \u2022 ${BRAND.website}
  </div>
</body></html>`;
}

function reminderSMS(kind: '24h' | '2h', b: any) {
  const loc = locationInfo(b.location);
  if (kind === '24h') {
    return `\u26F3 ${BRAND.name}: See you tomorrow! ${b.simulator_name} on ${formatDate(b.booking_date)} at ${formatTime(b.start_time)}, ${loc.label}. Arrive 10 min early & bring your A-game. Changes? Call ${BRAND.phone}.`;
  }
  return `\u26F3 ${BRAND.name}: Almost tee time! ${b.simulator_name} today at ${formatTime(b.start_time)}, ${loc.label}. Arrive 10 min early. Need to change? Call ${BRAND.phone}. Let's go!`;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  // Simple shared-secret guard so only the scheduler can trigger this.
  const expected = Deno.env.get('CRON_SECRET');
  if (expected) {
    const url = new URL(req.url);
    const provided = req.headers.get('x-cron-secret') || url.searchParams.get('secret');
    if (provided !== expected) {
      return json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  try {
    const db = serviceClient();
    const nowMs = chicagoNowMs();

    // Pull a small window of candidate bookings (yesterday..tomorrow) that still
    // need at least one reminder.
    const dayMs = 24 * 60 * 60 * 1000;
    const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const { data: bookings, error } = await db
      .from('bookings')
      .select('*')
      .neq('status', 'cancelled')
      .gte('booking_date', iso(nowMs - dayMs))
      .lte('booking_date', iso(nowMs + dayMs));
    if (error) throw error;

    let sent24 = 0;
    let sent2 = 0;

    for (const b of bookings || []) {
      const mins = minutesUntil(b.booking_date, b.start_time, nowMs);

      // 24h reminder: fire once when 23\u201324h out (skips same-day bookings).
      if (!b.reminder_24h_sent && mins <= 1440 && mins >= 1320) {
        if (b.customer_email) {
          await sendEmail({
            from_name: BRAND.name,
            to: b.customer_email,
            subject: `See you tomorrow! \u26F3 ${b.simulator_name} at ${formatTime(b.start_time)}`,
            body: reminderEmail('24h', b)
          }).catch((e) => console.error('24h email failed:', e.message));
        }
        if (b.customer_phone) {
          await sendSMS({ to: b.customer_phone, body: reminderSMS('24h', b) })
            .catch((e) => console.error('24h sms failed:', e.message));
        }
        await db.from('bookings').update({ reminder_24h_sent: true }).eq('id', b.id);
        sent24++;
      }

      // 2h reminder: fire once when within 2h of start (down to start time).
      if (!b.reminder_2h_sent && mins <= 120 && mins >= 0) {
        if (b.customer_email) {
          await sendEmail({
            from_name: BRAND.name,
            to: b.customer_email,
            subject: `Almost tee time! \u26F3 ${b.simulator_name} at ${formatTime(b.start_time)}`,
            body: reminderEmail('2h', b)
          }).catch((e) => console.error('2h email failed:', e.message));
        }
        if (b.customer_phone) {
          await sendSMS({ to: b.customer_phone, body: reminderSMS('2h', b) })
            .catch((e) => console.error('2h sms failed:', e.message));
        }
        await db.from('bookings').update({ reminder_2h_sent: true }).eq('id', b.id);
        sent2++;
      }
    }

    return json({ success: true, reminders24hSent: sent24, reminders2hSent: sent2 });
  } catch (error) {
    console.error('send-reminders error:', error.message);
    return json({ success: false, error: error.message }, { status: 500 });
  }
});
