import { getUserWithRole, serviceClient } from '../_shared/clients.ts';
import { json, preflight } from '../_shared/cors.ts';
import { timeToMinutes } from '../_shared/membershipPlans.ts';
import { hasConflict } from '../_shared/memberCore.ts';
import { isPeakSlot, coveringKinds, vipSurchargePerHour } from '../_shared/hourPackages.ts';
import { buildDebitPlan, applyDebitPlan } from '../_shared/bankedHours.ts';

// ADMIN-ONLY banked-hours booking on a customer's behalf (phone / walk-in).
//
// This mirrors bookWithBankedHours but, instead of drawing from the SIGNED-IN
// user's own ledger, staff pass the CUSTOMER's email and we debit THAT
// customer's banked hours. Same drawdown math (off-peak slots spend off-peak
// then peak; peak slots require peak hours), so off-peak hours stay restricted
// during peak times.
//
// Actions:
//   'preview' { customerEmail, location, bookingDate, startTime, durationHours }
//       -> balance at that location + whether this slot is peak + whether the
//          customer has enough coverable hours (no write). Powers the staff UI
//          preview so they see the balance before committing.
//   'book'    { customerEmail, customerName, customerPhone, simulatorId,
//               location, bookingDate, startTime, endTime, durationHours,
//               playerCount, notes }
//       -> conflict-checks, debits the customer's hours, and creates a
//          confirmed booking (payment_method 'banked_hours' -> green on the tee
//          sheet). VIP bays add a per-hour surcharge recorded as total_cost with
//          payment_status 'pending' for the desk to collect (no card on file for
//          a manual booking); standard bays cost $0.
Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const user = await getUserWithRole(req);
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return json({ error: 'Admin only.' }, { status: 403 });

    const db = serviceClient();
    const body = await req.json();
    const action = body?.action || 'book';

    const email = String(body.customerEmail || '').toLowerCase().trim();
    const location = body.location;
    const bookingDate = body.bookingDate;
    const startTime = body.startTime;
    const durationHours = Number(body.durationHours);

    if (!email || !location || !bookingDate || !startTime || !durationHours) {
      return json({ error: 'Missing customer email, location, date, time, or duration.' }, { status: 400 });
    }

    // Current banked balance for this customer across BOTH locations — hours are
    // a single shared pool, usable at either club regardless of where bought.
    const { data: ledger } = await db
      .from('hour_transactions')
      .select('kind,hours')
      .eq('user_email', email);
    const balance = { peak: 0, off_peak: 0 };
    for (const t of ledger || []) {
      balance[t.kind === 'peak' ? 'peak' : 'off_peak'] += Number(t.hours || 0);
    }

    const slotIsPeak = isPeakSlot(bookingDate, startTime);
    const kinds = coveringKinds(slotIsPeak);
    const plan = buildDebitPlan(balance, kinds, durationHours);

    // PREVIEW: just report the balance + feasibility, no write.
    if (action === 'preview') {
      return json({
        success: true,
        balance,
        slotIsPeak,
        usableHours: kinds.reduce((s, k) => s + Number(balance[k] || 0), 0),
        sufficient: !!plan,
        needed: durationHours
      });
    }

    // BOOK: validate, debit, create.
    const simulatorId = body.simulatorId;
    const endTime = body.endTime;
    const playerCount = body.playerCount || 1;
    const notes = body.notes || '';
    if (!simulatorId || !endTime) {
      return json({ error: 'Missing bay or end time.' }, { status: 400 });
    }

    const { data: bay } = await db.from('simulators').select('*').eq('id', simulatorId).single();
    if (!bay) return json({ error: 'Bay not found.' }, { status: 404 });
    if (bay.location !== location) {
      return json({ error: 'Bay does not match the selected location.' }, { status: 400 });
    }

    const startMin = timeToMinutes(startTime);
    const endMin = timeToMinutes(endTime);
    if (endMin <= startMin) return json({ error: 'Invalid time range.' }, { status: 400 });

    if (await hasConflict(db, simulatorId, bookingDate, startMin, endMin)) {
      return json({ error: 'That bay is already booked or blocked for this time.' }, { status: 409 });
    }

    if (!plan) {
      const avail = kinds.map((k) => `${balance[k]} ${k === 'peak' ? 'peak' : 'off-peak'}`).join(' + ');
      return json({
        error: `Not enough banked hours for this ${slotIsPeak ? 'peak' : 'off-peak'} slot. Customer has ${avail} hour(s) usable here; this booking needs ${durationHours}.`,
        insufficientHours: true
      }, { status: 400 });
    }

    const isVip = bay.bay_type === 'vip';
    const surchargePerHour = isVip ? vipSurchargePerHour(slotIsPeak) : 0;
    const surcharge = Math.round(surchargePerHour * durationHours * 100) / 100;

    const { data: created, error } = await db
      .from('bookings')
      .insert({
        simulator_id: bay.id,
        simulator_name: bay.name,
        location,
        customer_name: body.customerName || email,
        customer_email: email,
        customer_phone: body.customerPhone || '',
        booking_date: bookingDate,
        start_time: startTime,
        end_time: endTime,
        duration_hours: durationHours,
        total_cost: surcharge,
        number_of_players: playerCount,
        reservation_type: 'banked',
        payment_method: 'banked_hours',
        payment_status: surcharge > 0 ? 'pending' : 'paid',
        status: 'confirmed',
        notes,
        check_in_status: 'not_arrived'
      })
      .select()
      .single();
    if (error) {
      const isOverlap = (error as any).code === '23P01' || /overlap|exclusion/i.test(error.message || '');
      if (isOverlap) return json({ error: 'That bay was just booked by someone else.' }, { status: 409 });
      throw error;
    }

    await applyDebitPlan(db, {
      email,
      location,
      plan,
      bookingId: created.id,
      note: `Staff-booked ${bay.name} ${bookingDate} ${startTime} (by ${user.email})`
    });

    return json({
      success: true,
      booking: created,
      debited: plan,
      surcharge,
      surchargeDue: surcharge > 0
    });
  } catch (error) {
    console.error('adminBankedBooking error:', (error as any).message);
    return json({ error: (error as any).message || 'Booking failed.' }, { status: 500 });
  }
});
