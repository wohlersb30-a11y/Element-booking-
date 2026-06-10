// Sends transactional email via Resend. Same call shape the app used for
// Base44's Core.SendEmail: { from_name, to, subject, body (HTML) }.
export async function sendEmail(opts: {
  from_name?: string;
  to: string;
  subject: string;
  body: string;
}): Promise<{ id?: string; skipped?: boolean; error?: string }> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  // RESEND_FROM should be a verified sender address, e.g. bookings@yourdomain.com
  const fromAddress = Deno.env.get('RESEND_FROM') ?? 'onboarding@resend.dev';

  if (!apiKey) {
    console.error('RESEND_API_KEY not set — skipping email to', opts.to);
    return { skipped: true };
  }

  const from = opts.from_name ? `${opts.from_name} <${fromAddress}>` : fromAddress;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject: opts.subject,
      html: opts.body
    })
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('Resend error:', res.status, text);
    return { error: `Resend ${res.status}: ${text}` };
  }

  const data = await res.json();
  return { id: data.id };
}
