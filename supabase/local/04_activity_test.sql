-- ============================================================================
-- Activity, consent and "not for me" (0018).
--
-- Run after 01-03 on a reset database; uses their helpers and the phone
-- account 03 made with no business (…0017).
-- ============================================================================

\set ON_ERROR_STOP on
set client_min_messages = notice;

-- A fresh customer of our own, so earlier suites' activity does not interfere.
insert into auth.users (id, phone, raw_user_meta_data)
values ('00000000-0000-4000-8000-000000000018', '919811100018', '{}');

-- ---------------------------------------------------------------------------
-- 1. Without consent nothing is learned about the person
-- ---------------------------------------------------------------------------
do $$
declare
  v_me    uuid := '00000000-0000-4000-8000-000000000018';
  v_deal  uuid := (select id from deals where title = 'Chicken Roll Combo');
  v_views int  := (select view_count from deals where title = 'Chicken Roll Combo');
  v_sess  uuid := gen_random_uuid();
  v_n     int;
begin
  perform set_config('app.current_user_id', v_me::text, false);
  v_n := track(jsonb_build_array(
    jsonb_build_object('name', 'deal_open', 'deal_id', v_deal, 'session_id', v_sess, 'surface', 'home.for_you', 'position', 2),
    jsonb_build_object('name', 'deal_open', 'deal_id', v_deal, 'session_id', v_sess),
    jsonb_build_object('name', 'made_up_event', 'deal_id', v_deal),
    jsonb_build_object('name', 'search', 'query', 'biryani under 300', 'session_id', v_sess,
                       'props', jsonb_build_object('result_count', 7, 'parser', 'rules'))));
  perform assert(v_n = 2, 'unknown events are skipped and a repeat look counts once');
  perform assert((select view_count from deals where id = v_deal) = v_views + 1, 'the shop''s view count still goes up');
  perform assert(not exists (select 1 from activity_events where profile_id = v_me),
                 'without consent nothing is tied to the person');
  perform assert(exists (select 1 from activity_events where session_id = v_sess and surface = 'home.for_you' and position = 2),
                 'the event is still counted, with where it was seen');
  perform assert(exists (select 1 from search_queries where raw_query = 'biryani under 300' and result_count = 7 and profile_id is null),
                 'searches are logged for analytics, unlinked');
  perform assert((select count(*) from my_taste()) = 0, 'and nothing is learned');
end $$;

-- ---------------------------------------------------------------------------
-- 2. With consent and 18+, activity teaches the feed
-- ---------------------------------------------------------------------------
do $$
declare
  v_me   uuid := '00000000-0000-4000-8000-000000000018';
  v_deal uuid := (select id from deals where title = 'Chicken Seekh Kebab Plate');
  v_n    int;
  i      int;
  v_big  jsonb := '[]'::jsonb;
begin
  perform set_config('app.current_user_id', v_me::text, false);
  perform set_consent('personalisation', true, 'v1', 'voice');
  perform assert((select count(*) from my_taste()) = 0, 'personalisation alone is not enough: 18+ is needed too');
  perform set_consent('adult', true);
  perform assert((select bool_and(granted) from my_consents()) and (select count(*) from my_consents()) = 2,
                 'both answers are on record');
  perform assert((select channel from my_consents() where purpose = 'personalisation') = 'voice',
                 'with how they were given');

  perform track(jsonb_build_array(jsonb_build_object('name', 'deal_open', 'deal_id', v_deal, 'session_id', gen_random_uuid())));
  perform assert(exists (select 1 from activity_events where profile_id = v_me and deal_id = v_deal),
                 'with consent the look is tied to the person');
  perform assert((select key from my_taste() where kind = 'tag' order by weight desc limit 1) is not null,
                 'and the taste learns from it');
  perform assert((select events from my_activity_summary() where name = 'deal_open') = 1,
                 'they can see what was recorded');

  for i in 1..60 loop
    v_big := v_big || jsonb_build_object('name', 'app_open');
  end loop;
  v_n := track(v_big);
  perform assert(v_n = 50, 'a call records at most 50 events');
end $$;

