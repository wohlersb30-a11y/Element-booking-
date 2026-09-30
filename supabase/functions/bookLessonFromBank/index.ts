import { getUser, serviceClient } from '../_shared/clients.ts';
import { json, preflight } from '../_shared/cors.ts';

// Books a lesson by spending ONE credit from the customer's location-scoped
// lesson bank (no payment). Verifies the customer has a positive balance at the
// slot's location, then creates the lesson_booking and writes a -1 debit to the
// ledger. The one-per-slot unique index is the final authority against
// double-booking Brandon's time.
Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const user = await getUser(req);
    if (!user) return json({ error: 'Please sign in.' }, { status: 401 });

    const body = await req.json();
    const { slotId, customerName, customerPhone } = body || {};
    if (!slotId) return json({ error: 'No lesson time selected.' }, { status: 400 });

    const email = (user.email || '').toLowerCase();
    const db = serviceClient();

    // The slot must exist and be open.
    const { data: slot } = await db.from('lesson_slots').select('*').eq('id', slotId).single();
    if (!slot || !slot.is_active) {
      return json({ error: 'That lesson time is no longer available.' }, { status: 409 });
    }

    // Balance at THIS location must be at least one credit.
    const { data: ledger } = await db
      .from('lesson_credit_transactions')
      .select('delta')
      .eq('user_email', email)
      .eq('location', slot.location);
    const balance = (ledger || []).reduce((sum: number, r: any) => sum + (Number(r.delta) || 0), 0);
    if (balance < 1) {
      return json({ error: 'You have no lesson credits at this location.' }, { status: 400 });
    }

    // Slot already taken?
    const { data: taken } = await db
      .from('lesson_bookings')
      .select('id')
      .eq('slot_id', slotId)
      .neq('status', 'cancelled');
    if (taken && taken.length > 0) {
      return json({ error: 'That lesson time was just booked. Please pick another.' }, { status: 409 });
    }

    // Create the booking (the unique index is the real double-booking guard).
    const { data: booking, error: bErr } = await db
      .from('lesson_bookings')
      .insert({
        slot_id: slot.id,
        customer_id: user.id,
        customer_name: customerName || user.user_metadata?.full_name || '',
        customer_email: email,
        customer_phone: customerPhone || '',
        location: slot.location,
        lesson_date: slot.lesson_date,
        start_time: slot.start_time,
        end_time: slot.end_time,
        duration_minutes: slot.duration_minutes,
        booking_source: 'bank',
        amount_paid: 0,
        status: 'confirmed'
      })
      .select()
      .single();
    if (bErr) {
      // 23505 = one-per-slot unique violation: someone booked it first.
      if ((bErr as any).code === '23505') {
        return json({ error: 'That lesson time was just booked. Please pick another.' }, { status: 409 });
      }
      throw bErr;
    }

    // Debit one credit.
    const { error: debitErr } = await db.from('lesson_credit_transactions').insert({
      user_email: email,
      user_id: user.id,
      location: slot.location,
      delta: -1,
      reason: 'booking',
      lesson_booking_id: booking.id,
      created_by: 'system',
      note: `Booked lesson ${slot.lesson_date} ${slot.start_time} from bank`
    });
    if (debitErr) {
      // Roll the booking back so we never take a lesson without debiting a credit.
      await db.from('lesson_bookings').delete().eq('id', booking.id);
      throw debitErr;
    }

    return json({ success: true, booking });
  } catch (error) {
    console.error('bookLessonFromBank error:', (error as any).message);
    return json({ error: (error as any).message || 'Booking failed.' }, { status: 500 });
  }
});
