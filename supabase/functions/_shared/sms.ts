// Sends an SMS via Twilio's REST API. Mirrors the shape of _shared/email.ts:
// best-effort, never throws on a missing config (just skips), so a booking flow
// is never blocked by texting being unconfigured.
//
// Requires these Supabase secrets:
//   TWILIO_ACCOUNT_SID   (starts with "AC...")
//   TWILIO_AUTH_TOKEN
//   TWILIO_FROM_NUMBER   (E.164, e.g. +16513301699 — the Twilio number you own)
export async function sendSMS(opts: {
  to: string;
  body: string;
}): Promise<{ sid?: string; skipped?: boolean; error?: string }> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const fromNumber = Deno.env.get('TWILIO_FROM_NUMBER');

  if (!accountSid || !authToken || !fromNumber) {
    console.error('Twilio not configured — skipping SMS to', opts.to);
    return { skipped: true };
  }

  const to = normalizeUSNumber(opts.to);
  if (!to) {
    console.error('Invalid phone number — skipping SMS:', opts.to);
    return { skipped: true };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const form = new URLSearchParams({ To: to, From: fromNumber, Body: opts.body });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form.toString()
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('Twilio error:', res.status, text);
    return { error: `Twilio ${res.status}: ${text}` };
  }

  const data = await res.json();
  return { sid: data.sid };
}

// Best-effort normalization of US numbers to E.164. Accepts "(651) 330-1699",
// "651-330-1699", "6513301699", "+1651...". Returns null if it can't.
function normalizeUSNumber(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.startsWith('+')) return trimmed.replace(/[^\d+]/g, '');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}