-- ---------------------------------------------------------------------------
-- 3. "Not for me"
-- ---------------------------------------------------------------------------
do $$
declare
  v_me   uuid := '00000000-0000-4000-8000-000000000018';
  v_deal uuid := (select id from deals where title = 'Chicken Seekh Kebab Plate');
  v_biz  uuid := (select business_id from deals where title = 'Chicken Seekh Kebab Plate');
begin
  perform set_config('app.current_user_id', v_me::text, false);
  perform not_interested(v_deal, 'business');
  perform assert(exists (select 1 from hidden_items where profile_id = v_me and kind = 'business' and target_id = v_biz),
                 '"not for me" remembers the place');
  perform assert(not exists (select 1 from feed_for_you(12.9352, 77.6245, 10000, 50) where business_id = v_biz),
                 'and For you never suggests it again');
  perform assert(not refused('authenticated', v_me, format(
    'delete from hidden_items where target_id = %L', v_biz)), 'they can take it back');
  perform assert(not exists (select 1 from hidden_items where profile_id = v_me and target_id = v_biz),
                 'and it is gone');
end $$;

-- ---------------------------------------------------------------------------
-- 4. Withdrawing consent forgets what was learned
-- ---------------------------------------------------------------------------
do $$
declare v_me uuid := '00000000-0000-4000-8000-000000000018';
begin
  perform set_config('app.current_user_id', v_me::text, false);
  perform set_consent('personalisation', false);
  perform assert(not exists (select 1 from activity_events where profile_id = v_me),
                 'saying no to personalisation erases their activity');
  perform assert(not exists (select 1 from deal_events where profile_id = v_me),
                 'and their views');
  perform assert((select count(*) from my_taste()) = 0, 'and the taste is empty again');
  perform assert((select granted from my_consents() where purpose = 'personalisation') = false,
                 'the no is on record too');
end $$;

-- ---------------------------------------------------------------------------
-- 5. Writes only through track(), reads only your own
-- ---------------------------------------------------------------------------
do $$
declare
  v_me    uuid := '00000000-0000-4000-8000-000000000018';
  v_other uuid := (select id from profiles where email = 'customer@yolodeals.in');
  v_deal  uuid := (select id from deals where status = 'ACTIVE' order by id limit 1);
begin
  perform assert(refused('anon', null, format(
    'insert into activity_events (name) values (%L)', 'app_open')), 'anon cannot write activity directly');
  perform assert(refused('authenticated', v_me, format(
    'insert into deal_events (deal_id, event_type) values (%L, %L)', v_deal, 'view')), 'nor views');
  perform assert(refused('authenticated', v_me, format(
    'insert into search_queries (raw_query, parser) values (%L, %L)', 'x', 'rules')), 'nor searches');
  perform assert(visible_count('authenticated', v_me, format(
    'select 1 from activity_events where profile_id = %L', v_other)) = 0,
    'nobody sees anyone else''s activity');
  perform assert(refused('anon', null, 'select erase_my_activity()'), 'signed-out callers cannot erase anything');
end $$;

-- ---------------------------------------------------------------------------
-- 6. Asking to delete the account erases the activity at once
-- ---------------------------------------------------------------------------
do $$
declare v_me uuid := '00000000-0000-4000-8000-000000000018';
begin
  perform set_config('app.current_user_id', v_me::text, false);
  perform set_consent('personalisation', true);
  perform track(jsonb_build_array(jsonb_build_object('name', 'app_open')));
  perform assert(exists (select 1 from activity_events where profile_id = v_me), 'activity recorded again');
  perform request_account_deletion('Testing');
  perform assert(not exists (select 1 from activity_events where profile_id = v_me),
                 'a deletion request erases it straight away');
end $$;

-- ---------------------------------------------------------------------------
-- 7. Retention
-- ---------------------------------------------------------------------------
do $$
begin
  insert into activity_events (occurred_at, name) values (now() - interval '200 days', 'app_open');
  perform purge_old_activity();
  perform assert(not exists (select 1 from activity_events where occurred_at < now() - interval '180 days'),
                 'activity older than 180 days is dropped');
end $$;

\echo '-------------------------------'
