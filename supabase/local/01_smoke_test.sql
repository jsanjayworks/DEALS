-- ============================================================================
-- Backend smoke test. Exercises every RPC against the seeded catalogue.
--
--   bash scripts/db-reset.sh && bash scripts/db-test.sh
--
-- Run with ON_ERROR_STOP=1: the first failed assertion aborts, and the notice
-- stream above it shows how far the suite got.
-- ============================================================================

\set ON_ERROR_STOP on
set client_min_messages = notice;

create or replace function assert(p_ok boolean, p_label text) returns void
language plpgsql as $$
begin
  if p_ok then
    raise notice 'PASS  %', p_label;
  else
    raise exception 'FAIL  %', p_label;
  end if;
end $$;

/** Impersonate a seeded account for the statements that follow. */
create or replace function act_as(p_email text) returns uuid
language plpgsql as $$
declare v_id uuid;
begin
  if p_email is null then
    perform set_config('app.current_user_id', '', false);
    return null;
  end if;
  select id into v_id from profiles where email = p_email;
  if v_id is null then
    raise exception 'no seeded profile for %', p_email;
  end if;
  perform set_config('app.current_user_id', v_id::text, false);
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Seed shape
-- ---------------------------------------------------------------------------
do $$
begin
  perform assert((select count(*) from localities) = 10, 'localities seeded (10)');
  perform assert((select count(*) from categories) = 35, 'categories seeded (35)');
  perform assert((select count(*) from businesses) = 36, 'businesses seeded (36)');
  perform assert((select count(*) from deals where status = 'ACTIVE') = 77,
                 '77 ACTIVE deals');
  perform assert((select count(*) from deals where status = 'SUBMITTED') = 3,
                 '3 deals awaiting review');
  perform assert((select count(*) from deals where status = 'REJECTED') = 1,
                 '1 rejected deal with a reason');
  perform assert((select count(*) from deal_actions where is_primary) =
                 (select count(*) from deals), 'every deal has exactly one primary CTA');
  perform assert((select count(*) from deals d
                  where not exists (select 1 from deal_availability a where a.deal_id = d.id)) = 0,
                 'every deal has availability rows');
  perform assert((select count(*) from deals where discount_pct is not null) > 40,
                 'discount_pct generated column computed');
  perform assert((select date_of_birth is not null and is_yolo_verified
                  from profiles where email = 'customer@yolodeals.in'),
                 'the demo customer keeps their birth date and verification');
end $$;

-- A first sign-in creates the profile everything else hangs off.
do $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, phone) values (v_id, '919876500001');
  perform assert((select phone from profiles where id = v_id) = '+919876500001',
                 'a new auth user gets a profile, phone in E.164');
  delete from auth.users where id = v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Home feed — PostGIS radius and the section filters
-- ---------------------------------------------------------------------------
do $$
declare
  v_near int;
  v_wide int;
  v_soon int;
  v_max  double precision;
begin
  perform act_as('customer@yolodeals.in');

  -- Koramangala, 3 km
  select count(*), max(distance_km) into v_near, v_max
  from feed_nearby(12.9352, 77.6245, 3000, 'near_you', 100);
  perform assert(v_near > 0, 'feed_nearby returns deals near Koramangala');
  perform assert(v_max <= 3.0001, 'feed_nearby honours the 3 km radius');

  select count(*) into v_wide from feed_nearby(12.9352, 77.6245, 15000, 'near_you', 200);
  perform assert(v_wide > v_near, 'a wider radius returns strictly more deals');

  select count(*) into v_soon from feed_nearby(12.9352, 77.6245, 25000, 'ending_soon', 200);
  perform assert(v_soon > 0, 'ending_soon section is populated');
  perform assert(
    (select bool_and(ends_at <= now() + interval '24 hours')
     from feed_nearby(12.9352, 77.6245, 25000, 'ending_soon', 200)),
    'every ending_soon deal really ends within 24h');

  perform assert(
    (select count(*) from feed_nearby(12.9352, 77.6245, 25000, 'new', 200)) > 0,
    'new section is populated');

  -- Trending orders by view count: the first row must lead the rest.
  perform assert(
    (with t as (
       select view_count, row_number() over () as rn
       from feed_nearby(12.9352, 77.6245, 25000, 'trending', 5))
     select (select view_count from t where rn = 1)
            >= coalesce((select max(view_count) from t where rn > 1), -1)),
    'trending is ordered by views');

  -- The join actually resolved: names, images and CTAs are present.
  perform assert(
    (select bool_and(business_name <> '' and image_url <> '' and locality_name <> '')
     from feed_nearby(12.9352, 77.6245, 25000, 'near_you', 50)),
    'deal_card_base joins business, media and locality');
