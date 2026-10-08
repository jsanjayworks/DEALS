-- ============================================================================
-- YOLO Deals — launch hardening
--
-- What the production review found after 0016-0018:
--
--   1. "Buy now" orders get a code like every other order, so the shop can
--      redeem them at the counter (there is no online payment yet).
--   2. "I am 18 or older" is checked against the date of birth when there is
--      one, and personalisation stops for anyone it says is younger.
--   3. A date of birth, once given, changes only through support: it is what
--      unlocks 18+ and 21+ deals.
--   4. Shop and menu photos come only from YOLO's own storage or its sample
--      photo library, never any address on the web: a hotlinked picture can
--      change after it was checked, or track who looks at it.
--   5. Notifications reach open apps the moment they are written (Realtime),
--      so a merchant's screen rings for a new booking.
--   6. A merchant sees who ordered by first name and initial, never contact details.
-- ============================================================================

-- ------------------------------------------------------------ 1. buy codes --

/** A "buy now" order is collected at the counter, so it needs a code like a claim. */
create or replace function customer_action_purchase_code() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.action_type = 'purchase_intent' and new.redemption_code is null then
    new.redemption_code := gen_redemption_code();
  end if;
  return new;
end $$;

drop trigger if exists customer_actions_purchase_code on customer_actions;
create trigger customer_actions_purchase_code
  before insert on customer_actions
  for each row execute function customer_action_purchase_code();

-- ------------------------------------------------------------- 2. adults --

/** Under 18 by the date of birth they gave; unknown counts as not under. */
create or replace function is_under_18(p_profile_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select date_of_birth > current_date - interval '18 years'
                   from profiles where id = p_profile_id), false)
$$;

