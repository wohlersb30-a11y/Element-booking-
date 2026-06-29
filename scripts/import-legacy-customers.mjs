#!/usr/bin/env node
/**
 * Import existing customers from a CSV into public.legacy_customers so returning
 * customers can "complete a one-time registration" in the new app.
 *
 * Usage:
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SERVICE_ROLE_KEY=<service_role_key> \
 *   node scripts/import-legacy-customers.mjs ./customers.csv
 *
 * The CSV must have a header row. Column names are matched case-insensitively
 * and flexibly:
 *   email          <- email / e-mail / email address
 *   full_name      <- name / full name / customer / customer name
 *                     (or first name + last name, which are combined)
 *   phone          <- phone / phone number / mobile / cell / tel
 *
 * Rows without a valid email are skipped. Existing emails are updated
 * (name/phone refreshed) but their claimed status is preserved.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY;
const csvPath = process.argv[2];

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SERVICE_ROLE_KEY env vars.');
  process.exit(1);
}
if (!csvPath) {
  console.error('Usage: node scripts/import-legacy-customers.mjs <path-to-csv>');
  process.exit(1);
}

// --- Minimal CSV parser (handles quotes, commas, escaped quotes, CRLF) -------
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((v) => v !== '')) rows.push(row); }
  return rows;
}

const norm = (s) => (s || '').toString().trim().toLowerCase();

function findCol(headers, candidates) {
  for (let i = 0; i < headers.length; i++) {
    if (candidates.includes(norm(headers[i]))) return i;
  }
  return -1;
}

const raw = readFileSync(csvPath, 'utf8');
const rows = parseCsv(raw);
if (rows.length < 2) {
  console.error('CSV appears empty (need a header row + at least one data row).');
  process.exit(1);
}

const headers = rows[0];
const iEmail = findCol(headers, ['email', 'e-mail', 'email address', 'emailaddress']);
const iName = findCol(headers, ['full_name', 'name', 'full name', 'customer', 'customer name']);
const iFirst = findCol(headers, ['first name', 'first', 'firstname', 'first_name']);
const iLast = findCol(headers, ['last name', 'last', 'lastname', 'last_name']);
const iPhone = findCol(headers, ['phone', 'phone number', 'phonenumber', 'mobile', 'cell', 'tel', 'telephone']);

if (iEmail === -1) {
  console.error('Could not find an email column. Headers were:', headers);
  process.exit(1);
}

const seen = new Set();
const records = [];
let skipped = 0;
for (let r = 1; r < rows.length; r++) {
  const cols = rows[r];
  const email = norm(cols[iEmail]);
  if (!email || !email.includes('@')) { skipped++; continue; }
  if (seen.has(email)) { skipped++; continue; }
  seen.add(email);

  let full_name = iName !== -1 ? (cols[iName] || '').trim() : '';
  if (!full_name && (iFirst !== -1 || iLast !== -1)) {
    full_name = [iFirst !== -1 ? cols[iFirst] : '', iLast !== -1 ? cols[iLast] : '']
      .map((s) => (s || '').trim()).filter(Boolean).join(' ');
  }
  const phone = iPhone !== -1 ? (cols[iPhone] || '').trim() : '';
  records.push({ email, full_name: full_name || null, phone: phone || null });
}

console.log(`Parsed ${records.length} unique customers (skipped ${skipped} rows without a valid/unique email).`);

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Upsert in batches. onConflict=email keeps a single row per email; we do NOT
// reset claimed_at so already-registered customers stay claimed.
const BATCH = 500;
let upserted = 0;
for (let i = 0; i < records.length; i += BATCH) {
  const batch = records.slice(i, i + BATCH);
  const { error } = await supabase
    .from('legacy_customers')
    .upsert(batch, { onConflict: 'email', ignoreDuplicates: false });
  if (error) {
    console.error('Upsert failed on batch starting at', i, '-', error.message);
    process.exit(1);
  }
  upserted += batch.length;
  console.log(`  …${upserted}/${records.length}`);
}

console.log(`Done. Imported/updated ${upserted} legacy customers.`);
