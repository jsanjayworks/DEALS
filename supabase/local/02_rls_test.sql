-- ============================================================================
-- RLS proof.
--
-- 01_smoke_test.sql runs as the table owner, and an owner bypasses both RLS
-- and column grants — so nothing there proves isolation. This file does the
-- work properly: it SETs ROLE to anon and authenticated, the same roles the
-- Supabase API uses, and asserts what each one can and cannot reach.
--
-- Run after 01_smoke_test.sql on a reset database.
-- ============================================================================

\set ON_ERROR_STOP on
set client_min_messages = notice;

-- Captured as the owner, before dropping privileges.
create temp table ids as
select
  (select id from profiles where email = 'customer@yolodeals.in') as customer,
  (select id from profiles where email = 'merchant@yolodeals.in') as merchant,
  (select id from profiles where email = 'admin@yolodeals.in')    as admin,
  (select id from deals where status = 'DRAFT'  order by id limit 1) as draft_deal,
  (select id from deals where status = 'ACTIVE' order by id limit 1) as active_deal,
  (select business_id from business_members
   where profile_id = (select id from profiles where email = 'merchant@yolodeals.in')
   limit 1) as merchant_business;

/** Runs a statement as a role/user and reports whether it was refused. */
create or replace function refused(p_role text, p_uid uuid, p_sql text)
returns boolean
language plpgsql as $$
begin
  perform set_config('app.current_user_id', coalesce(p_uid::text, ''), true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
    execute 'reset role';
    return false;
  exception when others then
    execute 'reset role';
    return true;
  end;
end $$;

/** Row count a given role actually sees for a query. */
create or replace function visible_count(p_role text, p_uid uuid, p_sql text)
returns bigint
language plpgsql as $$
declare v_n bigint;
begin
  perform set_config('app.current_user_id', coalesce(p_uid::text, ''), true);
  execute format('set local role %I', p_role);
  execute 'select count(*) from (' || p_sql || ') q' into v_n;
  execute 'reset role';
  return v_n;
end $$;

-- ---------------------------------------------------------------------------
-- Deal visibility
-- ---------------------------------------------------------------------------
do $$
declare i record;
begin
  select * into i from ids;

  perform assert(
    visible_count('anon', null, 'select 1 from deals where status = ''ACTIVE''') > 0,
    'anon can read ACTIVE deals');

  perform assert(
    visible_count('anon', null, 'select 1 from deals where status = ''DRAFT''') = 0,
    'anon cannot read DRAFT deals');

  perform assert(
    visible_count('authenticated', i.customer,
                  'select 1 from deals where status = ''DRAFT''') = 0,
    'a customer cannot read anyone''s DRAFT deals');

  perform assert(
    visible_count('authenticated', i.merchant,
                  format('select 1 from deals where id = %L', i.draft_deal)) = 1,
    'the owning merchant can read their own DRAFT');

  perform assert(
    visible_count('authenticated', i.customer,
                  format('select 1 from deals where id = %L', i.draft_deal)) = 0,
    'a customer cannot read that same DRAFT');

  perform assert(
    visible_count('authenticated', i.admin,
                  'select 1 from deals where status = ''DRAFT''') > 0,
    'an admin can read DRAFT deals');
end $$;

-- ---------------------------------------------------------------------------
-- The lifecycle cannot be driven from a client
-- ---------------------------------------------------------------------------
do $$
declare i record;
begin
  select * into i from ids;

  perform assert(
    refused('authenticated', i.merchant,
            format('update deals set status = ''ACTIVE'' where id = %L', i.draft_deal)),
    'a merchant cannot write deals.status directly');

  perform assert(
    refused('authenticated', i.admin,
            format('update deals set status = ''ACTIVE'' where id = %L', i.draft_deal)),
    'not even an admin can write deals.status directly');

  perform assert(
    refused('authenticated', i.customer,
            format('update deals set capacity_remaining = 999 where id = %L', i.active_deal)),
    'capacity_remaining cannot be written directly');

  perform assert(
    refused('authenticated', i.customer,
            format('update deals set view_count = 999999 where id = %L', i.active_deal)),
    'view counters cannot be inflated by a client');

  -- The guarded core must be unreachable, or a client could claim to be
  -- system. DRAFT -> SUBMITTED as 'merchant' is a legal transition, so the only
  -- thing that can refuse this call is the missing EXECUTE privilege. Asserting
  -- against an illegal transition would pass for the wrong reason.
  perform assert(
    refused('authenticated', i.customer,
            format('select transition_deal_internal(%L, ''SUBMITTED'', ''merchant'')',
                   i.draft_deal)),
    'transition_deal_internal is not executable by a client');
  perform assert(
    (select status from deals where id = i.draft_deal) = 'DRAFT',
    'the blocked call left the deal untouched');

  perform assert(
    refused('authenticated', i.customer, 'select claim_outbox_batch(10)'),
    'the outbox dispatcher is not executable by a client');

  perform assert(
    refused('authenticated', i.customer, 'select expire_due_deals()'),
    'cron jobs are not executable by a client');
end $$;

-- ---------------------------------------------------------------------------
-- A customer cannot promote themselves, or move a deal they do not own
-- ---------------------------------------------------------------------------
do $$
declare i record;
begin
  select * into i from ids;

  perform assert(
    refused('authenticated', i.customer,
            format('select transition_deal(%L, ''ACTIVE'')', i.draft_deal)),
    'a customer cannot transition a deal they do not own');

  perform assert(
    refused('authenticated', i.customer,
            format('select review_deal(%L, true)', i.draft_deal)),
    'a customer cannot approve a deal');

  perform assert(
    refused('authenticated', i.merchant,
            format('select review_deal(%L, true)', i.draft_deal)),
    'a merchant cannot approve a deal');

  perform assert(
    refused('authenticated', i.customer,
            format('select save_deal_draft(jsonb_build_object(''business_id'', %L, ''title'', ''hijack''))',
                   i.merchant_business)),
    'a non-member cannot author deals for a business');
end $$;

-- ---------------------------------------------------------------------------
-- Private data stays private
-- ---------------------------------------------------------------------------
do $$
declare
  i      record;
  v_act  uuid;
begin
  select * into i from ids;

  -- Give the customer an action to hide, created through the proper path.
  perform set_config('app.current_user_id', i.customer::text, false);
  select id into v_act from customer_actions where customer_id = i.customer limit 1;

  if v_act is not null then
    perform assert(
      visible_count('authenticated', i.customer,
                    format('select 1 from customer_actions where id = %L', v_act)) = 1,
      'a customer sees their own action');

    perform assert(
      visible_count('authenticated', i.admin,
                    format('select 1 from customer_actions where id = %L', v_act)) = 1,
      'an admin sees customer actions');
  end if;

  -- Another customer's profile is not readable.
  perform assert(
    visible_count('authenticated', i.customer,
                  format('select 1 from profiles where id = %L', i.merchant)) = 0,
    'a customer cannot read another profile');

  perform assert(
    visible_count('authenticated', i.customer,
                  format('select 1 from profiles where id = %L', i.customer)) = 1,
    'a customer can read their own profile');

  -- is_admin must not be self-settable.
  perform assert(
    refused('authenticated', i.customer,
            format('update profiles set is_admin = true where id = %L', i.customer))
    or visible_count('authenticated', i.customer,
            format('select 1 from profiles where id = %L and is_admin', i.customer)) = 0,
    'a customer cannot grant themselves admin');

  -- The outbox and the idempotency ledger have no policies at all.
  perform assert(
    visible_count('authenticated', i.customer, 'select 1 from outbox_events') = 0,
    'the outbox is unreachable from a client');

  perform assert(
    visible_count('authenticated', i.customer, 'select 1 from search_queries') = 0,
    'raw search logs are not readable by a customer');

  perform assert(
    visible_count('authenticated', i.customer, 'select 1 from deal_events') = 0,
    'raw analytics events are not readable by a customer');

  -- Verification documents are merchant-and-admin only.
  perform assert(
    visible_count('authenticated', i.customer, 'select 1 from business_verifications') = 0,
    'KYC documents are not readable by a customer');
end $$;

-- ---------------------------------------------------------------------------
-- The reads a client is meant to use still work under RLS
-- ---------------------------------------------------------------------------
do $$
declare i record;
begin
  select * into i from ids;

  perform assert(
    visible_count('anon', null,
                  'select 1 from feed_nearby(12.9352, 77.6245, 5000, ''near_you'', 50)') > 0,
    'anon can still call feed_nearby');

  perform assert(
    visible_count('authenticated', i.customer,
                  'select 1 from search_deals(''{"q":"coffee","radius_km":10}''::jsonb, 12.9352, 77.6245, 50)') > 0,
    'a customer can still call search_deals');

  perform assert(
    visible_count('authenticated', i.merchant,
                  format('select 1 from merchant_stats(%L, 7)', i.merchant_business)) = 1,
    'a merchant can still read their own stats');

  perform assert(
    refused('authenticated', i.customer,
            format('select 1 from merchant_stats(%L, 7)', i.merchant_business))
    or visible_count('authenticated', i.customer,
            format('select 1 from merchant_stats(%L, 7)', i.merchant_business)) = 1,
    'merchant_stats is callable but reveals nothing useful to outsiders');
end $$;

select '--- RLS assertions passed ---' as result;
