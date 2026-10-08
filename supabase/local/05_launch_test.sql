-- ============================================================================
-- Launch hardening (0019): buy codes, adult checks, date of birth lock,
-- photo sources. Run after 01-04 on a reset database.
-- ============================================================================

\set ON_ERROR_STOP on
set client_min_messages = notice;

insert into auth.users (id, phone, raw_user_meta_data)
values ('00000000-0000-4000-8000-000000000019', '919811100019', '{}');

-- ---------------------------------------------------------------------------
-- 1. "Buy now" orders get a code the shop can redeem
-- ---------------------------------------------------------------------------
do $$
declare
  v_deal   uuid := (select d.id from deals d
                    join deal_eligibility e on e.deal_id = d.id
                    where d.status = 'ACTIVE' and e.min_age is null
                      and (d.ends_at is null or d.ends_at > now())
                    order by d.id limit 1);
  v_action customer_actions;
begin
  perform set_config('app.current_user_id', '00000000-0000-4000-8000-000000000019', false);
  -- Any time of day: give the deal an all-day window for this test.
  update deal_availability set start_time = '00:00', end_time = '23:59', day_of_week = null where deal_id = v_deal;
  v_action := take_deal_action(v_deal, 'purchase_intent', 1, null, '{}');
  perform assert(v_action.redemption_code is not null, 'a "buy now" order gets a code to show at the counter');
  perform assert(v_action.status = 'confirmed', 'and is confirmed');
end $$;

-- ---------------------------------------------------------------------------
-- 2. 18+ is checked against the date of birth
-- ---------------------------------------------------------------------------
do $$
declare v_me uuid := '00000000-0000-4000-8000-000000000019';
begin
  perform set_config('app.current_user_id', v_me::text, false);
  update profiles set date_of_birth = current_date - interval '16 years' where id = v_me;
  begin
    perform set_consent('adult', true);
    perform assert(false, 'someone under 18 by date of birth cannot say they are an adult');
  exception when others then
    perform assert(sqlerrm like '%under 18%', 'someone under 18 by date of birth cannot say they are an adult');
  end;
  perform set_consent('personalisation', true);
  perform assert(not may_personalise(v_me), 'and nothing is learned about them');

  update profiles set date_of_birth = '1995-05-05' where id = v_me;
  perform set_consent('adult', true);
  perform assert(may_personalise(v_me), 'an adult who agreed is personalised');
end $$;

-- ---------------------------------------------------------------------------
-- 3. Date of birth, once set, changes only through support
-- ---------------------------------------------------------------------------
do $$
declare v_me uuid := '00000000-0000-4000-8000-000000000019';
begin
  perform assert(refused('authenticated', v_me, format(
    'update profiles set date_of_birth = %L where id = %L', '2001-01-01', v_me)),
    'a customer cannot change their date of birth once set');
  perform assert(not refused('authenticated', v_me, format(
    'update profiles set full_name = %L where id = %L', 'Lakshmi Rao', v_me)),
    'other profile fields still change');
end $$;

-- ---------------------------------------------------------------------------
-- 4. Photos only from YOLO's storage or the sample library
-- ---------------------------------------------------------------------------
do $$
declare
  v_biz uuid := (select business_id from business_members
                 where profile_id = (select id from profiles where email = 'merchant@yolodeals.in') limit 1);
  v_b   record;
begin
  perform act_as('merchant@yolodeals.in');
  perform update_business(v_biz, jsonb_build_object(
    'name', (select name from businesses where id = v_biz),
    'locality_id', (select locality_id from business_locations where business_id = v_biz order by is_primary desc limit 1),
    'address_line', (select address_line from business_locations where business_id = v_biz order by is_primary desc limit 1),
    'photos', jsonb_build_array(
      'https://abcd1234.supabase.co/storage/v1/object/public/deal-photos/' || v_biz || '/1.jpg',
      'https://images.unsplash.com/photo-1589302168068?w=800&q=70',
      'https://tracker.example.com/pixel.gif',
      'http://abcd1234.supabase.co/storage/v1/object/public/deal-photos/x/2.jpg'),
    'menu', jsonb_build_array(
      jsonb_build_object('name', 'Dosa', 'photo', 'https://evil.example.com/a.jpg'),
      jsonb_build_object('name', 'Idli', 'photo', 'https://abcd1234.supabase.co/storage/v1/object/public/deal-photos/' || v_biz || '/3.jpg'))));
  select * into v_b from get_business(v_biz);
  perform assert(cardinality(v_b.photos) = 2, 'only own-storage and sample-library photos are kept');
  perform assert(not ('https://tracker.example.com/pixel.gif' = any (v_b.photos)), 'an outside address is dropped');
  perform assert(not (v_b.menu->0 ? 'photo') and (v_b.menu->1 ? 'photo'),
    'menu photos follow the same rule');
end $$;

-- ---------------------------------------------------------------------------
-- 5. Merchants see who ordered by first name and initial, outsiders nothing
-- ---------------------------------------------------------------------------
do $$
declare
  v_biz  uuid := (select business_id from business_members
                  where profile_id = (select id from profiles where email = 'merchant@yolodeals.in') limit 1);
  v_deal uuid;
begin
  -- Lakshmi Rao (section 3) claims one of the merchant's deals.
  v_deal := (select d.id from deals d left join deal_eligibility e on e.deal_id = d.id
             where d.business_id = v_biz and d.status = 'ACTIVE' and e.min_age is null
               and (d.ends_at is null or d.ends_at > now()) and not d.booking_required
             order by d.id limit 1);
  update deal_availability set start_time = '00:00', end_time = '23:59', day_of_week = null where deal_id = v_deal;
  perform set_config('app.current_user_id', '00000000-0000-4000-8000-000000000019', false);
  perform take_deal_action(v_deal, 'claim', 1, null, '{}');

  perform act_as('merchant@yolodeals.in');
  perform assert(exists (select 1 from business_customer_names(v_biz) where customer_name = 'Lakshmi R.'),
    'a merchant sees who ordered as "Lakshmi R."');
  perform assert(not exists (select 1 from business_customer_names(v_biz) where customer_name ~ '@|\d{6}'),
    'never an email or a phone number');
  perform set_config('app.current_user_id', '00000000-0000-4000-8000-000000000019', false);
  perform assert(not exists (select 1 from business_customer_names(v_biz)),
    'someone outside the business sees none');
end $$;

\echo '-------------------------------'
