import { getUser, serviceClient } from '../_shared/clients.ts';
import { json, preflight } from '../_shared/cors.ts';
import { getPlan } from '../_shared/membershipPlans.ts';

// Corporate account-holder (shared-seat) management. Only the membership OWNER
// (membership.user_email) may add/remove authorized emails, and only on a
// corporate-tier membership. The owner seat counts toward the plan's
// accountHolders cap, so authorized_emails length is capped at (cap - 1).
Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const user = await getUser(req);
    if (!user) return json({ error: 'Please sign in.' }, { status: 401 });

    const body = await req.json();
    const { membershipId, action, email } = body || {};
    if (!membershipId || !action) {
      return json({ error: 'Missing membershipId or action.' }, { status: 400 });
    }
    if (action !== 'add' && action !== 'remove' && action !== 'list') {
      return json({ error: 'Unknown action.' }, { status: 400 });
    }

    const db = serviceClient();
    const { data: membership } = await db
      .from('memberships')
      .select('*')
      .eq('id', membershipId)
      .single();
    if (!membership) return json({ error: 'Membership not found.' }, { status: 404 });

    // Only the owner may manage seats.
    if ((membership.user_email || '').toLowerCase() !== (user.email || '').toLowerCase()) {
      return json({ error: 'Only the account owner can manage seats.' }, { status: 403 });
    }

    const plan = getPlan(membership.membership_level);
    if (!plan) return json({ error: 'Unknown membership tier.' }, { status: 400 });
    const cap = plan.accountHolders || 1;
    if (cap <= 1) {
      return json({ error: 'This membership tier does not support additional account holders.' }, { status: 400 });
    }

    const current: string[] = Array.isArray(membership.authorized_emails)
      ? membership.authorized_emails.map((e: string) => (e || '').toLowerCase()).filter(Boolean)
      : [];

    if (action === 'list') {
      return json({ authorizedEmails: current, cap, seatsUsed: current.length + 1, ownerEmail: membership.user_email });
    }

    const target = String(email || '').trim().toLowerCase();
    if (!target || !target.includes('@')) {
      return json({ error: 'Enter a valid email address.' }, { status: 400 });
    }

    let next = current;
    if (action === 'add') {
      if (target === (membership.user_email || '').toLowerCase()) {
        return json({ error: 'The owner already has a seat.' }, { status: 400 });
      }
      if (current.includes(target)) {
        return json({ error: 'That email already has a seat.' }, { status: 400 });
      }
      // Owner occupies one seat; authorized_emails fill the rest.
      if (current.length + 1 >= cap) {
        return json({ error: `All ${cap} seats are in use. Remove one to add another.` }, { status: 400 });
      }
      next = [...current, target];
    } else {
      // remove
      if (!current.includes(target)) {
        return json({ error: 'That email is not on the account.' }, { status: 400 });
      }
      next = current.filter((e) => e !== target);
    }

    const { error: updErr } = await db
      .from('memberships')
      .update({ authorized_emails: next })
      .eq('id', membershipId);
    if (updErr) {
      console.error('manageCorporateSeats update error:', updErr.message);
      return json({ error: 'Could not update seats. Please try again.' }, { status: 500 });
    }

    return json({
      success: true,
      authorizedEmails: next,
      cap,
      seatsUsed: next.length + 1,
      ownerEmail: membership.user_email
    });
  } catch (error) {
    console.error('manageCorporateSeats error:', (error as any).message);
    return json({ error: (error as any).message || 'Request failed.' }, { status: 500 });
  }
});
