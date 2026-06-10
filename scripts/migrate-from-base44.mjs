#!/usr/bin/env node
/**
 * Migrate Base44 data exports into Supabase.
 *
 * Usage:
 *   SUPABASE_URL=...  SUPABASE_SERVICE_ROLE_KEY=...  \
 *   node scripts/migrate-from-base44.mjs [--create-users] [--dir ./base44-export]
 *
 * Expects JSON array files in the export dir (any that are missing are skipped):
 *   simulators.json, bookings.json, waitlist.json, schedule_blocks.json, users.json
 *
 * Each file is the raw array of records exported from Base44.
 *
 * Flags:
 *   --create-users   Create Supabase auth users from users.json (random password,
 *                    email pre-confirmed). Users then reset their password.
 *                    Without this flag, bookings are linked to existing users by
 *                    email when possible, otherwise customer_id is left null.
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const createUsers = args.includes('--create-users');
const dirIdx = args.indexOf('--dir');
const EXPORT_DIR = dirIdx >= 0 ? args[dirIdx + 1] : './base44-export';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function load(name) {
  const file = path.join(EXPORT_DIR, name);
  if (!existsSync(file)) {
    console.log(`• ${name}: not found, skipping`);
    return [];
  }
  const raw = await readFile(file, 'utf8');
  const arr = JSON.parse(raw);
  console.log(`• ${name}: ${arr.length} records`);
  return arr;
}

// Map Base44 created_date -> created_at, drop fields the schema doesn't have.
const pick = (obj, keys) => {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  if (obj.created_date && out.created_at === undefined) out.created_at = obj.created_date;
  return out;
};

async function main() {
  console.log(`\nReading exports from ${EXPORT_DIR}\n`);

  const [simulators, bookings, waitlist, blocks, users] = await Promise.all([
    load('simulators.json'),
    load('bookings.json'),
    load('waitlist.json'),
    load('schedule_blocks.json'),
    load('users.json')
  ]);

  // ---- Users (optional) -> email -> auth user id map ----------------------
  const emailToId = new Map();

  // Seed from any profiles that already exist.
  const { data: existingProfiles } = await db.from('profiles').select('id, email');
  for (const p of existingProfiles || []) {
    if (p.email) emailToId.set(p.email.toLowerCase(), p.id);
  }

  if (createUsers && users.length) {
    console.log('\nCreating auth users…');
    for (const u of users) {
      const email = (u.email || '').toLowerCase();
      if (!email || emailToId.has(email)) continue;
      const { data, error } = await db.auth.admin.createUser({
        email,
        email_confirm: true,
        password: crypto.randomUUID(), // user resets via "forgot password"
        user_metadata: { full_name: u.full_name || u.name || '' }
      });
      if (error) {
        console.warn(`  ! ${email}: ${error.message}`);
        continue;
      }
      emailToId.set(email, data.user.id);
      // Set role on the auto-created profile.
      await db.from('profiles').update({
        full_name: u.full_name || u.name || '',
        role: u.role === 'admin' ? 'admin' : 'customer'
      }).eq('id', data.user.id);
    }
    console.log(`  mapped ${emailToId.size} users`);
  }

  // ---- Simulators (+ pricing_rules) --------------------------------------
  const simIdMap = new Map(); // oldId -> newId
  if (simulators.length) {
    console.log('\nInserting simulators…');
    for (const s of simulators) {
      const row = pick(s, [
        'name', 'location', 'bay_type', 'is_active',
        'pricing_peak', 'pricing_off_peak', 'description', 'created_at'
      ]);
      if (s.id && UUID_RE.test(s.id)) row.id = s.id; // preserve FK references
      const { data, error } = await db.from('simulators').insert(row).select('id').single();
      if (error) { console.warn(`  ! ${s.name}: ${error.message}`); continue; }
      simIdMap.set(s.id, data.id);

      // Base44 stored pricing_rules as an array on the simulator.
      if (Array.isArray(s.pricing_rules) && s.pricing_rules.length) {
        const rules = s.pricing_rules.map((r) => ({
          simulator_id: data.id,
          name: r.name ?? null,
          start_date: r.start_date ?? null,
          end_date: r.end_date ?? null,
          peak_rate: r.peak_rate ?? r.pricing_peak ?? null,
          off_peak_rate: r.off_peak_rate ?? r.pricing_off_peak ?? null
        }));
        const { error: prErr } = await db.from('pricing_rules').insert(rules);
        if (prErr) console.warn(`  ! pricing_rules for ${s.name}: ${prErr.message}`);
      }
    }
    console.log(`  inserted ${simIdMap.size} simulators`);
  }

  const remapSim = (oldId) => simIdMap.get(oldId) ?? (UUID_RE.test(oldId || '') ? oldId : null);

  // ---- Bookings ----------------------------------------------------------
  if (bookings.length) {
    console.log('\nInserting bookings…');
    const rows = bookings.map((b) => {
      const row = pick(b, [
        'simulator_name', 'location', 'customer_name', 'customer_email',
        'customer_phone', 'booking_date', 'start_time', 'end_time',
        'duration_hours', 'total_cost', 'number_of_players', 'payment_method',
        'payment_status', 'status', 'check_in_status', 'checked_in_at',
        'card_last_four', 'add_ons', 'notes', 'stripe_payment_id', 'created_at'
      ]);
      row.simulator_id = remapSim(b.simulator_id);
      const email = (b.customer_email || '').toLowerCase();
      row.customer_id = emailToId.get(email) ?? null;
      return row;
    });
    const { error } = await db.from('bookings').insert(rows);
    if (error) console.warn(`  ! bookings: ${error.message}`);
    else console.log(`  inserted ${rows.length} bookings`);
  }

  // ---- Waitlist ----------------------------------------------------------
  if (waitlist.length) {
    console.log('\nInserting waitlist…');
    const rows = waitlist.map((w) => pick(w, [
      'customer_name', 'customer_email', 'customer_phone', 'location',
      'preferred_date', 'preferred_time', 'duration_hours', 'number_of_players',
      'status', 'notified_at', 'created_at'
    ]));
    const { error } = await db.from('waitlist').insert(rows);
    if (error) console.warn(`  ! waitlist: ${error.message}`);
    else console.log(`  inserted ${rows.length} waitlist entries`);
  }

  // ---- Schedule blocks ---------------------------------------------------
  if (blocks.length) {
    console.log('\nInserting schedule blocks…');
    const rows = blocks.map((bl) => {
      const row = pick(bl, [
        'location', 'block_date', 'start_time', 'end_time', 'reason', 'created_at'
      ]);
      row.simulator_id = remapSim(bl.simulator_id);
      return row;
    });
    const { error } = await db.from('schedule_blocks').insert(rows);
    if (error) console.warn(`  ! schedule_blocks: ${error.message}`);
    else console.log(`  inserted ${rows.length} schedule blocks`);
  }

  console.log('\n✅ Migration complete.\n');
}

main().catch((err) => {
  console.error('\n❌ Migration failed:', err);
  process.exit(1);
});
