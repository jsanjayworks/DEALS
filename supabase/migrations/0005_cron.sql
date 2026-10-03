-- ============================================================================
-- YOLO Deals — 0005: scheduled jobs
--
-- The lifecycle has three time-driven steps that nobody clicks:
--   PUBLISHED -> ACTIVE when a deal's start time arrives   activate_due_deals
--   ACTIVE    -> EXPIRED when it ends                      expire_due_deals
--   deal_events -> deal_analytics_daily, which merchant_stats reads
--                                                          rollup_deal_analytics
-- plus keeping a month of deal_events partitions ahead.
--
-- Supabase ships pg_cron. The plain PostGIS image used by npm run db:verify
-- does not, so there this migration notes that and does nothing; the
-- functions themselves are covered by the SQL tests.
--
-- Re-runnable: jobs are cleared by name before being scheduled.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron is not available here; scheduled jobs were not created';
    return;
  end if;

  create extension if not exists pg_cron with schema pg_catalog;
  grant usage on schema cron to postgres;
  grant all privileges on all tables in schema cron to postgres;

  -- Through pg_cron's own function: on Supabase the migration role may
  -- schedule jobs but not delete rows from cron.job directly.
  perform cron.unschedule(j.jobid)
  from cron.job j
  where j.jobname in (
    'activate-due-deals', 'expire-due-deals', 'rollup-deal-analytics',
    'rollup-deal-analytics-yesterday', 'ensure-event-partitions'
  );

  -- Every minute: a deal goes live, or ends, within a minute of its time.
  perform cron.schedule('activate-due-deals', '* * * * *', 'select public.activate_due_deals()');
  perform cron.schedule('expire-due-deals',   '* * * * *', 'select public.expire_due_deals()');

  -- Merchant stats lag by at most 15 minutes. Just after midnight, yesterday
  -- is rolled up once more so its last quarter-hour is not lost.
  perform cron.schedule('rollup-deal-analytics', '*/15 * * * *',
                        'select public.rollup_deal_analytics()');
  perform cron.schedule('rollup-deal-analytics-yesterday', '5 0 * * *',
                        'select public.rollup_deal_analytics(current_date - 1)');

  perform cron.schedule('ensure-event-partitions', '0 3 * * *',
                        'select public.ensure_event_partitions()');
end $$;
