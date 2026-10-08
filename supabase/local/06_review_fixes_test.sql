-- ============================================================================
-- Review fixes (0020): who may move deals, the needs-review mark, complete
-- deals only, photo sources, reviews, activity limits, enquiries, consent and
-- age, taste. Run after 01-05 on a reset database; it uses their helpers.
-- ============================================================================

\set ON_ERROR_STOP on
set client_min_messages = notice;

insert into auth.users (id, phone, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000021', '919811100021', '{}'),
  ('00000000-0000-4000-8000-000000000022', '919811100022', '{}'),
  ('00000000-0000-4000-8000-000000000023', '919811100023', '{}');

create temp table t20 (k text primary key, v uuid);
insert into t20 values ('biz', (select business_id from business_members
                                where profile_id = (select id from profiles where email = 'merchant@yolodeals.in')
                                limit 1));

/** A draft for a business, complete unless told otherwise, on all day. */
create function pg_temp.draft20(
  p_biz     uuid,
  p_title   text,
  p_action  text    default 'claim',
  p_hours   boolean default true,
  p_photo   text    default null,
  p_cap     int     default null
) returns uuid language plpgsql as $$
begin
  return save_deal_draft(jsonb_build_object(
    'business_id', p_biz, 'category_slug', 'lunch', 'deal_type_code', 'discount',
    'offering_kind', 'meal', 'title', p_title, 'short_description', 'Made by the 0020 tests',
    'original_price', 200, 'deal_price', 149, 'ends_at', (now() + interval '30 days')::text,
    'capacity_total', p_cap,
    'availability', case when p_hours then jsonb_build_array(
      jsonb_build_object('day_of_week', null, 'start_time', '00:00', 'end_time', '23:59')) else '[]'::jsonb end,
    'eligibility', jsonb_build_object('audience', 'everyone'),
    'media', case when p_photo is null then '[]'::jsonb
                  else jsonb_build_array(jsonb_build_object('kind', 'image', 'storage_path', p_photo)) end,
    'actions', case when p_action is null then '[]'::jsonb
                    else jsonb_build_array(jsonb_build_object('action_type', p_action, 'is_primary', true)) end));
end $$;

-- ---------------------------------------------------------------------------
-- 1. Only a person, or the server itself, moves deals
-- ---------------------------------------------------------------------------
do $$
declare
  v_deal   uuid := (select id from deals where status = 'ACTIVE' order by id limit 1);
  v_failed boolean := false;
begin
  perform assert(not has_function_privilege('anon', 'transition_deal(uuid, deal_status, actor_kind, text)', 'execute'),
    'the public key cannot move deals at all');
  perform assert(refused('anon', null, format('select transition_deal(%L, ''EXPIRED'')', v_deal)),
    'a signed-out caller cannot end someone''s deal');
  perform assert(not has_function_privilege('anon', 'record_deal_events(jsonb)', 'execute'),
    'nor send the old style of view counts');

  -- Every request through the API carries claims; without a person it is refused.
  perform act_as(null);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  begin
    perform transition_deal(v_deal, 'EXPIRED');
  exception when others then
    v_failed := true;
  end;
  perform set_config('request.jwt.claims', '', true);
  perform assert(v_failed, 'an API request with no person is never treated as the system');
  perform assert((select status from deals where id = v_deal) = 'ACTIVE', 'and the deal is still live');
  perform assert(schema_version() = 20, 'the database reports its schema version');
end $$;

-- ---------------------------------------------------------------------------
-- 2. A deal YOLO paused keeps a needs-review mark, copies included
-- ---------------------------------------------------------------------------
do $$
declare
  v_biz    uuid := (select v from t20 where k = 'biz');
  v_deal   uuid;
  v_other  uuid;
  v_copy   uuid;
  v_failed boolean := false;
begin
  perform assert((select verification_status from businesses where id = v_biz) = 'verified',
    'the demo merchant is verified');
  perform act_as('merchant@yolodeals.in');
  v_deal := pg_temp.draft20(v_biz, 'Review Mark Thali');
  perform assert(transition_deal(v_deal, 'SUBMITTED') = 'ACTIVE', 'a complete deal from a verified business goes live');
  v_other := pg_temp.draft20(v_biz, 'Review Mark Dosa');
  perform transition_deal(v_other, 'SUBMITTED');
  perform transition_deal(v_other, 'PAUSED', 'merchant', 'out of batter');

  -- Customers report both; YOLO pauses them from the reports queue.
  insert into reports (reporter_id, target_type, target_id, reason)
  select (select id from profiles where email = 'customer@yolodeals.in'), 'deal', d, 'misleading'
  from unnest(array[v_deal, v_other]) d;
  perform act_as('admin@yolodeals.in');
  perform resolve_reports('deal', v_deal, 'pause', 'The price shown is not the price charged');
  perform resolve_reports('deal', v_other, 'pause', 'The photo is of another dish');
  perform assert((select requires_review from deals where id = v_deal), 'a live deal paused from the reports queue is marked');
  perform assert((select requires_review from deals where id = v_other),
    'so is one its merchant had already paused');

  perform act_as('merchant@yolodeals.in');
  begin
    perform transition_deal(v_other, 'ACTIVE');
  exception when others then
    v_failed := true;
  end;
  perform assert(v_failed, 'its merchant cannot resume it after the reports');
  v_copy := duplicate_deal(v_deal);
  perform assert((select requires_review from deals where id = v_copy), 'a copy carries the mark');
  perform assert(transition_deal(v_copy, 'SUBMITTED') = 'SUBMITTED', 'so the copy waits for review instead of going live');
  perform assert(exists (select 1 from notifications where kind = 'review_needed'
                         and data->>'deal_id' = v_copy::text and body like '%paused or turned down%'),
    'and the admins are told why');

  perform act_as('admin@yolodeals.in');
  perform transition_deal(v_copy, 'APPROVED', 'admin');
  perform assert(not (select requires_review from deals where id = v_copy), 'YOLO approving it clears the mark');

  -- A marked deal waiting for its start date is not started by the clock.
  perform act_as(null);
  update deals set status = 'PUBLISHED', starts_at = now() - interval '1 minute' where id = v_other;
  perform activate_due_deals();
  perform assert((select status from deals where id = v_other) = 'PUBLISHED', 'the scheduler skips a marked deal');
end $$;

-- ---------------------------------------------------------------------------
-- 3. Only complete deals go out, and an ended one goes back
-- ---------------------------------------------------------------------------
do $$
declare
  v_biz    uuid := (select v from t20 where k = 'biz');
  v_new    uuid;
  v_deal   uuid;
  v_late   uuid;
  v_msg    text;
  v_loc    uuid := (select id from localities where name = 'Koramangala');
begin
  perform act_as('merchant@yolodeals.in');
  v_deal := pg_temp.draft20(v_biz, 'No Action Thali', null);
  begin
    perform transition_deal(v_deal, 'SUBMITTED');
  exception when others then
    v_msg := sqlerrm;
  end;
  perform assert(v_msg like 'Choose what customers do%', 'a deal without a claim, book or buy button is not sent');
  v_msg := null;
  v_deal := pg_temp.draft20(v_biz, 'No Hours Thali', 'claim', false);
  begin
    perform transition_deal(v_deal, 'SUBMITTED');
  exception when others then
    v_msg := sqlerrm;
  end;
  perform assert(v_msg like 'Add the days and hours%', 'nor one without its hours');

  -- A new, unverified shop: its deals wait. One passes its end date while waiting.
  perform set_config('app.current_user_id', '00000000-0000-4000-8000-000000000023', false);
  v_new := create_business(jsonb_build_object(
    'name', 'Waiting Room Cafe', 'primary_category_id', (select id from categories where slug = 'lunch'),
    'locality_id', v_loc, 'address_line', '3 Test Lane, Koramangala'));
  v_deal := pg_temp.draft20(v_new, 'Waiting Room Thali');
  v_late := pg_temp.draft20(v_new, 'Waiting Room Late Lunch');
  perform assert(transition_deal(v_deal, 'SUBMITTED') = 'SUBMITTED', 'an unverified shop''s deal waits');
  perform transition_deal(v_late, 'SUBMITTED');
  perform act_as(null);
  update deals set ends_at = now() - interval '1 hour' where id = v_late;
  update businesses set verification_status = 'verified' where id = v_new;
  perform assert((select status from deals where id = v_deal) = 'ACTIVE', 'verifying the shop puts its waiting deal live');
  perform assert((select status from deals where id = v_late) = 'SUBMITTED', 'but not one whose dates have passed');
  perform assert(publish_deal_now(v_late, 'test') = 'REJECTED', 'which goes back to its owner instead of being approved');
  perform assert(exists (select 1 from notifications where profile_id = '00000000-0000-4000-8000-000000000023'
                         and title = 'Needs new dates: Waiting Room Late Lunch'), 'who is told to set new dates');
end $$;

-- ---------------------------------------------------------------------------
-- 4. Photos only from this project's storage, in the shop's folder, or the library
-- ---------------------------------------------------------------------------
do $$
declare
  v_biz   uuid := (select v from t20 where k = 'biz');
  v_other uuid := (select id from businesses where id <> (select v from t20 where k = 'biz') order by id limit 1);
  v_base  text := 'https://abcd1234.supabase.co/storage/v1/object/public/';
  v_msg   text;
begin
  perform assert(is_allowed_photo('https://images.unsplash.com/photo-1589302168068?w=800&q=70'), 'a library photo is allowed');
  perform assert(is_allowed_photo(v_base || 'deal-photos/' || v_biz || '/a.jpg', v_biz), 'a photo in the shop''s own folder is');
  perform assert(not is_allowed_photo(v_base || 'deal-photos/' || v_other || '/a.jpg', v_biz), 'another shop''s photo is not');
  perform assert(not is_allowed_photo(v_base || 'avatars/' || v_biz || '/a.jpg', v_biz), 'nor a profile picture');
  perform assert(not is_allowed_photo(v_base || 'deal-photos/' || v_biz || '/../x.jpg', v_biz), 'nor a path that climbs out');
  perform assert(not is_allowed_photo('http://127.0.0.1:54321/storage/v1/object/public/deal-photos/' || v_biz || '/a.jpg', v_biz),
    'a local address is not allowed unless this database is that one');

  insert into app_settings (key, value) values ('storage_origin', 'http://127.0.0.1:54321');
  perform assert(is_allowed_photo('http://127.0.0.1:54321/storage/v1/object/public/deal-photos/' || v_biz || '/a.jpg', v_biz),
    'with its own address set, this project''s storage is allowed');
  perform assert(not is_allowed_photo(v_base || 'deal-photos/' || v_biz || '/a.jpg', v_biz),
    'and another project''s is not');
  delete from app_settings where key = 'storage_origin';

  perform act_as('merchant@yolodeals.in');
  begin
    perform pg_temp.draft20(v_biz, 'Tracker Photo Thali', 'claim', true, 'https://tracker.example.com/pixel.gif');
  exception when others then
    v_msg := sqlerrm;
  end;
  perform assert(v_msg like 'Use a photo uploaded to YOLO%', 'a deal photo from anywhere else is refused');
  perform assert(pg_temp.draft20(v_biz, 'Own Photo Thali', 'claim', true, v_base || 'deal-photos/' || v_biz || '/t.jpg') is not null,
    'a deal photo from the shop''s folder is saved');
end $$;

-- ---------------------------------------------------------------------------
-- 5. Reviews: not by the business's own team; hidden ones stay hidden
-- ---------------------------------------------------------------------------
do $$
declare
  v_biz    uuid := (select v from t20 where k = 'biz');
  v_deal   uuid;
  v_action customer_actions;
  v_review uuid;
  v_msg    text;
  v_cust   uuid := (select id from profiles where email = 'customer@yolodeals.in');
begin
  perform act_as('merchant@yolodeals.in');
  v_deal := pg_temp.draft20(v_biz, 'Review Test Meals');
  perform transition_deal(v_deal, 'SUBMITTED');
  v_action := take_deal_action(v_deal, 'claim', 1, null, '{}');
  perform redeem_action(v_action.redemption_code);
  begin
    perform create_review(v_action.id, 5, 'Best in town');
  exception when others then
    v_msg := sqlerrm;
  end;
  perform assert(v_msg like 'You cannot review your own business%', 'a merchant cannot review their own deal');

  perform act_as('customer@yolodeals.in');
  v_action := take_deal_action(v_deal, 'claim', 1, null, '{}');
  perform act_as('merchant@yolodeals.in');
  perform redeem_action(v_action.redemption_code);
  perform act_as('customer@yolodeals.in');
  select id into v_review from create_review(v_action.id, 2, 'Cold food');
  perform assert(exists (select 1 from list_reviews(null, v_deal) where id = v_review), 'a customer''s review shows');

  perform assert(refused('authenticated', v_cust, 'select * from reviews'), 'the reviews table is not read directly');
  perform assert(refused('anon', null, 'select * from reviews'), 'not even signed out');

  update reviews set status = 'hidden' where id = v_review;
  perform act_as('customer@yolodeals.in');
  perform assert(not exists (select 1 from list_reviews(null, v_deal) where id = v_review),
    'a hidden review is not on the deal, even for its author');
  perform assert(exists (select 1 from my_reviews() where id = v_review), 'only in their own list');
end $$;

-- ---------------------------------------------------------------------------
-- 6. Activity: a session when signed out, live deals only, a limit per address
-- ---------------------------------------------------------------------------
do $$
declare
  v_live  uuid := (select id from deals where status = 'ACTIVE' order by id limit 1);
  v_draft uuid := (select id from deals where status = 'DRAFT' order by id limit 1);
  v_s     uuid := gen_random_uuid();
begin
  perform act_as(null);
  perform assert(track(jsonb_build_array(jsonb_build_object('name', 'deal_open', 'deal_id', v_live))) = 0,
    'signed out, an event without its session is not recorded');
  perform assert(track(jsonb_build_array(jsonb_build_object('name', 'deal_open', 'deal_id', v_live, 'session_id', v_s))) = 1,
    'with its session it is');
  perform track(jsonb_build_array(jsonb_build_object('name', 'deal_open', 'deal_id', v_draft, 'session_id', v_s)));
  perform assert(not exists (select 1 from activity_events where deal_id = v_draft),
    'opening a deal that is not live counts for nothing');

  perform set_config('request.headers', '{"x-forwarded-for": "203.0.113.9, 10.0.0.1"}', true);
  insert into rate_buckets (key, bucket_start, hits)
  values ('track:' || md5('203.0.113.9'),
          to_timestamp(floor(extract(epoch from now()) / 60) * 60), 600);
  perform assert(track(jsonb_build_array(jsonb_build_object('name', 'app_open', 'session_id', gen_random_uuid()))) = 0,
    'one network address sending too much is ignored, whatever session it claims');
  perform set_config('request.headers', '{"x-forwarded-for": "198.51.100.4"}', true);
  perform assert(track(jsonb_build_array(jsonb_build_object('name', 'app_open', 'session_id', gen_random_uuid()))) = 1,
    'another address is not');
  perform set_config('request.headers', '', true);
  perform assert(refused('authenticated', (select id from profiles where email = 'customer@yolodeals.in'),
    'select bump_rate(''x'', 1, interval ''1 minute'')'), 'nobody can fill another address''s allowance');
end $$;

-- ---------------------------------------------------------------------------
-- 7. One open enquiry per deal, and questions take no stock
-- ---------------------------------------------------------------------------
do $$
declare
  v_biz    uuid := (select v from t20 where k = 'biz');
  v_deal   uuid;
  v_action customer_actions;
  v_msg    text;
begin
  perform act_as('merchant@yolodeals.in');
  v_deal := pg_temp.draft20(v_biz, 'Enquiry Test Catering', 'enquire', true, null, 5);
  perform transition_deal(v_deal, 'SUBMITTED');

  perform set_config('app.current_user_id', '00000000-0000-4000-8000-000000000021', false);
  v_action := take_deal_action(v_deal, 'enquiry', 1, null, '{"message": "Do you cater for 40?"}');
  perform assert((select capacity_remaining from deals where id = v_deal) = 5, 'a question takes nothing from what is left');
  begin
    perform take_deal_action(v_deal, 'enquiry', 1, null, '{"message": "Hello?"}');
  exception when others then
    v_msg := sqlerrm;
  end;
  perform assert(v_msg like 'you have already asked%', 'a second question waits for the first answer');
  perform cancel_action(v_action.id);
  perform assert((select capacity_remaining from deals where id = v_deal) = 5, 'and withdrawing it gives nothing back');
end $$;

-- ---------------------------------------------------------------------------
-- 8. Consent and age: "not for me" stays; a date of birth under 18 erases
-- ---------------------------------------------------------------------------
do $$
declare
  v_me   uuid := '00000000-0000-4000-8000-000000000022';
  v_live uuid := (select id from deals where status = 'ACTIVE' order by id desc limit 1);
begin
  perform set_config('app.current_user_id', v_me::text, false);
  perform set_consent('adult', true);
  perform set_consent('personalisation', true);
  perform track(jsonb_build_array(jsonb_build_object('name', 'deal_open', 'deal_id', v_live)));
  perform not_interested(v_live);
  perform assert(exists (select 1 from activity_events where profile_id = v_me), 'with consent, activity is linked');

  perform set_consent('personalisation', false);
  perform assert(not exists (select 1 from activity_events where profile_id = v_me), 'withdrawing consent erases it');
  perform assert(exists (select 1 from hidden_items where profile_id = v_me), 'but "not for me" stays: it is an instruction');

  perform set_consent('personalisation', true);
  perform track(jsonb_build_array(jsonb_build_object('name', 'search', 'query', 'biryani')));
  perform assert(exists (select 1 from activity_events where profile_id = v_me), 'learning again after agreeing again');
  update profiles set date_of_birth = current_date - interval '16 years' where id = v_me;
  perform assert(not exists (select 1 from activity_events where profile_id = v_me),
    'a date of birth under 18 erases what was learned');
  perform assert(not has_consent(v_me, 'adult'), 'and records that they are not an adult');
  perform assert(not may_personalise(v_me), 'so nothing more is learned');

  perform act_as(null);
  update profiles set deleted_at = now() where id = v_me;
  perform assert(not exists (select 1 from hidden_items where profile_id = v_me), 'deleting the account removes everything');
end $$;

-- ---------------------------------------------------------------------------
-- 9. Taste learns from shop pages opened and words searched
-- ---------------------------------------------------------------------------
do $$
declare
  v_me  uuid := '00000000-0000-4000-8000-000000000021';
  v_biz uuid := (select b.id from businesses b
                 where b.primary_category_id is not null
                   and b.id <> (select v from t20 where k = 'biz')
                 order by b.id limit 1);
  v_cat text := (select c.slug from categories c join businesses b on b.primary_category_id = c.id where b.id = v_biz);
  v_tag text := (select slug from tags where slug ~ '^[a-z]{4,}$' order by slug limit 1);
begin
  perform set_config('app.current_user_id', v_me::text, false);
  perform set_consent('adult', true);
  perform set_consent('personalisation', true);
  perform track(jsonb_build_array(
    jsonb_build_object('name', 'shop_open', 'business_id', v_biz),
    jsonb_build_object('name', 'search', 'query', 'cheap ' || v_tag || ' near me')));
  perform assert(exists (select 1 from my_taste() where kind = 'category' and key = v_cat),
    'a shop page opened counts towards that kind of place');
  perform assert(exists (select 1 from my_taste() where kind = 'tag' and key = v_tag),
    'a word searched for counts when deals are tagged with it');
end $$;

-- ---------------------------------------------------------------------------
-- 10. Settings stay on the server
-- ---------------------------------------------------------------------------
do $$
begin
  perform assert(refused('authenticated', (select id from profiles where email = 'customer@yolodeals.in'),
    'select * from app_settings'), 'app settings are not readable from the app');
  perform assert(refused('anon', null, 'select deal_publish_problem(gen_random_uuid())'),
    'internal checks are not callable from the app');
  perform assert(not is_production(), 'a new database is not marked as production');
  insert into app_settings (key, value) values ('environment', 'production');
  perform assert(is_production(), 'until the owner marks it');
  delete from app_settings where key = 'environment';
end $$;

\echo '-------------------------------'
