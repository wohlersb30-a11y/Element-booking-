// Central source of truth for the tee-sheet operating hours.
//
// Historically the bookable window was hard-coded to 9:00 AM–11:00 PM (with an
// earlier 9:00 PM close on Sundays) in a dozen different components. Admins can
// now extend those hours per location (open earlier than 9 AM, close later than
// 11 PM) via the Operating Hours editor, which writes to the `location_hours`
// table. Everything that generates bookable time slots reads its bounds from
// here so a single setting drives the whole app.
//
// Times are stored as "HH:MM" strings. A close of "24:00" means midnight.

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

// Preserves the original behavior when a location has no saved override.
export const DEFAULT_HOURS = {
  open: '09:00',
  close: '23:00',
  sunday_close: '21:00'
};

// How far outside the classic window an admin is allowed to go (per the product
// decision): earliest open 6:00 AM, latest close midnight.
export const HOURS_BOUNDS = {
  minOpen: '06:00',
  maxClose: '24:00'
};

export const toMinutes = (t) => {
  if (!t || typeof t !== 'string' || !t.includes(':')) return NaN;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return NaN;
  return h * 60 + m;
};

// "09:00" -> "9:00 AM", "23:00" -> "11:00 PM", "24:00" -> "12:00 AM".
export const formatHourLabel = (t) => {
  const total = toMinutes(t);
  if (Number.isNaN(total)) return String(t ?? '');
  const h = Math.floor(total / 60) % 24; // 24:00 -> 0 (midnight)
  const m = total % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
};

// Coerce a DB row (or nothing) into a complete, valid hours object.
export const normalizeHours = (row) => {
  if (!row) return { ...DEFAULT_HOURS };
  return {
    open: row.open_time || DEFAULT_HOURS.open,
    close: row.close_time || DEFAULT_HOURS.close,
    sunday_close: row.sunday_close_time || DEFAULT_HOURS.sunday_close
  };
};

// The close time that applies to a specific calendar date (Sundays can close
// earlier). `date` may be a Date or anything the Date constructor accepts.
export const closeTimeForDate = (date, hours) => {
  const h = hours || DEFAULT_HOURS;
  const isSunday = date != null && new Date(date).getDay() === 0;
  return isSunday && h.sunday_close ? h.sunday_close : h.close;
};

// Bookable START times between open (inclusive) and close (exclusive), stepping
// every `stepMin` minutes. The last start is always strictly before close so a
// booking can't begin at closing time.
export const buildStartOptions = (open, close, stepMin = 60) => {
  const out = [];
  const start = toMinutes(open);
  const end = toMinutes(close);
  if (Number.isNaN(start) || Number.isNaN(end)) return out;
  for (let m = start; m < end; m += stepMin) {
    const value = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    out.push({ value, label: formatHourLabel(value) });
  }
  return out;
};

// Whole "HH:00" options between two bounds (inclusive), used to populate the
// open/close pickers in the admin editor.
export const buildHourChoices = (from, to) => {
  const out = [];
  const start = toMinutes(from);
  const end = toMinutes(to);
  for (let m = start; m <= end; m += 60) {
    const value = `${String(Math.floor(m / 60)).padStart(2, '0')}:00`;
    out.push({ value, label: formatHourLabel(value) });
  }
  return out;
};

// Load a location's saved hours (falling back to defaults). Re-fetches whenever
// `location` changes. Public read is allowed on `location_hours`, so this works
// for the customer tee sheet as well as admin screens.
export function useLocationHours(location) {
  const [hours, setHours] = useState(DEFAULT_HOURS);

  useEffect(() => {
    let active = true;
    if (!location) {
      setHours(DEFAULT_HOURS);
      return;
    }
    (async () => {
      try {
        const { data } = await supabase
          .from('location_hours')
          .select('*')
          .eq('location', location)
          .maybeSingle();
        if (active) setHours(normalizeHours(data));
      } catch (_err) {
        if (active) setHours(DEFAULT_HOURS);
      }
    })();
    return () => {
      active = false;
    };
  }, [location]);

  return hours;
}
