-- ============================================================================
-- Production core (0016): shop details, go-live, order alerts, payment guard,
-- reviews, shop filters and hardening.
--
-- Run after 01_smoke_test.sql and 02_rls_test.sql on a reset database; it
-- uses their assert(), act_as() and refused() helpers.
-- ============================================================================

\set ON_ERROR_STOP on
set client_min_messages = notice;

-- A new merchant who signed up by phone, as Supabase Auth would make one.
insert into auth.users (id, phone, raw_user_meta_data)
values ('00000000-0000-4000-8000-000000000016', '919811100016', '{}');

create temp table t16 (k text primary key, v uuid);

-- ---------------------------------------------------------------------------
-- 1. Shop details and the pinned location
-- ---------------------------------------------------------------------------
do $$
declare
  v_biz uuid;
  v_loc uuid;
  v_cat uuid;
  v_lat double precision;
  v_lng double precision;
  v_b   record;
  v_failed boolean := false;
begin
  perform assert((select phone from profiles where id = '00000000-0000-4000-8000-000000000016') = '+919811100016',
                 'a phone sign-up gets a profile with its number');
  perform set_config('app.current_user_id', '00000000-0000-4000-8000-000000000016', false);
  select id, st_y(centroid::geometry), st_x(centroid::geometry) into v_loc, v_lat, v_lng
    from localities where name = 'Koramangala';
  select id into v_cat from categories where slug = 'lunch';

  v_biz := create_business(jsonb_build_object(
    'name', 'Test Tiffin Room', 'primary_category_id', v_cat, 'locality_id', v_loc,
    'address_line', '12 Test Street, Koramangala', 'phone', '+91 98111 00016',
    'lat', v_lat + 0.002, 'lng', v_lng + 0.001,
    'description', 'South Indian tiffin since 1998.',
    'keywords', jsonb_build_array('Dosa', 'idli', 'x'),
    'owner_role', 'Owner',
    'cost_for_two', 300,
    'amenities', jsonb_build_array('pure_veg', 'parking', 'jacuzzi'),
    'cuisines', jsonb_build_array('South Indian'),
    'open_time', '07:00', 'close_time', '22:30',
    'photos', jsonb_build_array('https://images.unsplash.com/photo-1589302168068?w=800', 'blob:device-only'),
    'menu', jsonb_build_array(
      jsonb_build_object('name', 'Masala Dosa', 'price', 90, 'veg', true),
      jsonb_build_object('name', ''))));
  insert into t16 values ('biz', v_biz);

  select * into v_b from get_business(v_biz);
  perform assert(v_b.description = 'South Indian tiffin since 1998.', 'the description is stored');
  perform assert(v_b.cost_for_two = 300, 'cost for two is stored');
  perform assert('pure_veg' = any (v_b.amenities) and 'parking' = any (v_b.amenities)
                 and cardinality(v_b.amenities) = 2, 'only known amenities are kept');
  perform assert(v_b.keywords @> array['dosa', 'idli'] and not 'x' = any (v_b.keywords),
                 'keywords are lower-cased and too-short ones dropped');
  perform assert(v_b.open_time = '07:00' and v_b.close_time = '22:30', 'hours are stored');
  perform assert(v_b.photos = array['https://images.unsplash.com/photo-1589302168068?w=800'], 'a device-only photo is dropped');
  perform assert(jsonb_array_length(v_b.menu) = 1 and v_b.menu->0->>'name' = 'Masala Dosa',
                 'menu items without a name are dropped');
  perform assert(abs(v_b.lat - (v_lat + 0.002)) < 0.000001 and abs(v_b.lng - (v_lng + 0.001)) < 0.000001,
                 'the business sits at its pin, not the area centre');

  begin
    perform update_business(v_biz, jsonb_build_object(
      'name', 'Test Tiffin Room', 'locality_id', v_loc, 'address_line', '12 Test Street, Koramangala',
      'cost_for_two', 'lots'));
  exception when others then
    v_failed := true;
  end;
  perform assert(v_failed, 'a cost for two that is not a number is refused');

  perform update_business(v_biz, jsonb_build_object(
    'name', 'Test Tiffin Room', 'locality_id', v_loc, 'address_line', '12 Test Street, Koramangala',
    'cost_for_two', 350, 'lat', v_lat + 0.003, 'lng', v_lng));
  select * into v_b from get_business(v_biz);
  perform assert(v_b.cost_for_two = 350, 'an edit changes cost for two');
  perform assert(v_b.description = 'South Indian tiffin since 1998.', 'a field left out of an edit is kept');
  perform assert(abs(v_b.lat - (v_lat + 0.003)) < 0.000001, 'a new pin moves the business');
