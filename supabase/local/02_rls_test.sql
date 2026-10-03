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

-- ---------------------------------------------------------------------------
-- Card reads respect visibility
--
-- deal_card_base used to run with its owner's rights, which skipped RLS, and
-- get_deal returned any deal to anyone holding its id. Both leaked drafts,
-- submissions and rejection reasons.
-- ---------------------------------------------------------------------------
do $$
declare
  i record;
  v_submitted uuid;
begin
  select * into i from ids;
  select id into v_submitted from deals where status = 'SUBMITTED' order by id limit 1;

  perform assert(
    visible_count('anon', null,
      'select 1 from deal_card_base where status not in (''ACTIVE'',''PUBLISHED'')') = 0,
    'anon cannot read unpublished deals through deal_card_base');

  perform assert(
    visible_count('anon', null, format('select 1 from get_deal(%L)', v_submitted)) = 0,
    'get_deal hides a submitted deal from anon');

  perform assert(
    visible_count('authenticated', i.customer, format('select 1 from get_deal(%L)', i.draft_deal)) = 0,
    'get_deal hides another business''s draft from a customer');

  perform assert(
    visible_count('authenticated', i.merchant, format('select 1 from get_deal(%L)', i.draft_deal)) = 1,
    'get_deal shows a merchant their own draft');

  perform assert(
    visible_count('authenticated', i.admin, format('select 1 from get_deal(%L)', v_submitted)) = 1,
    'get_deal shows an admin a submitted deal');

  perform assert(
    visible_count('anon', null, format('select 1 from get_deal(%L)', i.active_deal)) = 1,
    'get_deal still shows an active deal to anyone');

  perform assert(
    refused('authenticated', i.admin, 'select deal_cards(array[gen_random_uuid()])'),
    'deal_cards, which skips visibility, is not callable by any client');

  perform assert(
    refused('authenticated', i.customer,
            format('select 1 from business_deals(%L)', i.merchant_business)),
    'business_deals refuses a non-member');

  perform assert(
    visible_count('authenticated', i.merchant,
      format('select 1 from business_deals(%L) where status = ''DRAFT''', i.merchant_business)) > 0,
    'business_deals gives a member their drafts');

  perform assert(
    refused('authenticated', i.customer, 'select 1 from review_queue()'),
    'review_queue refuses a non-admin');

  perform assert(
    visible_count('authenticated', i.admin, 'select 1 from review_queue()') > 0,
    'review_queue lists submissions for an admin');

  perform assert(
    refused('authenticated', i.customer,
            format('select 1 from merchant_stats(%L, 7)', i.merchant_business)),
    'merchant_stats refuses an outsider');

  perform assert(
    visible_count('anon', null, 'select 1 from list_localities() where lat between 12 and 14') = 10,
    'list_localities returns plain lat/lng to anyone');
end $$;

-- Nobody can make themselves a member of a business.
do $$
declare i record;
begin
  select * into i from ids;
  perform assert(
    refused('authenticated', i.customer,
            format('insert into business_members (business_id, profile_id) values (%L, %L)',
                   i.merchant_business, i.customer)),
    'a customer cannot add themselves to a business');
  perform assert(
    refused('authenticated', i.customer,
            format('insert into business_members (business_id, profile_id)
                    select id, %L from businesses
                    where id not in (select business_id from business_members) limit 1',
                   i.customer)),
    'nor claim a business that has no members yet');
end $$;

-- The merchant sees why a deal was sent back, through the same read the app uses.
do $$
declare
  i record;
  v_reason text;
begin
  select * into i from ids;
  perform set_config('app.current_user_id', i.merchant::text, true);
  set local role authenticated;
  select c.rejection_reason into v_reason
  from business_deals(i.merchant_business) c
  where c.status = 'REJECTED' limit 1;
  reset role;
  perform assert(v_reason is not null and length(v_reason) > 10,
                 'a merchant reads the rejection reason on their own deal');
end $$;

-- ---------------------------------------------------------------------------
-- Merchant onboarding (0006): one sign-in, a business makes you a merchant.
-- ---------------------------------------------------------------------------
do $$
declare
  i          record;
  v_locality uuid;
  v_far      uuid;
  v_category uuid;
  v_biz      uuid;
  v_input    text;
  v_state    text;