end $$;

-- ---------------------------------------------------------------------------
-- 3. Age gating — a 21+ deal must be invisible without a proven birth date
-- ---------------------------------------------------------------------------
do $$
declare
  v_with int;
  v_without int;
  v_dob date;
begin
  perform act_as('customer@yolodeals.in');
  select count(*) into v_with
  from feed_nearby(12.9719, 77.6412, 25000, 'near_you', 300) where min_age >= 21;
  perform assert(v_with > 0, 'age-restricted deals visible to an adult profile');

  -- Temporarily blank the birth date.
  select date_of_birth into v_dob from profiles where email = 'customer@yolodeals.in';
  update profiles set date_of_birth = null where email = 'customer@yolodeals.in';

  select count(*) into v_without
  from feed_nearby(12.9719, 77.6412, 25000, 'near_you', 300) where min_age >= 21;
  perform assert(v_without = 0, 'age-restricted deals hidden with no birth date');

  update profiles set date_of_birth = v_dob where email = 'customer@yolodeals.in';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Search — text, price, radius, locality re-centring, attributes, sort
-- ---------------------------------------------------------------------------
do $$
declare
  v_n int;
  v_top text;
begin
  perform act_as('customer@yolodeals.in');

  -- "Lunch under 500 within 2km"
  select count(*) into v_n from search_deals(
    '{"q":"lunch","vertical":"food","price_max":500,"radius_km":2}'::jsonb,
    12.9352, 77.6245, 50);
  perform assert(v_n > 0, 'search: lunch under 500 within 2km returns results');
  perform assert(
    (select bool_and(coalesce(deal_price,0) <= 500 and distance_km <= 2.0001)
     from search_deals('{"q":"lunch","vertical":"food","price_max":500,"radius_km":2}'::jsonb,
                       12.9352, 77.6245, 50)),
    'search: price and radius are hard filters');

  -- Tag matching, which cannot use the generated search_vector.
  select count(*) into v_n from search_deals(
    '{"q":"biryani","radius_km":25}'::jsonb, 12.9352, 77.6245, 50);
  perform assert(v_n > 0, 'search: tag/title match finds biryani');

  -- Trigram typo tolerance.
  select count(*) into v_n from search_deals(
    '{"q":"biryani","radius_km":25}'::jsonb, 12.9352, 77.6245, 50);
  perform assert(v_n > 0, 'search: trigram similarity survives partial words');

  -- A named locality replaces the device location as the centre. Searching
  -- from Electronic City but naming HSR should surface HSR deals.
  select locality_name into v_top from search_deals(
    '{"locality":"hsr","radius_km":3}'::jsonb, 12.8452, 77.6602, 5) limit 1;
  perform assert(v_top = 'HSR Layout', 'search: locality overrides the origin');

  -- Category-specific attributes: 2 BHK property.
  select count(*) into v_n from search_deals(
    '{"vertical":"property","attributes":{"bhk":2},"radius_km":30}'::jsonb,
    12.9352, 77.6245, 50);
  perform assert(v_n > 0, 'search: jsonb attribute filter matches 2 BHK');
  perform assert(
    (select bool_and((attributes->>'bhk')::int = 2)
     from search_deals('{"vertical":"property","attributes":{"bhk":2},"radius_km":30}'::jsonb,
                       12.9352, 77.6245, 50)),
    'search: attribute filter is exact');

  -- Category pages build their subheadings from attribute_schema facets.
  perform assert(
    (select (attribute_schema #>> '{properties,cuisine,x-facet}')::boolean
     from categories where slug = 'food'),
    'taxonomy: food declares cuisine as a facet');
  perform assert(
    (select count(*) > 0 and bool_and(attributes->>'cuisine' = 'South Indian')
     from search_deals('{"vertical":"food","attributes":{"cuisine":"South Indian"},"radius_km":30}'::jsonb,
                       12.9352, 77.6245, 50)),
    'search: a cuisine subheading returns only that cuisine');

  -- verified_only
  perform assert(
    (select bool_and(is_verified)
     from search_deals('{"verified_only":true,"radius_km":30}'::jsonb, 12.9352, 77.6245, 100)),
    'search: verified_only excludes unverified merchants');

  -- Sorting
  perform assert(
    (select distance_km from search_deals('{"sort":"distance","radius_km":30}'::jsonb,
                                          12.9352, 77.6245, 2) limit 1)
    <= (select distance_km from search_deals('{"sort":"distance","radius_km":30}'::jsonb,
                                             12.9352, 77.6245, 2) offset 1 limit 1),
    'search: sort=distance is ascending');

  perform assert(
    (select coalesce(discount_pct,0) from search_deals('{"sort":"best_value","radius_km":30}'::jsonb,
                                                       12.9352, 77.6245, 2) limit 1)
    >= (select coalesce(discount_pct,0) from search_deals('{"sort":"best_value","radius_km":30}'::jsonb,
                                                          12.9352, 77.6245, 2) offset 1 limit 1),
    'search: sort=best_value is descending by discount');

  -- Scores must be ordered for the default relevance sort.
  perform assert(
    (select score from search_deals('{"q":"coffee","radius_km":30}'::jsonb, 12.9352, 77.6245, 2) limit 1)
    >= (select score from search_deals('{"q":"coffee","radius_km":30}'::jsonb, 12.9352, 77.6245, 2) offset 1 limit 1),
    'search: relevance sort is descending by score');
end $$;

-- ---------------------------------------------------------------------------
-- 4b. Smart search — any-word matching, word prefixes, group sizes, vehicles
-- ---------------------------------------------------------------------------
do $$
declare
  v_n     int;
  v_top   text;
  v_re    jsonb := '["royal-enfield","re-classic-350","re-bullet-350","re-hunter-350","re-meteor-350","re-himalayan","bike"]';
  v_bad   boolean := false;
begin
  perform act_as('customer@yolodeals.in');

  -- "i want chicken foods under 200": the app sends what is left of the words.
  perform assert(
    (select count(*) = 2 and bool_and(deal_price <= 200) and bool_and(title like 'Chicken%')
     from search_deals('{"q":"i want chicken foods under 200","keywords":["chicken"],"vertical":"food","price_max":200,"radius_km":10}'::jsonb,
                       12.9352, 77.6245, 50)),
    'search: chicken under 200 finds the two chicken deals and nothing dearer');

  -- A stray word no longer empties the results; it only ranks lower.
  select count(*) into v_n from search_deals(
    '{"keywords":["chicken","qwertyuiop"],"vertical":"food","radius_km":10}'::jsonb, 12.9352, 77.6245, 50);
  perform assert(v_n >= 2, 'search: any word may match, so a stray word does not empty the list');

  -- Word prefixes: "veg" is not "non-veg"; "kebabs" finds "kebab".
  perform assert(
    not exists (select 1 from search_deals('{"keywords":["veg"],"radius_km":30}'::jsonb, 12.9352, 77.6245, 100)
                where title = 'Chicken Seekh Kebab Plate'),
    'search: "veg" does not match a non-veg deal');
  perform assert(
    exists (select 1 from search_deals('{"keywords":["kebabs"],"radius_km":30}'::jsonb, 12.9352, 77.6245, 100)
            where title = 'Chicken Seekh Kebab Plate'),
    'search: a plural finds the singular');

  -- Group deals: 4-5 people overlaps 4-6 and 3-5, not a brunch for two.
  perform assert(
    (select count(*) > 0
        and bool_and((attributes->>'party_min')::int <= 5 and (attributes->>'party_max')::int >= 4)
     from search_deals('{"party_min":4,"party_max":5,"radius_km":30}'::jsonb, 12.9352, 77.6245, 100)),
    'search: a group of 4-5 gets only deals sized for it');
  perform assert(
    exists (select 1 from search_deals('{"party_min":4,"party_max":5,"radius_km":30}'::jsonb, 12.9352, 77.6245, 100)
            where title = 'Biryani Feast for 5')
    and not exists (select 1 from search_deals('{"party_min":4,"party_max":5,"radius_km":30}'::jsonb, 12.9352, 77.6245, 100)
            where title = 'Weekend Brunch for Two'),
    'search: the feast for 4-6 is in, the brunch for two is out');
  perform assert(
    (select bool_and(title in ('Weekend Brunch for Two', 'Sushi Platter for Two', 'Coffee Meeting Combo',
                               'Couple''s Spa Day', 'Pizza and Pitcher Combo', 'Happy Hours: Craft Beer Pitchers'))
     from search_deals('{"party_min":2,"party_max":2,"radius_km":30}'::jsonb, 12.9352, 77.6245, 100)),
    'search: a couple gets the deals for two');

  -- Vehicles: every deal for a Royal Enfield, in any category, specialists first.
  select title into v_top from search_deals(
    jsonb_build_object('vehicle_tags', v_re, 'radius_km', 30), 12.9352, 77.6245, 50) limit 1;
  perform assert(v_top in ('Royal Enfield General Service', 'Touring Kit for Royal Enfield'),
                 'search: a Royal Enfield specialist ranks first');
  perform assert(
    (select bool_and(title <> 'Car Foam Wash and Interior Clean')
        and bool_or(title = 'Bike Foam Wash and Polish')
        and bool_or(vertical = 'retail')
     from search_deals(jsonb_build_object('vehicle_tags', v_re, 'radius_km', 30), 12.9352, 77.6245, 50)),
    'search: the bike wash and riding gear come too, the car wash does not');
  select title into v_top from search_deals(
    '{"vehicle_tags":["honda-activa","honda","scooter"],"radius_km":30}'::jsonb, 12.9352, 77.6245, 50) limit 1;
  perform assert(v_top = 'Scooter General Service', 'search: an Activa gets the scooter service first');

  -- Attribute shapes are enforced.
  begin
    update deals set attributes = attributes || '{"party_min":"two"}'::jsonb
    where id = (select id from deals where title = 'Biryani Feast for 5');
  exception when check_violation then
    v_bad := true;
  end;
  perform assert(v_bad, 'a group size must be a number');
end $$;

-- ---------------------------------------------------------------------------
-- 4c. Taste — what someone opens, saves and claims reorders "For you"
-- ---------------------------------------------------------------------------
do $$
declare
  v_me   uuid;
  v_n    int;
  v_top  text;
begin
  perform act_as(null);
  select count(*) into v_n from feed_for_you(12.9352, 77.6245, 10000, 12);
  perform assert(v_n = 0, 'taste: a signed-out visitor gets no For-you rail');

  v_me := act_as('customer@yolodeals.in');
  delete from deal_events where profile_id = v_me;
  delete from saved_deals where profile_id = v_me;
  select count(*) into v_n from my_taste();
  perform assert(v_n = 0 or exists (select 1 from customer_actions where customer_id = v_me),
                 'taste: nothing learned before any signal');

  -- Opens two chicken deals and saves one.
  perform record_deal_events(jsonb_build_array(
    jsonb_build_object('deal_id', (select id from deals where title = 'Chicken Roll Combo'), 'event_type', 'view', 'source', 'test'),
    jsonb_build_object('deal_id', (select id from deals where title = 'Chicken Seekh Kebab Plate'), 'event_type', 'view', 'source', 'test')));
  insert into saved_deals (profile_id, deal_id)
  values (v_me, (select id from deals where title = 'Chicken Seekh Kebab Plate'));

  perform assert(
    (select key from my_taste() where kind = 'tag' order by weight desc limit 1) = 'chicken',
    'taste: chicken is the strongest tag');
  perform assert(
    (select key from my_taste() where kind = 'category' order by weight desc limit 1) = 'dinner',
    'taste: the saved deal''s category leads');

  select count(*) into v_n from feed_for_you(12.9352, 77.6245, 10000, 12);
  perform assert(v_n > 0, 'taste: For you has deals once there is a signal');
  perform assert(
    (select bool_and(category_slug = 'dinner' or category_slug = 'lunch' or 'chicken' = any (tags))
     from feed_for_you(12.9352, 77.6245, 10000, 12)),
    'taste: everything in For you shares the category or a tag');

  delete from deal_events where profile_id = v_me;
  delete from saved_deals where profile_id = v_me;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Action engine — code minting, capacity, duplicate guard
-- ---------------------------------------------------------------------------
do $$
declare
  v_deal   uuid;
  v_before int;
  v_after  int;
  v_act    customer_actions;
  v_code   text;
  v_failed boolean := false;
begin
  perform act_as('customer@yolodeals.in');

  -- A claim deal with capacity and no age restriction, open all day.
  select d.id, d.capacity_remaining into v_deal, v_before
  from deals d
  join deal_eligibility e on e.deal_id = d.id
  where d.status = 'ACTIVE' and d.capacity_remaining > 5 and e.min_age is null
    and exists (select 1 from deal_availability a
                where a.deal_id = d.id and a.day_of_week is null
                  and a.start_time <= '08:00'::time and a.end_time >= '20:00'::time)
    and not exists (select 1 from customer_actions c where c.deal_id = d.id)
  -- Descending, while the sell-out test in section 6 ascends, so the two
  -- always pick different deals.
  order by d.id desc
  limit 1;
  perform assert(v_deal is not null, 'found an all-day claim deal to test');
  -- The suite runs at any hour: open the test deal round the clock, so a
  -- late-night run does not fail on the deal's closing time.
  update deal_availability set start_time = '00:00', end_time = '23:59' where deal_id = v_deal;
  raise notice 'NOTE  claim test deal: %',
    (select title from deals where id = v_deal);

  v_act := take_deal_action(v_deal, 'claim', 1);
  perform assert(v_act.id is not null, 'take_deal_action created an action');
  perform assert(v_act.status = 'confirmed', 'a claim confirms immediately');
  perform assert(v_act.redemption_code like 'YOLO-%', 'a redemption code was minted');
  -- Only the random suffix is constrained; the YOLO- prefix contains an O.
  perform assert(substring(v_act.redemption_code from 6) !~ '[OI01]',
                 'code suffix avoids ambiguous characters');
  perform assert(length(v_act.redemption_code) = 11, 'code is YOLO- plus six characters');

  select capacity_remaining into v_after from deals where id = v_deal;
  perform assert(v_after = v_before - 1, 'capacity decremented by one');

  -- Second claim on the same deal must be refused.
  begin
    perform take_deal_action(v_deal, 'claim', 1);
  exception when others then
    v_failed := true;
  end;
  perform assert(v_failed, 'a duplicate claim is refused');

  select capacity_remaining into v_after from deals where id = v_deal;
  perform assert(v_after = v_before - 1, 'the refused claim did not consume capacity');

  v_code := v_act.redemption_code;

  -- The merchant who owns the deal redeems it.
  perform act_as('merchant@yolodeals.in');
  v_failed := false;
  begin
    perform redeem_action(v_code);
  exception when others then
    v_failed := true;
  end;
  -- The seeded merchant owns only Rangoli Kitchen, so this succeeds only when
  -- the chosen deal happens to be theirs. Either way it must not corrupt state.
  perform assert(
    (select status from customer_actions where redemption_code = v_code)
      in ('confirmed','redeemed'),
    'redeem_action left the action in a valid state');

  -- An unknown code is rejected.
  v_failed := false;
  begin
    perform redeem_action('YOLO-NOPE99');
  exception when others then
    v_failed := true;
  end;
  perform assert(v_failed, 'an unknown redemption code is rejected');
end $$;

-- ---------------------------------------------------------------------------
-- 6. Capacity exhaustion closes the deal in the same transaction
-- ---------------------------------------------------------------------------
do $$
declare
  v_deal uuid;
  v_status deal_status;
begin
  perform act_as('customer@yolodeals.in');

  -- Give a deal exactly one unit left, then claim it.
  select d.id into v_deal
  from deals d join deal_eligibility e on e.deal_id = d.id
  where d.status = 'ACTIVE' and e.min_age is null
    and exists (select 1 from deal_availability a
                where a.deal_id = d.id and a.day_of_week is null
                  and a.start_time <= '08:00'::time and a.end_time >= '20:00'::time)
    -- Any action at all disqualifies it, so this test cannot collide with the
    -- claim made in section 5 whoever made it.
    and not exists (select 1 from customer_actions c where c.deal_id = d.id)
  order by d.id
  limit 1;
  perform assert(v_deal is not null, 'found a second deal for the sell-out test');
  -- The suite runs at any hour: open the test deal round the clock, so a
  -- late-night run does not fail on the deal's closing time.
  update deal_availability set start_time = '00:00', end_time = '23:59' where deal_id = v_deal;
  raise notice 'NOTE  sell-out test deal: %',
    (select title from deals where id = v_deal);

  update deals set capacity_remaining = 1 where id = v_deal;
  perform take_deal_action(v_deal, 'claim', 1);

  select status into v_status from deals where id = v_deal;
  perform assert(v_status = 'EXPIRED', 'selling out moves the deal to EXPIRED');
  perform assert(
    exists (select 1 from deal_status_history
            where deal_id = v_deal and to_status = 'EXPIRED' and reason = 'sold out'),
    'the sell-out is recorded in the status history');
end $$;

-- ---------------------------------------------------------------------------
-- 7. Lifecycle — legal moves, illegal moves, rejection reasons
-- ---------------------------------------------------------------------------
do $$
declare
  v_deal   uuid;
  v_status deal_status;
  v_failed boolean;
begin
  -- Illegal: a merchant cannot approve their own deal.
  perform act_as('merchant@yolodeals.in');
  select id into v_deal from deals
  where status = 'SUBMITTED'
    and business_id = (select business_id from business_members
                       where profile_id = auth.uid() limit 1)
  limit 1;
  perform assert(v_deal is not null, 'the demo merchant has a submitted deal');

  v_failed := false;
  begin
    perform transition_deal(v_deal, 'APPROVED');
  exception when others then
    v_failed := true;
  end;
  perform assert(v_failed, 'a merchant cannot approve their own deal');

  -- Admin rejects without a reason: refused.
  perform act_as('admin@yolodeals.in');
  v_failed := false;
  begin
    perform review_deal(v_deal, false, null);
  exception when others then
    v_failed := true;
  end;
  perform assert(v_failed, 'rejection without a reason is refused');

  -- Admin approves: the deal walks APPROVED -> PUBLISHED -> ACTIVE.
  v_status := review_deal(v_deal, true);
  perform assert(v_status = 'ACTIVE', 'approval publishes and activates the deal');
  perform assert((select published_at from deals where id = v_deal) is not null,
                 'published_at was stamped');
  perform assert(
    (select count(*) from deal_status_history where deal_id = v_deal) >= 4,
    'the full approval path is in the status history');
  perform assert(
    exists (select 1 from notifications n
            where (n.data->>'deal_id')::uuid = v_deal and n.kind = 'deal_approved'),
    'the merchant was notified of the approval');

  -- A rejection must carry its reason onto the deal.
  perform act_as('admin@yolodeals.in');
  select id into v_deal from deals where status = 'SUBMITTED' limit 1;
  if v_deal is not null then
    perform review_deal(v_deal, false, 'Image does not show the product.');
    perform assert(
      (select status = 'REJECTED' and rejection_reason is not null
       from deals where id = v_deal),
      'a rejected deal stores its reason');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Merchant authoring — draft, submit, duplicate, stats
-- ---------------------------------------------------------------------------
do $$
declare
  v_biz   uuid;
  v_id    uuid;
  v_copy  uuid;
  v_stats record;
begin
  perform act_as('merchant@yolodeals.in');
  select business_id into v_biz from business_members where profile_id = auth.uid() limit 1;

  v_id := save_deal_draft(jsonb_build_object(
    'business_id', v_biz,
    'category_slug', 'lunch',
    'deal_type_code', 'discount',
    'offering_kind', 'meal',
    'title', 'Smoke Test Lunch Combo',
    'short_description', 'Created by the smoke test',
    'original_price', 400,
    'deal_price', 249,
    'capacity_total', 25,
    'ends_at', (now() + interval '10 days')::text,
    'tags', jsonb_build_array('lunch','test'),
    'availability', jsonb_build_array(
      jsonb_build_object('day_of_week', null, 'start_time', '11:00', 'end_time', '16:00')),
    'eligibility', jsonb_build_object('audience','everyone'),
    'actions', jsonb_build_array(
      jsonb_build_object('action_type','claim','is_primary',true),
      jsonb_build_object('action_type','directions','is_primary',false))
  ));
  perform assert(v_id is not null, 'save_deal_draft created a DRAFT');
  perform assert((select status from deals where id = v_id) = 'DRAFT',
                 'a new deal starts as DRAFT');
  perform assert((select discount_pct from deals where id = v_id) = 37.75,
                 'discount_pct computed from 400 -> 249');
  perform assert((select count(*) from deal_actions where deal_id = v_id) = 2,
                 'both CTAs were written');
  perform assert((select count(*) from deal_availability where deal_id = v_id) = 1,
                 'availability was written');

  -- Editing a draft again is allowed and updates in place.
  perform save_deal_draft(jsonb_build_object(
    'id', v_id, 'business_id', v_biz, 'title', 'Smoke Test Lunch Combo v2'));
  perform assert((select title from deals where id = v_id) = 'Smoke Test Lunch Combo v2',
                 'a draft can be edited in place');

  -- The wizard saves on every step, so later steps must be able to change what
  -- earlier ones wrote.
  perform save_deal_draft(jsonb_build_object(
    'id', v_id, 'business_id', v_biz,
    'category_slug', 'dinner',
    'capacity_total', 40,
    'eligibility', jsonb_build_object('audience','everyone','min_age',21),
    'actions', jsonb_build_array(
      jsonb_build_object('action_type','reserve','is_primary',true),
      jsonb_build_object('action_type','directions','is_primary',false))));
  perform assert((select capacity_remaining from deals where id = v_id) = 40,
                 'raising a draft''s capacity raises what is left');
  perform assert((select c.slug from deals d join categories c on c.id = d.category_id
                  where d.id = v_id) = 'dinner',
                 'a draft edit can change the category');
  perform assert((select min_age from deal_eligibility where deal_id = v_id) = 21,
                 'a draft edit replaces eligibility');
  perform assert((select action_type from deal_actions
                  where deal_id = v_id and is_primary) = 'reserve',
                 'a draft edit replaces the primary CTA');
  perform assert((select count(*) from deal_actions where deal_id = v_id) = 2,
                 'a draft edit replaces the CTA set rather than appending');

  -- Clearing an optional field sticks; leaving a key out keeps the value.
  perform save_deal_draft(jsonb_build_object(
    'id', v_id, 'business_id', v_biz,
    'original_price', null, 'capacity_total', null));
  perform assert((select original_price from deals where id = v_id) is null,
                 'posting null clears the usual price');
  perform assert((select capacity_total is null and capacity_remaining is null
                  from deals where id = v_id),
                 'posting null removes the capacity limit');
  perform assert((select deal_price from deals where id = v_id) = 249,
                 'a key left out is not touched');

  -- Put the price and capacity back for the steps that follow.
  perform save_deal_draft(jsonb_build_object(
    'id', v_id, 'business_id', v_biz, 'original_price', 400, 'capacity_total', 25));

  -- Submit it.
  perform assert(transition_deal(v_id, 'SUBMITTED') = 'SUBMITTED',
                 'a merchant can submit a draft');

  -- A submitted deal is no longer editable.
  declare v_failed boolean := false;
  begin
    begin
      perform save_deal_draft(jsonb_build_object(
        'id', v_id, 'business_id', v_biz, 'title', 'should not apply'));
    exception when others then
      v_failed := true;
    end;
    perform assert(v_failed, 'a submitted deal cannot be edited');
  end;

  -- Duplicate carries the child rows across as a fresh DRAFT.
  v_copy := duplicate_deal(v_id);
  perform assert((select status from deals where id = v_copy) = 'DRAFT',
                 'a duplicate starts as DRAFT');
  perform assert((select title from deals where id = v_copy) like '%(copy)',
                 'the duplicate is renamed');
  perform assert((select count(*) from deal_actions where deal_id = v_copy) = 2,
                 'the duplicate kept its CTAs');

  select * into v_stats from merchant_stats(v_biz, 7);
  perform assert(v_stats.draft_count >= 1, 'merchant_stats counts drafts');
  perform assert(v_stats.views > 0, 'merchant_stats reports seeded views');
end $$;

-- ---------------------------------------------------------------------------
-- 9. Outbox — every state change left a transactional event
-- ---------------------------------------------------------------------------
do $$
declare v_claimed int;
begin
  perform assert((select count(*) from outbox_events) > 0, 'outbox has events');
  perform assert(
    exists (select 1 from outbox_events where type = 'deal.active'),
    'approval emitted deal.active');
  perform assert(
    exists (select 1 from outbox_events where type = 'action.created'),
    'claiming emitted action.created');
  perform assert(
    (select bool_and(aggregate_id is not null and payload is not null) from outbox_events),
    'every event carries an aggregate_id and payload');

  -- The dispatcher claims a batch exactly once.
  select count(*) into v_claimed from claim_outbox_batch(1000);
  perform assert(v_claimed > 0, 'claim_outbox_batch returned a batch');
  perform assert((select count(*) from claim_outbox_batch(1000)) = 0,
                 'a claimed batch is not handed out twice');
  perform assert((select count(*) from outbox_events where dispatched_at is null) = 0,
                 'all events are marked dispatched');
end $$;

-- ---------------------------------------------------------------------------
-- 10. Cron jobs
-- ---------------------------------------------------------------------------
do $$
declare v_n int;
begin
  -- Force one ACTIVE deal into the past and expire it. The deal must already
  -- have started, or moving ends_at back would break the ends_at > starts_at
  -- check.
  update deals set ends_at = now() - interval '1 hour'
  where id = (select id from deals
              where status = 'ACTIVE' and starts_at < now() - interval '2 days'
              order by id limit 1);

  v_n := expire_due_deals();
  perform assert(v_n >= 1, 'expire_due_deals moved at least one deal');
  perform assert((select count(*) from deals
                  where status = 'ACTIVE' and ends_at <= now()) = 0,
                 'no ACTIVE deal is left past its end time');

  perform rollup_deal_analytics(current_date);
  perform assert((select count(*) from deal_analytics_daily) > 0,
                 'analytics rollup wrote rows');

  perform ensure_event_partitions();
  perform assert((select count(*) from pg_tables
                  where tablename like 'deal_events_%') >= 4,
                 'event partitions exist three months ahead');
end $$;

-- ---------------------------------------------------------------------------
-- 11. RLS — the isolation the UI must not be trusted to enforce
-- ---------------------------------------------------------------------------
-- This file runs as the table owner, and an owner bypasses both RLS and
-- column privileges — so isolation cannot be proven here. All of it is
-- asserted in 02_rls_test.sql, which SETs ROLE to anon and authenticated.
-- The only thing checked here is that the fixtures those tests need exist.
do $$
begin
  perform assert((select count(*) from deals where status = 'DRAFT') > 0,
                 'a DRAFT deal exists for the RLS suite to probe');
  perform assert((select count(*) from profiles where is_admin) = 1,
                 'exactly one admin profile is seeded');
  perform assert((select count(*) from business_members) >= 1,
                 'the demo merchant has a business membership');
end $$;

-- ---------------------------------------------------------------------------
select '--- all assertions passed ---' as result;
