import { getUser, serviceClient } from '../_shared/clients.ts';
import { json, preflight } from '../_shared/cors.ts';
import { stripeForLocation } from '../_shared/stripe.ts';
import { timeToMinutes } from '../_shared/membershipPlans.ts';
import { hasConflict } from '../_shared/memberCore.ts';
import { isPeakSlot, coveringKinds, vipSurchargePerHour } from '../_shared/hourPackages.ts';
import { computeTax } from '../_shared/tax.ts';
import { buildDebitPlan, applyDebitPlan } from '../_shared/bankedHours.ts';

// Book a bay by drawing down prepaid banked hours. Off-peak slots may spend
// off-peak hours (then peak); peak slots require peak hours. Standard bays cost
// no money — hours are debited and the booking is created immediately. VIP bays
// add a per-hour surcharge that is charged to the card via a checkout hold; the
// hours are debited and the booking created only after that hold succeeds
// (finalizeBooking, booking_kind = 'banked').
Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const user = await getUser(req);
    if (!user) return json({ error: 'Please sign in.' }, { status: 401 });

    const body = await req.json();
    const {
      simulatorId,
      location,
      bookingDate,
      startTime,
      endTime,
      durationHours,
      playerCount = 1,
      notes = '',
      customerName,
      customerPhone,
      successUrl,
      cancelUrl
    } = body || {};

    if (!simulatorId || !location || !bookingDate || !startTime || !endTime || !durationHours) {
      return json({ error: 'Missing booking details.' }, { status: 400 });
    }

    const db = serviceClient();
    const email = (user.email || '').toLowerCase();

    const { data: bay } = await db.from('simulators').select('*').eq('id', simulatorId).single();
    if (!bay) return json({ error: 'Bay not found.' }, { status: 404 });
    if (bay.location !== location) {
      return json({ error: 'Bay does not match the selected location.' }, { status: 400 });
    }

    const startMin = timeToMinutes(startTime);
    const endMin = timeToMinutes(endTime);
    if (endMin <= startMin) return json({ error: 'Invalid time range.' }, { status: 400 });

    if (await hasConflict(db, simulatorId, bookingDate, startMin, endMin)) {
      return json({ error: 'That bay is already booked for this time.' }, { status: 409 });
    }

    // Current balance for this customer at this location, grouped by bucket.
    const { data: ledger } = await db
      .from('hour_transactions')
      .select('kind,hours')
      .eq('user_email', email)
      .eq('location', location);
    const balance = { peak: 0, off_peak: 0 };
    for (const t of ledger || []) {
      balance[t.kind === 'peak' ? 'peak' : 'off_peak'] += Number(t.hours || 0);
    }

    const slotIsPeak = isPeakSlot(bookingDate, startTime);
    const kinds = coveringKinds(slotIsPeak);
    const duration = Number(durationHours);

    const plan = buildDebitPlan(balance, kinds, duration);
    if (!plan) {
      const avail = kinds.map((k) => `${balance[k]} ${k === 'peak' ? 'peak' : 'off-peak'}`).join(' + ');
      return json({
        error: `Not enough banked hours for this ${slotIsPeak ? 'peak' : 'off-peak'} slot. You have ${avail} hour(s) usable here; this booking needs ${duration}. Buy more hours or pay the regular way.`,
        insufficientHours: true
      }, { status: 400 });
    }

    const isVip = bay.bay_type === 'vip';
    const surchargePerHour = isVip ? vipSurchargePerHour(slotIsPeak) : 0;
    const surcharge = Math.round(surchargePerHour * duration * 100) / 100;

    // Everything finalizeBooking needs to create the booking + debit hours.
    const bankedData = {
      booking_kind: 'banked',
      simulatorId: bay.id,
      simulatorName: bay.name,
      location,
      customerId: user.id,
      customerEmail: email,
      customerName: customerName || user.email,
      customerPhone: customerPhone || '',
      bookingDate,
      startTime,
      endTime,
      durationHours: duration,
      playerCount,
      notes,
      surcharge,
      debitPlan: plan
    };

    // No surcharge: create the booking + debit immediately, no card needed.
    if (surcharge <= 0) {
      const { data: created, error } = await db
        .from('bookings')
        .insert({
          simulator_id: bay.id,
          simulator_name: bay.name,
          location,
          customer_id: user.id,
          customer_name: bankedData.customerName,
          customer_email: email,
          customer_phone: bankedData.customerPhone,
          booking_date: bookingDate,
          start_time: startTime,
          end_time: endTime,
          duration_hours: duration,
          total_cost: 0,
          number_of_players: playerCount,
          payment_method: 'banked_hours',
          payment_status: 'paid',
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
        userId: user.id,
        location,
        plan,
        bookingId: created.id,
        note: `Booked ${bay.name} ${bookingDate} ${startTime}`
      });

      return json({ success: true, booking: created });
    }

    // VIP surcharge: charge it (card hold) before creating the booking.
    const { rate, tax } = computeTax(surcharge, location);
    const stripe = stripeForLocation(location);
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'VIP Suite Surcharge (Authorization Hold)',
              description: `${bay.name} · ${bookingDate} ${startTime} · ${duration}h · banked hours + $${surchargePerHour}/hr VIP`
            },
            unit_amount: Math.round(surcharge * 100)
          },
          quantity: 1
        },
        ...(tax > 0
          ? [{
              price_data: {
                currency: 'usd',
                product_data: { name: 'Minnesota Sales Tax', description: `${(rate * 100).toFixed(3)}% MN sales tax` },
                unit_amount: Math.round(tax * 100)
              },
              quantity: 1
            }]
          : [])
      ],
      payment_intent_data: {
        capture_method: 'manual',
        description: `VIP surcharge (banked hours) — ${bankedData.customerName}`,
        metadata: { booking_kind: 'banked', booking_date: bookingDate }
      },
      metadata: {
        booking_kind: 'banked',
        banked: JSON.stringify(bankedData),
        customerId: user.id
      },
      success_url: successUrl,
      cancel_url: cancelUrl
    });

    return json({ success: true, needsSurcharge: true, surcharge, url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('bookWithBankedHours error:', (error as any).message);
    return json({ error: (error as any).message || 'Booking failed.' }, { status: 500 });
  }
});