end $$;

-- ---------------------------------------------------------------------------
-- 2. Go-live: an unverified business waits for review, then goes live together
-- ---------------------------------------------------------------------------
do $$
declare
  v_biz  uuid := (select v from t16 where k = 'biz');
  v_deal uuid;
  v_admin_alerts int := (select count(*) from notifications where kind = 'review_needed');
begin
  perform set_config('app.current_user_id', '00000000-0000-4000-8000-000000000016', false);
  v_deal := save_deal_draft(jsonb_build_object(
    'business_id', v_biz, 'category_slug', 'lunch', 'deal_type_code', 'discount',
    'offering_kind', 'meal', 'title', 'Tiffin Test Thali', 'short_description', 'Made by 0016 tests',
    'original_price', 200, 'deal_price', 149, 'ends_at', (now() + interval '30 days')::text,
    'availability', jsonb_build_array(
      jsonb_build_object('day_of_week', null, 'start_time', '00:00', 'end_time', '23:59')),
    'eligibility', jsonb_build_object('audience', 'everyone'),
    'actions', jsonb_build_array(jsonb_build_object('action_type', 'claim', 'is_primary', true))));
  insert into t16 values ('deal', v_deal);

  perform assert(transition_deal(v_deal, 'SUBMITTED') = 'SUBMITTED',
                 'an unverified business''s deal waits for review');
  perform assert((select count(*) from notifications where kind = 'review_needed') > v_admin_alerts,
                 'the admins are told a deal is waiting');

  -- YOLO verifies the business: its waiting deals go live together.
  perform set_config('app.current_user_id', '', false);
  update businesses set verification_status = 'verified' where id = v_biz;
  perform assert((select status from deals where id = v_deal) = 'ACTIVE',
                 'verifying the business puts its waiting deal live');
  perform assert(exists (select 1 from notifications
                         where profile_id = '00000000-0000-4000-8000-000000000016'
                           and kind = 'deal_approved' and title like 'Live now:%'),
                 'the owner hears it is live');
end $$;

-- ---------------------------------------------------------------------------
-- 3. Orders: payment guard, alerts both ways, rate-your-visit
-- ---------------------------------------------------------------------------
do $$
declare
  v_deal   uuid := (select v from t16 where k = 'deal');
  v_action customer_actions;
  v_me     uuid;
begin
  v_me := act_as('customer@yolodeals.in');
  v_action := take_deal_action(v_deal, 'claim', 1, null,
    jsonb_build_object('note', 'kept', 'payment', jsonb_build_object('status', 'paid', 'amount', 1)));
  insert into t16 values ('action', v_action.id);
  perform assert(not (v_action.payload ? 'payment'), 'a client cannot mark its own order paid');
  perform assert(v_action.payload->>'note' = 'kept', 'the rest of the payload is kept');
  perform assert(exists (select 1 from notifications
                         where profile_id = '00000000-0000-4000-8000-000000000016'
                           and kind = 'new_claim' and title = 'New order: Tiffin Test Thali'),
                 'the merchant hears about the new order');
  perform assert(exists (select 1 from notifications
                         where profile_id = v_me and kind = 'action_confirmed'
                           and body like '%' || v_action.redemption_code || '%'),
                 'the customer gets the confirmation with their code');

  -- Not rateable before the visit.
  begin
    perform create_review(v_action.id, 5, 'Too early');
    perform assert(false, 'a review before the visit is refused');
  exception when others then
    perform assert(sqlerrm like '%once your code has been used%', 'a review before the visit is refused');
  end;

  perform set_config('app.current_user_id', '00000000-0000-4000-8000-000000000016', false);
  perform redeem_action(v_action.redemption_code);
  perform assert(exists (select 1 from notifications
                         where profile_id = v_me and kind = 'rate_visit'
                           and data->>'action_id' = v_action.id::text),
                 'using the code asks the customer to rate the visit');
end $$;

-- ---------------------------------------------------------------------------
-- 4. Reviews
-- ---------------------------------------------------------------------------
do $$
declare
  v_action uuid := (select v from t16 where k = 'action');
  v_deal   uuid := (select v from t16 where k = 'deal');
  v_biz    uuid := (select v from t16 where k = 'biz');
  v_r      record;
