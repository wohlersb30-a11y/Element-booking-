import { getUserWithRole, serviceClient } from '../_shared/clients.ts';
import { sendEmail } from '../_shared/email.ts';
import { sendSMS } from '../_shared/sms.ts';
import { json, preflight } from '../_shared/cors.ts';
import { BRAND, locationInfo } from '../_shared/locations.ts';
import { stripeForLocation } from '../_shared/stripe.ts';

const formatTime = (time24: string) => {
  const [hours, minutes] = String(time24).split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
};

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const user = await getUserWithRole(req);
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const { bookingId } = await req.json();
    if (!bookingId) return json({ success: false, error: 'No booking ID provided' });

    const db = serviceClient();
    const { data: booking } = await db
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();
    if (!booking) return json({ success: false, error: 'Booking not found' });

    // Only the booking owner or an admin may cancel.
    const isOwner = booking.customer_id === user.id || booking.customer_email === user.email;
    const isAdmin = user.role === 'admin';
    if (!isOwner && !isAdmin) return json({ error: 'Forbidden' }, { status: 403 });

    if (booking.status === 'cancelled') {
      return json({ success: true, alreadyCancelled: true, booking });
    }

    // Release the Stripe authorization hold, if one exists, on the account that
    // belongs to this booking's location.
    let holdReleased = false;
    if (booking.stripe_payment_id) {
      try {
        const stripe = stripeForLocation(booking.location);
        await stripe.paymentIntents.cancel(booking.stripe_payment_id);
        holdReleased = true;
      } catch (err) {
        console.error('Could not release hold:', err.message);
      }
    }

    const { data: updated } = await db
      .from('bookings')
      .update({
        status: 'cancelled',
        payment_status: holdReleased ? 'refunded' : booking.payment_status
      })
      .eq('id', bookingId)
      .select()
      .single();

    // Notify the customer (email + SMS).
    const loc = locationInfo(booking.location);
    try {
      await sendEmail({
        from_name: BRAND.name,
        to: booking.customer_email,
        subject: `Your tee time is cancelled \u26F3 ${formatDate(booking.booking_date)}`,
        body: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#334155;max-width:600px;margin:0 auto;padding:20px;">
  <div style="text-align:center;padding:28px;background:linear-gradient(135deg,#2d5567,#1e3a47);color:#fff;border-radius:10px 10px 0 0;">
    <h1 style="margin:0;font-size:26px;">Booking Cancelled \u26F3</h1>
    <p style="margin:8px 0 0;">${BRAND.name}</p>
  </div>
  <div style="background:#fff;padding:28px;border:1px solid #e2e8f0;border-top:none;">
    <p>Hi ${booking.customer_name},</p>
    <p>No worries — we've cancelled your reservation. Here's what's no longer on the books:</p>
    <div style="background:#f8fafc;padding:18px;border-radius:8px;margin:18px 0;">
      <p style="margin:6px 0;"><strong>Bay:</strong> ${booking.simulator_name}</p>
      <p style="margin:6px 0;"><strong>When:</strong> ${formatDate(booking.booking_date)} at ${formatTime(booking.start_time)}</p>
      <p style="margin:6px 0;"><strong>Where:</strong> ${loc.label}${loc.address ? ` \u2014 ${loc.address}` : ''}</p>
    </div>
    ${holdReleased ? '<p>\u2705 Good news: the authorization hold on your card has been released. No charge.</p>' : ''}
    <p>Change of plans? We get it. The fairway will be here whenever you're ready \u2014 book again any time and we'll have a bay warmed up for you.</p>
    <p>Questions or want to rebook over the phone? Give us a ring at <strong>${BRAND.phone}</strong>.</p>
    <p style="margin-top:24px;">Hope to see you swing by soon \u2014<br/><strong>The ${BRAND.name} Team</strong></p>
  </div>
  <div style="text-align:center;padding:18px;color:#64748b;font-size:13px;">
    ${BRAND.name} \u2022 ${BRAND.phone} \u2022 ${BRAND.website}
  </div>
</body></html>`
      });
    } catch (emailErr) {
      console.error('Cancellation email failed:', emailErr.message);
    }

    if (booking.customer_phone) {
      try {
        await sendSMS({
          to: booking.customer_phone,
          body: `\u26F3 ${BRAND.name}: Your reservation for ${booking.simulator_name} on ${formatDate(booking.booking_date)} at ${formatTime(booking.start_time)} is cancelled.${holdReleased ? ' Your card hold has been released.' : ''} Want to rebook? Call ${BRAND.phone}. Hope to see you soon!`
        });
      } catch (smsErr) {
        console.error('Cancellation SMS failed:', smsErr.message);
      }
    }

    // Notify active waitlist entries for this location/date that a spot opened.
    let notifiedCount = 0;
    try {
      const { data: waiting } = await db
        .from('waitlist')
        .select('*')
        .match({
          location: booking.location,
          preferred_date: booking.booking_date,
          status: 'active'
        });

      for (const entry of (waiting || [])) {
        try {
          await sendEmail({
            from_name: BRAND.name,
            to: entry.customer_email,
            subject: `A bay just opened up! \u26F3 ${formatDate(booking.booking_date)}`,
            body: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#334155;max-width:600px;margin:0 auto;padding:20px;">
  <div style="text-align:center;padding:28px;background:linear-gradient(135deg,#2d5567,#1e3a47);color:#fff;border-radius:10px 10px 0 0;">
    <h1 style="margin:0;font-size:26px;">A Bay Opened Up! \u26F3</h1>
    <p style="margin:8px 0 0;">${BRAND.name}</p>
  </div>
  <div style="background:#fff;padding:28px;border:1px solid #e2e8f0;border-top:none;">
    <p>Hi ${entry.customer_name},</p>
    <p>Great news — the fairway gods smiled on you! A bay just became available that matches your waitlist request:</p>
    <div style="background:#f8fafc;padding:18px;border-radius:8px;margin:18px 0;">
      <p style="margin:6px 0;"><strong>Where:</strong> ${loc.label}${loc.address ? ` \u2014 ${loc.address}` : ''}</p>
      <p style="margin:6px 0;"><strong>When:</strong> ${formatDate(booking.booking_date)} around ${formatTime(booking.start_time)}</p>
    </div>
    <p>\u26A1 Spots like this don't last long, so swing into action and book it before someone else grabs your tee time.</p>
    <p>Questions or want to book over the phone? Give us a ring at <strong>${BRAND.phone}</strong>.</p>
    <p style="margin-top:24px;">See you on the tee \u2014<br/><strong>The ${BRAND.name} Team</strong></p>
  </div>
  <div style="text-align:center;padding:18px;color:#64748b;font-size:13px;">
    ${BRAND.name} \u2022 ${BRAND.phone} \u2022 ${BRAND.website}
  </div>
</body></html>`
          });
          if (entry.customer_phone) {
            await sendSMS({
              to: entry.customer_phone,
              body: `\u26F3 ${BRAND.name}: A bay just opened up at ${loc.label} on ${formatDate(booking.booking_date)} around ${formatTime(booking.start_time)} \u2014 matching your waitlist request! Spots fill fast, grab it before someone else does. Book online or call ${BRAND.phone}.`
            }).catch((sErr) => console.error('Waitlist SMS failed for', entry.id, sErr.message));
          }
          await db
            .from('waitlist')
            .update({ status: 'notified', notified_at: new Date().toISOString() })
            .eq('id', entry.id);
          notifiedCount++;
        } catch (wErr) {
          console.error('Waitlist notify failed for', entry.id, wErr.message);
        }
      }
    } catch (wlErr) {
      console.error('Waitlist lookup failed:', wlErr.message);
    }

    return json({
      success: true,
      booking: updated,
      holdReleased,
      waitlistNotified: notifiedCount
    });
  } catch (error) {
    console.error('cancelBooking error:', error.message);
    return json(
      { success: false, error: error.message || 'Failed to cancel booking' },
      { status: 500 }
    );
  }
});
