-- The admin booking editor (BookingDetailModal) has long shown a "Staff Note
-- (Internal)" box, and the daily tee sheet now raises an amber flag on any
-- reservation that has one — but the bookings table never actually had a
-- column to store it, so saving a note failed with "error updating staff
-- notes" (Booking.update tried to write a column that didn't exist). This
-- adds the missing column. Distinct from the existing `notes` column, which
-- holds the CUSTOMER's note entered at booking time.

alter table public.bookings
  add column if not exists staff_notes text;