begin
  perform act_as('customer@yolodeals.in');
  select * into v_r from create_review(v_action, 4, 'Crisp dosa, quick service.');
  perform assert(v_r.rating = 4 and v_r.deal_title = 'Tiffin Test Thali', 'a visit can be rated once used');
  perform assert(v_r.customer_name = 'Demo C.', 'reviews show a first name and initial');
  perform assert((select rating_avg from deals where id = v_deal) = 4
                 and (select rating_count from deals where id = v_deal) = 1, 'the deal''s rating updates');
  perform assert((select rating_avg from businesses where id = v_biz) = 4, 'the business''s rating updates');
  perform assert(exists (select 1 from notifications
                         where profile_id = '00000000-0000-4000-8000-000000000016' and kind = 'new_review'),
                 'the merchant hears about the review');

  begin
    perform create_review(v_action, 5, 'Again');
    perform assert(false, 'one review per deal');
  exception when others then
    perform assert(sqlerrm like '%already rated%', 'one review per deal');
  end;

  -- The reviews stay after the deal ends.
  perform set_config('app.current_user_id', '', false);
  update deals set status = 'EXPIRED' where id = v_deal;
  perform act_as(null);
  select * into v_r from list_reviews(v_biz, null, 10);
  perform assert(v_r.body = 'Crisp dosa, quick service.', 'reviews stay on the shop page after the deal ends');
  perform assert(v_r.customer_id is null, 'other people''s account ids are not shown');
  perform act_as('customer@yolodeals.in');
  perform assert((select count(*) from my_reviews()) >= 1, 'a customer sees their own reviews');
end $$;

-- Direct writes are closed: reviews go through create_review only.
do $$
declare
  v_me   uuid := (select id from profiles where email = 'customer@yolodeals.in');
  v_deal uuid := (select id from deals where status = 'ACTIVE' order by id limit 1);
begin
  perform assert(refused('authenticated', v_me, format(
    'insert into reviews (deal_id, customer_id, rating) values (%L, %L, 5)', v_deal, v_me)),
    'a signed-in customer cannot write a review straight into the table');
  perform assert(refused('authenticated', v_me,
    'update reviews set status = ''visible'''),
    'nor change one');
end $$;

-- ---------------------------------------------------------------------------
-- 5. Search by amenities and cost for two
-- ---------------------------------------------------------------------------
do $$
declare
  v_biz  uuid := (select v from t16 where k = 'biz');
  v_deal uuid := (select v from t16 where k = 'deal');
  v_lat  double precision;
  v_lng  double precision;
  v_n    int;
begin
  perform set_config('app.current_user_id', '', false);
  update deals set status = 'ACTIVE' where id = v_deal;
  select st_y(centroid::geometry), st_x(centroid::geometry) into v_lat, v_lng
    from localities where name = 'Koramangala';
  perform act_as(null);

  select count(*) into v_n from search_deals(
    jsonb_build_object('amenities', jsonb_build_array('pure_veg', 'parking'), 'radius_km', 10), v_lat, v_lng, 100, 0);
  perform assert(v_n >= 1 and not exists (
      select 1 from search_deals(jsonb_build_object('amenities', jsonb_build_array('pure_veg', 'parking'), 'radius_km', 10),
                                 v_lat, v_lng, 100, 0) s
      join businesses b on b.id = s.business_id
      where not (b.amenities @> array['pure_veg', 'parking'])),
    'an amenity filter keeps only places that have them all');
  perform assert(exists (select 1 from search_deals(
      jsonb_build_object('amenities', jsonb_build_array('pure_veg')), v_lat, v_lng, 100, 0) where id = v_deal),
    'the pure veg place is found');
  perform assert(not exists (select 1 from search_deals(
      jsonb_build_object('max_cost_for_two', 300), v_lat, v_lng, 100, 0) where id = v_deal),
    'a place costing 350 for two is left out of "under 300 for two"');
  perform assert(exists (select 1 from search_deals(
      jsonb_build_object('max_cost_for_two', 400), v_lat, v_lng, 100, 0) where id = v_deal),
    'and kept under 400');
end $$;

-- ---------------------------------------------------------------------------
-- 6. A deal YOLO paused after reports goes back through review
-- ---------------------------------------------------------------------------
do $$
declare
  v_deal uuid := (select v from t16 where k = 'deal');
  v_copy uuid;
  v_failed boolean := false;
begin
  perform act_as('admin@yolodeals.in');
  perform transition_deal(v_deal, 'PAUSED', 'admin', 'Reported as misleading');

  perform set_config('app.current_user_id', '00000000-0000-4000-8000-000000000016', false);
  begin
    perform transition_deal(v_deal, 'ACTIVE');
  exception when others then
    v_failed := true;
  end;
  perform assert(v_failed, 'the merchant cannot simply resume a deal YOLO paused');
  v_failed := false;
  begin
    perform transition_deal(v_deal, 'DRAFT');
  exception when others then
    v_failed := true;
  end;
  perform assert(v_failed, 'nor take it back to draft, which would reset what is left');
  v_copy := duplicate_deal(v_deal);
  perform assert(transition_deal(v_copy, 'SUBMITTED') = 'SUBMITTED',
                 'a copy, once fixed and sent, waits for review, verified business or not');
