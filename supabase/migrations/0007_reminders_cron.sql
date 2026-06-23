-- Schedules the send-reminders edge function to run every 15 minutes via
-- pg_cron + pg_net. The function itself is idempotent (reminder_24h_sent /
-- reminder_2h_sent flags from migration 0006), so running it frequently only
-- ever sends each reminder once; the cadence just controls how promptly the
-- 24h / 2h windows are noticed.
--
-- BEFORE RUNNING, replace the two placeholders below:
--   <PROJECT_REF>  -> your Supabase project ref (e.g. abcdefghijklmno)
--   <CRON_SECRET>  -> the same value you set as the CRON_SECRET function secret
--                     (supabase secrets set CRON_SECRET=...)
--
-- The shared secret in the x-cron-secret header is what the function checks so
-- that only this scheduled job (not the public internet) can trigger a send.

-- Required extensions (safe to run if already enabled).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove any previous version of this job so re-running the migration is safe.
select cron.unschedule('send-reminders')
where exists (select 1 from cron.job where jobname = 'send-reminders');

-- Every 15 minutes, POST to the send-reminders function.
select cron.schedule(
  'send-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body    := '{}'::jsonb
  );
  $$
);
