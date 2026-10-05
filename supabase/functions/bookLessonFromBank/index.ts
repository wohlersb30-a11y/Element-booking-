import { getUser, serviceClient } from '../_shared/clients.ts';
import { json, preflight } from '../_shared/cors.ts';
import { addMinutesToTime, DEFAULT_LESSON_MINUTES, isLessonTimeOpen } from '../_shared/lessons.ts';
import { sendEmail } from '../_shared/email.ts';

const LOCATION_LABEL: Record<string, string> = {
  vadnais_heights: 'Vadnais Heights',
  burnsville: 'Burnsville'
};

// Books a lesson by spending ONE credit from the customer's location-scoped
// lesson bank (no payment). Verifies the customer has a positive balance at the
// location, that the chosen time is an open 60-minute start (per Brandon's
// weekly windows), then creates the lesson_booking and writes a -1 debit. The
// no-overlap exclusion constraint is the final authority against double-booking
// Brandon's time. The booking is created WITHOUT a bay — the admin assigns one
// afterward from the Lesson Schedule, which blocks that bay for the public.
Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const user = await getUser(req);
    if (!user) return json({ error: 'Please sign in.' }, { status: 401 });

    const body = await req.json();
    const { location, lessonDate, startTime, customerName, customerPhone } = body || {};
    if (!location || !lessonDate || !startTime) {
      return json({ error: 'No lesson time selected.' }, { status: 400 });
    }
    if (location !== 'vadnais_heights' && location !== 'burnsville') {
      return json({ error: 'Unknown location.' }, { status: 400 });
    }

    const email = (user.email || '').toLowerCase();
    const db = serviceClient();

    // Balance at THIS location must be at least one credit.
    const { data: ledger } = await db
      .from('lesson_credit_transactions')
      .select('delta')
      .eq('user_email', email)
      .eq('location', location);
    const balance = (ledger || []).reduce((sum: number, r: any) => sum + (Number(r.delta) || 0), 0);
    if (balance < 1) {
      return json({ error: 'You have no lesson credits at this location.' }, { status: 400 });
    }

    // The time must still be an open 60-minute start.
    const open = await isLessonTimeOpen(db, location, lessonDate, startTime);
    if (!open) {
      return json({ error: 'That lesson time is no longer available. Please pick another.' }, { status: 409 });
    }

    const endTime = addMinutesToTime(startTime, DEFAULT_LESSON_MINUTES);

    // Create the booking (the no-overlap exclusion constraint is the real guard).
    const { data: booking, error: bErr } = await db
      .from('lesson_bookings')
      .insert({
        customer_id: user.id,
        customer_name: customerName || user.user_metadata?.full_name || '',
        customer_email: email,
        customer_phone: customerPhone || '',
        location,
        lesson_date: lessonDate,
        start_time: startTime,
        end_time: endTime,
        duration_minutes: DEFAULT_LESSON_MINUTES,
        booking_source: 'bank',
        amount_paid: 0,
        status: 'confirmed'
      })
      .select()
      .single();
    if (bErr) {
      // 23P01 = exclusion violation (overlap), 23505 = unique violation: taken.
      if ((bErr as any).code === '23P01' || (bErr as any).code === '23505') {
        return json({ error: 'That lesson time was just booked. Please pick another.' }, { status: 409 });
      }
      throw bErr;
    }

    // Debit one credit.
    const { error: debitErr } = await db.from('lesson_credit_transactions').insert({
      user_email: email,
      user_id: user.id,
      location,
      delta: -1,
      reason: 'booking',
      lesson_booking_id: booking.id,
      created_by: 'system',
      note: `Booked lesson ${lessonDate} ${startTime} from bank`
    });
    if (debitErr) {
      // Roll the booking back so we never take a lesson without debiting a credit.
      await db.from('lesson_bookings').delete().eq('id', booking.id);
      throw debitErr;
    }

    // Best-effort: ask the owner to assign a bay (so it's blocked for public
    // booking). Never let an email hiccup fail the booking.
    try {
      const to = Deno.env.get('OWNER_NOTIFY_EMAIL') ?? 'bradley@elementindoorgolf.com';
      if (to) {
        const loc = LOCATION_LABEL[location] || location;
        await sendEmail({
          from_name: 'Element Bookings',
          to,
          subject: `Lesson booked (from bank) — ${customerName || 'guest'} · ${loc} · ${lessonDate}`,
          body: `
            <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;">
              <h2 style="color:#2d5567;margin:0 0 4px;">Lesson booked from bank</h2>
              <p style="color:#64748b;margin:0 0 16px;">${loc}</p>
              <table style="border-collapse:collapse;font-size:14px;">
                <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Customer</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${customerName || email}</td></tr>
                <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Phone</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${customerPhone || '—'}</td></tr>
                <tr><td style="padding:4px 12px 4px 0;color:#64748b;">When</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${lessonDate} · ${startTime}–${endTime}</td></tr>
              </table>
              <p style="margin:16px 0 0;color:#0f172a;font-weight:600;">Assign a bay in the Lesson Schedule to block it from public booking.</p>
            </div>`
        });
      }
    } catch (mailErr) {
      console.error('bookLessonFromBank owner alert threw:', (mailErr as any).message);
    }

    return json({ success: true, booking });
  } catch (error) {
    console.error('bookLessonFromBank error:', (error as any).message);
    return json({ error: (error as any).message || 'Booking failed.' }, { status: 500 });
  }
});