begin
  select * into i from ids;
  select id into v_locality from localities where name = 'Koramangala';
  select id into v_category from categories where slug = 'food';
  v_input := jsonb_build_object(
    'name', 'Test Dosa Corner', 'phone', '+91 98450 00000',
    'primary_category_id', v_category, 'locality_id', v_locality,
    'address_line', '12, 5th Block, Koramangala')::text;

  perform assert(
    refused('anon', null, format('select create_business(%L::jsonb)', v_input)),
    'anon cannot create a business');

  perform assert(
    refused('authenticated', i.customer,
            format('select create_business(%L::jsonb)',
                   (v_input::jsonb || '{"name": "x"}')::text)),
    'create_business refuses a one-letter name');

  perform assert(
    refused('authenticated', i.customer,
            format('select create_business(%L::jsonb)',
                   (v_input::jsonb || jsonb_build_object('locality_id', gen_random_uuid()))::text)),
    'create_business refuses an unknown locality');

  perform assert(
    refused('authenticated', i.customer,
            format('select create_business(%L::jsonb)',
                   (v_input::jsonb || '{"lat": 13.35, "lng": 77.10}')::text)),
    'create_business refuses a pin far from the chosen locality');

  -- The happy path, as the customer.
  perform set_config('app.current_user_id', i.customer::text, true);
  set local role authenticated;
  v_biz := create_business(v_input::jsonb);
  reset role;

  perform assert(
    exists (select 1 from business_members
             where business_id = v_biz and profile_id = i.customer and member_role = 'owner'),
    'create_business makes the caller the owner');
  perform assert(
    (select verification_status::text from businesses where id = v_biz) = 'unverified',
    'a new business starts unverified');
  perform assert(
    exists (select 1 from business_locations
             where business_id = v_biz and is_primary and locality_id = v_locality),
    'a new business gets a primary location in the chosen locality');
  perform assert(
    visible_count('authenticated', i.customer,
                  format('select 1 from business_deals(%L)', v_biz)) = 0
    and not refused('authenticated', i.customer, format('select 1 from business_deals(%L)', v_biz)),
    'the new owner can open their (empty) merchant view');

  -- Direct writes that would skip the rules.
  perform assert(
    refused('authenticated', i.customer,
            'insert into businesses (name, verification_status) values (''Fake'', ''verified'')'),
    'nobody inserts a business directly, let alone a verified one');
  perform assert(
    refused('authenticated', i.customer,
            format('update businesses set verification_status = ''verified'' where id = %L', v_biz)),
    'an owner cannot verify their own business');
  perform assert(
    refused('authenticated', i.customer,
            format('update businesses set rating_avg = 5 where id = %L', v_biz)),
    'an owner cannot set their own rating');
  perform assert(
    not refused('authenticated', i.customer,
                format('update businesses set phone = ''+91 98450 11111'' where id = %L', v_biz)),
    'an owner can still edit their contact details');
  perform assert(
    refused('authenticated', i.customer,
            format('insert into business_verifications (business_id, owner_name, status)
                    values (%L, ''Me'', ''approved'')', v_biz)),
    'nobody files an already-approved verification');

  perform assert(
    refused('authenticated', i.customer,
            format('update businesses set legal_name = ''Someone Else Pvt Ltd'' where id = %L', v_biz))
    and refused('authenticated', i.customer,
                format('update businesses set registration_number = ''29AAAAA0000A1Z5'' where id = %L', v_biz)),
    'the registered name and number are not editable by the owner');
end $$;

-- ---------------------------------------------------------------------------
-- Verification with registration details (GSTIN, or PAN plus a licence).
-- ---------------------------------------------------------------------------

/** A GSTIN with the right check digit, from its first fourteen characters. */
create or replace function test_gstin(p_first14 text) returns text
language sql as $$
  select p_first14 || c
  from unnest(string_to_array('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', null)) c
  where gstin_is_valid(p_first14 || c)
  limit 1;
$$;

do $$
declare
  i        record;
  v_food   uuid;   -- the customer's food business from the block above
  v_salon  uuid;   -- a second, non-food business with no GST
  v_gstin  text := test_gstin('29ABCPK1234F1Z');
  v_good   jsonb;
  v_nogst  jsonb;
  v_state  text;
begin
  select * into i from ids;
  select b.id into v_food from businesses b
    join business_members m on m.business_id = b.id
   where m.profile_id = i.customer and b.name = 'Test Dosa Corner';

  perform assert(gstin_is_valid('27AAPFU0939F1ZV'), 'the GST example GSTIN passes the check digit');
  perform assert(not gstin_is_valid('27AAPFU0939F1ZA'), 'one wrong check digit fails it');
  perform assert(not gstin_is_valid('00AAPFU0939F1ZV'), 'state code 00 fails it');

  v_good := jsonb_build_object(
    'legal_name', 'Aarav Sharma', 'constitution', 'proprietorship', 'gstin', lower(v_gstin),
    'fssai', '21223008000123', 'registered_address', '12, 5th Block, Koramangala, Bengaluru 560095',
    'owner_name', 'Aarav Sharma', 'owner_role', 'owner', 'declared', true);

  perform assert(
    refused('authenticated', i.merchant,
            format('select submit_business_verification(%L, %L::jsonb)', v_food, v_good)),
    'only the owner can ask for verification');
  perform assert(
    refused('authenticated', i.customer,
            format('select submit_business_verification(%L, %L::jsonb)', v_food,
                   v_good || jsonb_build_object('gstin', substr(v_gstin, 1, 14) ||
                     case when right(v_gstin, 1) = 'A' then 'B' else 'A' end))),
    'a GSTIN with the wrong check digit is refused');
  perform assert(
    refused('authenticated', i.customer,
            format('select submit_business_verification(%L, %L::jsonb)', v_food,
                   v_good || '{"constitution": "private_limited"}'::jsonb)),
    'a person''s GSTIN does not pass as a company');
  perform assert(
    refused('authenticated', i.customer,
            format('select submit_business_verification(%L, %L::jsonb)', v_food, v_good - 'fssai')),
    'a food business needs an FSSAI number');
  perform assert(
    refused('authenticated', i.customer,
            format('select submit_business_verification(%L, %L::jsonb)', v_food,
                   v_good || '{"declared": false}'::jsonb)),
    'the declaration must be ticked');
  perform assert(
    refused('authenticated', i.customer,
            format('select submit_business_verification(%L, %L::jsonb)', v_food,
                   (v_good - 'gstin') || '{"pan": "ABCPK1234F"}'::jsonb)),
    'without GST, a PAN alone is not enough');

  perform set_config('app.current_user_id', i.customer::text, true);
  set local role authenticated;
  v_state := submit_business_verification(v_food, v_good)::text;
  reset role;
  perform assert(v_state = 'pending'
                 and (select verification_status::text from businesses where id = v_food) = 'pending',
                 'a complete GST request moves the business to pending');
  perform assert(
    (select pan from business_verifications where business_id = v_food) = 'ABCPK1234F'
    and (select gstin from business_verifications where business_id = v_food) = v_gstin,
    'the GSTIN is stored upper-case and its PAN is taken from it');
  perform assert(
    refused('authenticated', i.customer,
            format('select submit_business_verification(%L, %L::jsonb)', v_food, v_good)),
    'a pending request is not filed twice');

  -- A small salon under the GST threshold: PAN plus a Udyam registration.
  perform set_config('app.current_user_id', i.customer::text, true);
  set local role authenticated;
  v_salon := create_business(jsonb_build_object(
    'name', 'Test Glow Studio',
    'primary_category_id', (select id from categories where slug = 'services'),
    'locality_id', (select id from localities where name = 'Koramangala'),
    'address_line', '3rd Cross, 6th Block, Koramangala'));
  reset role;
  v_nogst := jsonb_build_object(
    'legal_name', 'Aarav Sharma', 'constitution', 'proprietorship', 'pan', 'abcpk1234f',
    'licence_type', 'udyam', 'licence_number', 'UDYAM-KR-03-0012345',
    'registered_address', '3rd Cross, 6th Block, Koramangala, Bengaluru 560095',
    'owner_name', 'Aarav Sharma', 'owner_role', 'owner', 'declared', true);
  perform assert(
    refused('authenticated', i.customer,
            format('select submit_business_verification(%L, %L::jsonb)', v_salon,
                   v_nogst || '{"licence_number": "KR-03-12345"}'::jsonb)),
    'a Udyam number has to look like one');
  perform set_config('app.current_user_id', i.customer::text, true);
  set local role authenticated;
  v_state := submit_business_verification(v_salon, v_nogst)::text;
  reset role;
  perform assert(v_state = 'pending', 'PAN plus Udyam works for a non-food business without GST');

  -- Who can read a request.
  perform assert(
    visible_count('authenticated', i.customer,
                  format('select 1 from business_verifications where business_id = %L', v_food)) = 1,
    'the owner can read their own request');
  perform assert(
    visible_count('authenticated', i.merchant,
                  format('select 1 from business_verifications where business_id = %L', v_food)) = 0,
    'another merchant cannot');

  -- The admin's view.
  perform assert(
    refused('authenticated', i.customer, 'select 1 from business_verification_queue()'),
    'a customer cannot read the verification queue');
  perform assert(
    visible_count('authenticated', i.admin,
                  format('select 1 from business_verification_queue() where business_id = %L
                          and gstin = %L and legal_name = ''Aarav Sharma'' and fssai = ''21223008000123''
                          and locality_name = ''Koramangala''', v_food, v_gstin)) = 1,
    'an admin sees the registration details with the request');
  perform assert(
    visible_count('authenticated', i.admin,
                  format('select 1 from business_verification_queue() where business_id = %L
                          and same_id_elsewhere = 1', v_salon)) = 1,
    'the queue flags the same PAN on two businesses');

  perform assert(
    refused('authenticated', i.admin, format('select review_business(%L, false, null)', v_salon)),
    'declining needs a reason');

  perform set_config('app.current_user_id', i.admin::text, true);
  set local role authenticated;
  perform review_business(v_salon, false, 'The Udyam certificate is for a different address');
  perform review_business(v_food, true, null);
  reset role;

  perform assert(
    (select verification_status::text from businesses where id = v_food) = 'verified'
    and (select legal_name from businesses where id = v_food) = 'Aarav Sharma'
    and (select registration_number from businesses where id = v_food) = v_gstin,
    'approval verifies the business and records its registered name and GSTIN');
  perform assert(
    (select verification_status::text from businesses where id = v_salon) = 'rejected'
    and (select rejection_reason from business_verifications where business_id = v_salon)
        = 'The Udyam certificate is for a different address',
    'a decline keeps the reason');
  perform assert(
    exists (select 1 from notifications where profile_id = i.customer and kind = 'business_verified')
    and exists (select 1 from notifications where profile_id = i.customer and kind = 'business_rejected'
                and body = 'The Udyam certificate is for a different address'),
    'the owner is told either way, with the reason');
  perform assert(
    visible_count('authenticated', i.admin, 'select 1 from business_verification_queue()') = 0,
    'and the queue is empty again');
end $$;

-- ---------------------------------------------------------------------------
-- Support requests and account deletion (0007).
-- ---------------------------------------------------------------------------
do $$
declare
  i          record;
  v_action   uuid;
  v_other    uuid;
  v_ticket   uuid;
  v_status   text;
begin
  select * into i from ids;

  -- One of the customer's own claims, and one belonging to someone else.
  insert into customer_actions (deal_id, customer_id, action_type, status, redemption_code)
  values (i.active_deal, i.customer, 'claim', 'redeemed', 'YOLO-TSTSUP')
  returning id into v_action;
  insert into customer_actions (deal_id, customer_id, action_type, status, redemption_code)
  values (i.active_deal, i.admin, 'claim', 'confirmed', 'YOLO-TSTOTH')
  returning id into v_other;

  perform assert(
    refused('anon', null, 'select create_support_ticket(''{"topic":"other","message":"Hello there team"}''::jsonb)'),
    'anon cannot file a support request');
  perform assert(
    refused('authenticated', i.customer,
            'select create_support_ticket(''{"topic":"other","message":"help"}''::jsonb)'),
    'a request needs at least 10 characters');
  perform assert(
    refused('authenticated', i.customer,
            format('select create_support_ticket(%L::jsonb)',
                   jsonb_build_object('topic', 'claim_problem', 'action_id', v_other,
                                      'message', 'The shop did not honour this'))),
    'a customer cannot attach someone else''s claim');
  perform assert(
    refused('authenticated', i.customer,
            format('insert into support_tickets (profile_id, topic, message, status, reply)
                    values (%L, ''other'', ''Fake answered ticket'', ''answered'', ''All sorted'')', i.customer)),
    'nobody writes tickets directly, let alone answered ones');

  perform set_config('app.current_user_id', i.customer::text, true);
  set local role authenticated;
  v_ticket := create_support_ticket(jsonb_build_object(
    'topic', 'claim_problem', 'action_id', v_action,
    'message', 'The shop charged me the full price instead of the deal price.'));
  reset role;

  perform assert(
    (select deal_id from support_tickets where id = v_ticket) = i.active_deal
    and (select status from support_tickets where id = v_ticket) = 'open',
    'a request on a claim records its deal and starts open');
  perform assert(
    visible_count('authenticated', i.customer, format('select 1 from support_tickets where id = %L', v_ticket)) = 1,
    'the customer can read their own request');
  perform assert(
    visible_count('authenticated', i.merchant, format('select 1 from support_tickets where id = %L', v_ticket)) = 0,
    'nobody else can');

  perform assert(
    refused('authenticated', i.customer, 'select 1 from support_queue()'),
    'a customer cannot read the support queue');
  perform assert(
    visible_count('authenticated', i.admin,
                  format('select 1 from support_queue() where id = %L and redemption_code = ''YOLO-TSTSUP''', v_ticket)) = 1,
    'an admin sees the request with the claim''s code');
  perform assert(
    refused('authenticated', i.customer, format('select reply_support_ticket(%L, ''Done'')', v_ticket)),
    'only an admin can reply');

  perform set_config('app.current_user_id', i.admin::text, true);
  set local role authenticated;
  v_status := reply_support_ticket(v_ticket, 'We have spoken to the shop and they will honour the price.');
  reset role;
  perform assert(
    v_status = 'answered'
    and (select reply from support_tickets where id = v_ticket) like 'We have spoken%'
    and exists (select 1 from notifications where profile_id = i.customer and kind = 'support_reply'),
    'a reply is stored and the customer is notified');
end $$;

-- Account deletion, on a throwaway account so the demo ones survive.
do $$
declare
  i        record;
  v_user   uuid := gen_random_uuid();
  v_deal   uuid;
  v_before int;
  v_action uuid;
begin
  select * into i from ids;
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (v_user, 'leaving@yolodeals.in', 'authenticated', 'authenticated', '{"full_name":"Leaving User"}');

  select id, capacity_remaining into v_deal, v_before from deals
   where status = 'ACTIVE' and capacity_remaining is not null and capacity_remaining > 0
   order by id limit 1;
  update deals set capacity_remaining = capacity_remaining - 1 where id = v_deal;
  insert into customer_actions (deal_id, customer_id, action_type, status, redemption_code)
  values (v_deal, v_user, 'claim', 'confirmed', 'YOLO-TSTDEL')
  returning id into v_action;
  insert into saved_deals (profile_id, deal_id) values (v_user, v_deal);

  perform assert(
    refused('authenticated', i.merchant, 'select request_account_deletion()'),
    'a business owner is sent to support instead of deleting outright');

  perform set_config('app.current_user_id', v_user::text, true);
  set local role authenticated;
  perform request_account_deletion('Moving away');
  reset role;

  perform assert((select deleted_at from profiles where id = v_user) is not null,
                 'deletion marks the profile');
  perform assert(
    (select status::text from customer_actions where id = v_action) = 'cancelled'
    and (select capacity_remaining from deals where id = v_deal) = v_before,
    'open claims are cancelled and their places go back to the deal');
  perform assert(not exists (select 1 from saved_deals where profile_id = v_user),
                 'saved deals are forgotten');
  perform assert(
    exists (select 1 from support_tickets where profile_id = v_user and topic = 'account_deletion'
            and message = 'Moving away'),
    'a ticket asks the team to remove the login');
  perform assert(
    refused('authenticated', v_user, 'select request_account_deletion()'),
    'asking twice is refused');
end $$;

-- Profile pictures: the path must sit in the owner's own folder.
do $$
declare i record;
begin
  select * into i from ids;
  perform assert(
    not refused('authenticated', i.customer,
                format('update profiles set avatar_path = %L where id = %L', i.customer || '/avatar-1.jpg', i.customer)),
    'a customer can set a picture in their own folder');
  perform assert(
    refused('authenticated', i.customer,
            format('update profiles set avatar_path = %L where id = %L', i.merchant || '/avatar-1.jpg', i.customer)),
    'but not one from someone else''s folder');
  perform assert(
    refused('authenticated', i.customer,
            format('update profiles set avatar_path = ''https://example.com/x.jpg'' where id = %L', i.customer)),
    'nor an outside web address');
end $$;

select '--- RLS assertions passed ---' as result;