end $$;

-- ---------------------------------------------------------------------------
-- 7. Shop pages respect the age gate
-- ---------------------------------------------------------------------------
do $$
declare
  v_deal uuid := (select d.id from deals d join deal_eligibility e on e.deal_id = d.id
                  where d.status = 'ACTIVE' and e.min_age = 21 order by d.id limit 1);
  v_biz  uuid;
begin
  if v_deal is null then
    raise notice 'NOTE  no live 21+ deal in the seed; age gate test skipped';
    return;
  end if;
  select business_id into v_biz from deals where id = v_deal;
  perform act_as(null);
  perform assert(not exists (select 1 from shop_deals(v_biz) where id = v_deal),
                 'a signed-out visitor does not see 21+ deals on a shop page');
  perform act_as('customer@yolodeals.in');
  perform assert(exists (select 1 from shop_deals(v_biz, 12.93, 77.62) where id = v_deal),
                 'an adult customer does');
  perform assert((select distance_km from shop_deals(v_biz, 12.93, 77.62) where id = v_deal) > 0,
                 'and sees how far it is');
end $$;

-- ---------------------------------------------------------------------------
-- 8. Hardening
-- ---------------------------------------------------------------------------
do $$
declare
  v_me  uuid := (select id from profiles where email = 'customer@yolodeals.in');
  v_tbl text := 'deal_events_' || to_char(now(), 'YYYY_MM');
begin
  perform assert(refused('authenticated', v_me, format(
    'insert into profiles (id, is_admin) values (%L, true)', gen_random_uuid())),
    'a client cannot insert a profile, so cannot make itself admin');
  perform assert(refused('anon', null, format('select * from %I', v_tbl)),
    'anon cannot read raw activity through a partition');
  perform assert(refused('authenticated', v_me, format('delete from %I', v_tbl)),
    'nor can a signed-in user change it');
  perform assert(refused('authenticated', (select id from profiles where email = 'merchant@yolodeals.in'),
    format('update deal_media set storage_path = %L', 'https://example.com/swap.jpg')),
    'a merchant cannot swap a live deal''s photo outside the draft flow');
  perform assert(refused('authenticated', (select id from profiles where email = 'merchant@yolodeals.in'),
    'delete from deal_eligibility'),
    'nor change who it is for');
  perform assert(refused('authenticated', v_me, 'update profiles set deleted_at = null'),
    'nobody can clear the deletion mark on their own account');
  perform ensure_event_partitions();
  perform assert((select bool_and(c.relrowsecurity) from pg_inherits i
                  join pg_class c on c.oid = i.inhrelid
                  join pg_class p on p.oid = i.inhparent where p.relname = 'deal_events'),
    'every activity partition has row-level security on');
end $$;

-- ---------------------------------------------------------------------------
-- 9. The voice assistant's daily allowance (0017)
-- ---------------------------------------------------------------------------
do $$
declare
  v_me  uuid := (select id from profiles where email = 'customer@yolodeals.in');
  v_ok  boolean;
  i     int;
begin
  perform assert(refused('anon', null, 'select use_voice_quota(''customer'')'),
    'a signed-out caller cannot use the voice assistant');
  -- A customer with no business (the smoke test made the demo customer an owner).
  insert into auth.users (id, phone, raw_user_meta_data)
  values ('00000000-0000-4000-8000-000000000017', '919811100017', '{}');
  perform set_config('app.current_user_id', '00000000-0000-4000-8000-000000000017', false);
  v_me := '00000000-0000-4000-8000-000000000017';
  perform assert(use_voice_quota('customer'), 'a customer may use it');
  begin
    perform use_voice_quota('deal');
    perform assert(false, 'deal drafting by voice is for businesses');
  exception when others then
    perform assert(sqlerrm like '%Only a business%', 'deal drafting by voice is for businesses');
  end;
  for i in 1..10 loop
    v_ok := use_voice_quota('merchant');
  end loop;
  perform assert(v_ok, 'ten business descriptions a day are allowed');
  perform assert(not use_voice_quota('merchant'), 'the eleventh is refused');
  perform assert((select uses from voice_usage where profile_id = v_me and task = 'merchant') = 11,
    'each use is counted');
  perform assert(refused('authenticated', v_me, 'update voice_usage set uses = 0'),
    'nobody can reset their own count');
  perform act_as('merchant@yolodeals.in');
  perform assert(use_voice_quota('deal'), 'a merchant may draft deals by voice');
end $$;

\echo '-------------------------------'