create or replace function may_personalise(p_profile_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_profile_id is not null
     and has_consent(p_profile_id, 'personalisation')
     and has_consent(p_profile_id, 'adult')
     and not is_under_18(p_profile_id)
$$;

revoke execute on function is_under_18(uuid) from public, anon, authenticated;

create or replace function set_consent(
  p_purpose        text,
  p_granted        boolean,
  p_notice_version text default 'v1',
  p_channel        text default 'app'
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if p_purpose not in ('personalisation', 'voice', 'location', 'marketing', 'adult') then
    raise exception 'Unknown purpose %', p_purpose using errcode = '22023';
  end if;
  if p_purpose = 'adult' and coalesce(p_granted, false) and is_under_18(auth.uid()) then
    raise exception 'Your date of birth says you are under 18' using errcode = 'P0001';
  end if;
  insert into consent_records (profile_id, purpose, granted, notice_version, channel)
  values (auth.uid(), p_purpose, coalesce(p_granted, false),
          left(coalesce(nullif(btrim(p_notice_version), ''), 'v1'), 20),
          case when p_channel in ('app', 'voice', 'web') then p_channel else 'app' end);
  if p_purpose in ('personalisation', 'adult') and not coalesce(p_granted, false) then
    perform erase_activity_of(auth.uid());
  end if;
end $$;

-- --------------------------------------------------- 3. date of birth lock --

create or replace function profiles_lock_dob() returns trigger
language plpgsql as $$
begin
  if old.date_of_birth is not null and new.date_of_birth is distinct from old.date_of_birth
     -- Only requests from the app (the API's roles); support and the server may correct it.
     and current_user in ('authenticated', 'anon')
     and not exists (select 1 from profiles where id = auth.uid() and is_admin) then
    raise exception 'Your date of birth is set. To correct it, contact support from Help' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists profiles_lock_dob on profiles;
create trigger profiles_lock_dob
  before update of date_of_birth on profiles
  for each row execute function profiles_lock_dob();

-- ---------------------------------------------------------- 4. photo sources --

/**
 * A photo YOLO may show: a file in this project's storage, or one from the
 * sample photo library the app uses when a merchant has none yet.
 */
create or replace function is_allowed_photo(p_url text) returns boolean
language sql immutable as $$
  select length(coalesce(p_url, '')) <= 600
     and (coalesce(p_url, '') ~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/(deal-photos|avatars)/'
          or coalesce(p_url, '') ~ '^https://images\.unsplash\.com/photo-[A-Za-z0-9_-]+(\?[A-Za-z0-9=&_.%-]*)?$'
          -- The local Supabase stack, for development.
          or coalesce(p_url, '') ~ '^http://(127\.0\.0\.1|localhost):54321/storage/v1/object/public/(deal-photos|avatars)/')
$$;

create or replace function apply_business_profile(p_business_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  -- The same keys as src/data/amenities.ts.
  v_allowed text[] := array['pure_veg','serves_alcohol','outdoor_seating','rooftop','live_music',
                            'parking','wifi','ac','family_friendly','pet_friendly','wheelchair','card_payment'];
  v_text  text;
  v_menu  jsonb;
begin
  if p ? 'description' then
    v_text := nullif(btrim(coalesce(p->>'description', '')), '');
    if length(v_text) > 1000 then
      raise exception 'Keep the description under 1000 characters' using errcode = 'P0001';
    end if;
    update businesses set description = v_text where id = p_business_id;
  end if;

  if jsonb_typeof(p->'keywords') = 'array' then
    update businesses set keywords = array(
      select distinct lower(btrim(k)) from jsonb_array_elements_text(p->'keywords') k
      where length(btrim(k)) between 2 and 40 limit 30
    ) where id = p_business_id;
  end if;

  if p ? 'owner_role' then
    update businesses set owner_role = nullif(left(btrim(coalesce(p->>'owner_role', '')), 40), '')
     where id = p_business_id;
  end if;

  if p ? 'cost_for_two' then
    if jsonb_typeof(p->'cost_for_two') = 'null' or coalesce(p->>'cost_for_two', '') = '' then
      update businesses set cost_for_two = null where id = p_business_id;
    elsif (p->>'cost_for_two') !~ '^\d{1,6}$' or (p->>'cost_for_two')::int > 100000 then
      raise exception 'Cost for two must be a number of rupees, up to 1,00,000' using errcode = 'P0001';
    else
      update businesses set cost_for_two = (p->>'cost_for_two')::int where id = p_business_id;
    end if;
  end if;

  if jsonb_typeof(p->'amenities') = 'array' then
    update businesses set amenities = array(
      select distinct a from jsonb_array_elements_text(p->'amenities') a where a = any (v_allowed)
    ) where id = p_business_id;
  end if;

  if jsonb_typeof(p->'cuisines') = 'array' then
    update businesses set cuisines = array(
      select distinct left(btrim(c), 40) from jsonb_array_elements_text(p->'cuisines') c
      where length(btrim(c)) >= 2 limit 10
    ) where id = p_business_id;
  end if;

  if p ? 'open_time' or p ? 'close_time' then
    if coalesce(p->>'open_time', '') <> '' and (p->>'open_time') !~ '^([01]\d|2[0-3]):[0-5]\d$' then
      raise exception 'Opening time should look like 10:00' using errcode = 'P0001';
    end if;
    if coalesce(p->>'close_time', '') <> '' and (p->>'close_time') !~ '^([01]\d|2[0-3]):[0-5]\d$' then
      raise exception 'Closing time should look like 22:00' using errcode = 'P0001';
    end if;
    update businesses set
      open_time  = case when p ? 'open_time'  then nullif(p->>'open_time', '')::time  else open_time end,
      close_time = case when p ? 'close_time' then nullif(p->>'close_time', '')::time else close_time end
    where id = p_business_id;
  end if;

  -- Photos and menu pictures come from YOLO's own storage or its sample library (0019).
  if jsonb_typeof(p->'photos') = 'array' then
    update businesses set photos = array(
      select u from jsonb_array_elements_text(p->'photos') with ordinality as x(u, n)
      where is_allowed_photo(u)
      order by n limit 12
    ) where id = p_business_id;
  end if;

  if jsonb_typeof(p->'menu') = 'array' then
    if jsonb_array_length(p->'menu') > 200 then
      raise exception 'Keep the menu under 200 items' using errcode = 'P0001';
    end if;
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
             'name',        left(btrim(i->>'name'), 80),
             'price',       case when jsonb_typeof(i->'price') = 'number'
                                  and (i->>'price')::numeric between 0 and 1000000
                                 then i->'price' end,
             'description', nullif(left(btrim(coalesce(i->>'description', '')), 200), ''),
             'veg',         case when jsonb_typeof(i->'veg') = 'boolean' then i->'veg' end,
             'photo',       case when is_allowed_photo(i->>'photo')
                                 then to_jsonb(i->>'photo') end
           )) order by n), '[]'::jsonb)
      into v_menu
      from jsonb_array_elements(p->'menu') with ordinality as x(i, n)
     where jsonb_typeof(i) = 'object' and length(btrim(coalesce(i->>'name', ''))) between 1 and 80;
    update businesses set menu = v_menu where id = p_business_id;
  end if;
end $$;

-- ------------------------------------------------------ 6. who ordered --

/**
 * The name on each order for the business's own team, as review sites show
 * people: "Aarav S." Never a phone or email.
 */
create or replace function business_customer_names(p_business_id uuid)
returns table (action_id uuid, customer_name text)
language sql stable security definer set search_path = public as $$
  select a.id, display_name(p.full_name)
  from customer_actions a
  join deals d on d.id = a.deal_id
  left join profiles p on p.id = a.customer_id
  where d.business_id = p_business_id
    and (is_business_member(p_business_id) or current_is_admin())
  order by a.created_at desc
  limit 500
$$;

revoke execute on function business_customer_names(uuid) from public, anon;
grant  execute on function business_customer_names(uuid) to authenticated;

-- ------------------------------------------------------ 5. live notifications --

-- Supabase streams changes only for tables in its publication; RLS still
-- decides who receives each row (your own notifications only).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end $$;
