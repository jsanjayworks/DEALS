-- ============================================================================
-- YOLO Deals — production core
--
-- The demo did these things in the browser; production needs them in the
-- database, where the client cannot skip or fake them.
--
--   1. Shop pages. create_business and update_business store what the owner
--      said or typed (about, keywords, hours, cost for two, amenities,
--      cuisines, photos, menu) and the pinned location; get_business returns
--      it all.
--   2. Go-live. A deal from a YOLO-verified business goes live as soon as it
--      is submitted. Others wait for review, admins are told, and when the
--      business is verified its waiting deals go live together. A deal YOLO
--      paused after reports always goes back through review.
--   3. Order alerts. Merchants hear about every new order, booking, enquiry
--      and cancellation; customers get their confirmation, and a prompt to
--      rate the visit once the code is used.
--   4. Payment. Only a verified gateway may mark an order paid: whatever the
--      client puts in payload.payment is dropped.
--   5. Reviews. Written only through create_review (a redeemed visit of your
--      own), read through list_reviews with a first name and initial, kept
--      after the deal ends, and averaged into the deal and the business.
--   6. Search honours amenities and cost for two; shop pages hide 21+ deals
--      from those too young, and know how far away they are.
--   7. Hardening. Clients can no longer insert profiles (an account without
--      one could have made itself admin); every auth user gets a profile;
--      raw event partitions are not readable through the API; a deal's
--      details change only through the draft flow; the deletion mark cannot
--      be cleared by its owner; storage folders are readable only by their owners.
-- ============================================================================

-- ------------------------------------------------------------ shop pages --

/**
 * Writes the optional shop details in p onto a business, checking each one.
 * Only keys present in p change. Called by create_business and
 * update_business, never by clients directly.
 */
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

  -- Photos and menu pictures must be web addresses; a device-only file never shows to anyone else.
  if jsonb_typeof(p->'photos') = 'array' then
    update businesses set photos = array(
      select u from jsonb_array_elements_text(p->'photos') with ordinality as x(u, n)
      where u ~ '^https://' and length(u) <= 600
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
             'photo',       case when coalesce(i->>'photo', '') ~ '^https://'
                                 then to_jsonb(left(i->>'photo', 600)) end
           )) order by n), '[]'::jsonb)
      into v_menu
      from jsonb_array_elements(p->'menu') with ordinality as x(i, n)
     where jsonb_typeof(i) = 'object' and length(btrim(coalesce(i->>'name', ''))) between 1 and 80;
    update businesses set menu = v_menu where id = p_business_id;
  end if;
end $$;

revoke execute on function apply_business_profile(uuid, jsonb) from public, anon, authenticated;

create or replace function create_business(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_name     text := btrim(coalesce(p->>'name', ''));
  v_phone    text := nullif(btrim(coalesce(p->>'phone', '')), '');
  v_email    text := nullif(btrim(coalesce(p->>'email', '')), '');
  v_address  text := btrim(coalesce(p->>'address_line', ''));
  v_category uuid;
  v_locality localities%rowtype;
  v_point    geography;
  v_id       uuid;
begin
  if v_uid is null then
    raise exception 'Sign in to list your business' using errcode = '42501';
  end if;
  if length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'Business name must be 2 to 80 characters' using errcode = 'P0001';
  end if;

  select id into v_category from categories
   where id::text = coalesce(p->>'primary_category_id', '');
  if v_category is null then
    raise exception 'Choose what kind of business this is' using errcode = 'P0001';
  end if;

  select * into v_locality from localities
   where id::text = coalesce(p->>'locality_id', '');
  if not found then
    raise exception 'Choose the area your business is in' using errcode = 'P0001';
  end if;

  if length(v_address) < 5 then
    raise exception 'Enter the street address' using errcode = 'P0001';
  end if;
  if v_phone is not null and v_phone !~ '^\+?[0-9 ]{8,16}$' then
    raise exception 'Enter a valid phone number' using errcode = 'P0001';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address' using errcode = 'P0001';
  end if;

  -- A light brake on throwaway businesses; real chains are added by admins.
  if (select count(*) from business_members
       where profile_id = v_uid and member_role = 'owner') >= 5 then
    raise exception 'You can own up to five businesses. Contact support to add more'
      using errcode = 'P0001';
  end if;

  if jsonb_typeof(p->'lat') = 'number' and jsonb_typeof(p->'lng') = 'number' then
    v_point := st_setsrid(st_makepoint((p->>'lng')::float8, (p->>'lat')::float8), 4326)::geography;
    if st_distance(v_point, v_locality.centroid) > 15000 then
      raise exception 'That pin is more than 15 km from %', v_locality.name using errcode = 'P0001';
    end if;
  else
    v_point := v_locality.centroid;
  end if;

  insert into businesses (name, phone, email, primary_category_id)
  values (v_name, v_phone, v_email, v_category)
  returning id into v_id;

  insert into business_members (business_id, profile_id, member_role)
  values (v_id, v_uid, 'owner');

  insert into business_locations (business_id, label, address_line, locality_id, city, location, is_primary)
  values (v_id, 'Main', v_address, v_locality.id, v_locality.city, v_point, true);

  -- What the owner said about the place: about, hours, cost for two, menu...
  perform apply_business_profile(v_id, p);

  perform emit_event('merchant.business_created', 'business', v_id,
    jsonb_build_object('name', v_name), v_uid);
  return v_id;
end $$;

/**
 * Editing a business: name, contacts, address and area as before (0012),
 * plus the pinned location and the shop details. A pin moves the business
 * and its deals there; changing area without a pin moves them to its centre.
 */
create or replace function update_business(p_business_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_name     text := btrim(coalesce(p->>'name', ''));
  v_phone    text := nullif(btrim(coalesce(p->>'phone', '')), '');
  v_email    text := nullif(btrim(coalesce(p->>'email', '')), '');
  v_address  text := btrim(coalesce(p->>'address_line', ''));
  v_locality localities%rowtype;
  v_loc      business_locations%rowtype;
  v_point    geography;
begin
  if not (is_business_member(p_business_id) or current_is_admin()) then
    raise exception 'Only the business''s own team can change its details' using errcode = '42501';
  end if;
  if length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'Business name must be 2 to 80 characters' using errcode = 'P0001';
  end if;
  select * into v_locality from localities where id::text = coalesce(p->>'locality_id', '');
  if not found then
    raise exception 'Choose the area your business is in' using errcode = 'P0001';
  end if;
  if length(v_address) < 5 then
    raise exception 'Enter the street address' using errcode = 'P0001';
  end if;
  if v_phone is not null and v_phone !~ '^\+?[0-9 ]{8,16}$' then
    raise exception 'Enter a valid phone number' using errcode = 'P0001';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p->'lat') = 'number' and jsonb_typeof(p->'lng') = 'number' then
    v_point := st_setsrid(st_makepoint((p->>'lng')::float8, (p->>'lat')::float8), 4326)::geography;
    if st_distance(v_point, v_locality.centroid) > 15000 then
      raise exception 'That pin is more than 15 km from %', v_locality.name using errcode = 'P0001';
    end if;
  end if;

  update businesses set name = v_name, phone = v_phone, email = v_email
   where id = p_business_id;

  select * into v_loc from business_locations
   where business_id = p_business_id order by is_primary desc, id limit 1;

  if not found then
    insert into business_locations (business_id, label, address_line, locality_id, city, location, is_primary)
    values (p_business_id, 'Main', v_address, v_locality.id, v_locality.city,
            coalesce(v_point, v_locality.centroid), true);
  elsif v_point is not null or v_loc.locality_id is distinct from v_locality.id then
    update business_locations
       set address_line = v_address, locality_id = v_locality.id, city = v_locality.city,
           location = coalesce(v_point, v_locality.centroid)
     where id = v_loc.id;
    -- The deals sit where the business is.
    update deals set location = coalesce(v_point, v_locality.centroid)
     where business_id = p_business_id and status not in ('EXPIRED', 'ARCHIVED', 'COMPLETED');
    update deal_locations set location = coalesce(v_point, v_locality.centroid)
     where business_location_id = v_loc.id;
  else
    update business_locations set address_line = v_address where id = v_loc.id;
  end if;

  perform apply_business_profile(p_business_id, p);

  perform emit_event('merchant.business_updated', 'business', p_business_id,
    jsonb_build_object('name', v_name, 'locality', v_locality.name), auth.uid());
end $$;

revoke execute on function update_business(uuid, jsonb) from public, anon;
grant  execute on function update_business(uuid, jsonb) to authenticated;

-- A different return shape, so the old one goes first.
drop function if exists get_business(uuid);

create function get_business(p_business_id uuid)
returns table (
  id uuid, name text, phone text, email text, primary_category_id uuid,
  verification_status text, rating_avg numeric, rating_count int,
  locality_id uuid, address_line text, lat double precision, lng double precision,
  description text, keywords text[], owner_role text, cost_for_two int,
  amenities text[], cuisines text[], open_time text, close_time text,
  photos text[], menu jsonb
)
language sql stable security definer set search_path = public as $$
  select b.id, b.name, b.phone, b.email, b.primary_category_id,
         b.verification_status::text, b.rating_avg, b.rating_count,
         bl.locality_id, bl.address_line,
         st_y(bl.location::geometry), st_x(bl.location::geometry),
         b.description, b.keywords, b.owner_role, b.cost_for_two,
         b.amenities, b.cuisines, to_char(b.open_time, 'HH24:MI'), to_char(b.close_time, 'HH24:MI'),
         b.photos, b.menu
  from businesses b
  left join lateral (
    select * from business_locations x
    where x.business_id = b.id
    order by x.is_primary desc, x.id limit 1
  ) bl on true
  where b.id = p_business_id;
$$;

grant execute on function get_business(uuid) to anon, authenticated;

create index if not exists businesses_amenities on businesses using gin (amenities);

-- A business's live deals for its public page: the same age gate as the feeds,
-- and distances from where the visitor is.
drop function if exists shop_deals(uuid);

create function shop_deals(
  p_business_id uuid,
  p_lat double precision default null,
  p_lng double precision default null
) returns setof deal_card
language sql stable security definer set search_path = public as $$
  select * from deal_cards(array(
    select d.id from deals d
    left join deal_eligibility e on e.deal_id = d.id
    where d.business_id = p_business_id
      and d.status = 'ACTIVE'
      and (d.ends_at is null or d.ends_at > now())
      and (d.starts_at is null or d.starts_at <= now())
      and (
        e.min_age is null
        or exists (select 1 from profiles pr
                   where pr.id = auth.uid() and pr.date_of_birth is not null
                     and pr.date_of_birth <= current_date - (e.min_age || ' years')::interval)
      )
  ), p_lat, p_lng)
$$;

grant execute on function shop_deals(uuid, double precision, double precision) to anon, authenticated;

-- --------------------------------------------------------------- go-live --

-- The system may approve a deal (for verified businesses), and a merchant may
-- take a paused deal back to draft to edit it.
insert into deal_transitions (from_status, to_status, actor) values
  ('SUBMITTED', 'APPROVED', 'system'),
  ('PAUSED',    'DRAFT',    'merchant')
on conflict do nothing;

/** Tell every admin something needs them, e.g. a deal or a business to review. */
create or replace function notify_admins(p_kind text, p_title text, p_body text, p_data jsonb default '{}'::jsonb)
returns void
language sql security definer set search_path = public as $$
  insert into notifications (profile_id, kind, title, body, data)
  select id, p_kind, p_title, p_body, p_data from profiles where is_admin and deleted_at is null;
$$;

/** Whether YOLO ever paused this deal (after reports): it then always goes through review. */
create or replace function deal_paused_by_admin(p_deal_id uuid, p_latest boolean default false)
returns boolean
language sql stable security definer set search_path = public as $$
  select case when p_latest then
    coalesce((select actor = 'admin' from deal_status_history
              where deal_id = p_deal_id and to_status = 'PAUSED'
              order by created_at desc limit 1), false)
  else
    exists (select 1 from deal_status_history
            where deal_id = p_deal_id and to_status = 'PAUSED' and actor = 'admin')
  end
$$;

/**
 * A submitted deal goes live without a person: SUBMITTED -> APPROVED ->
 * PUBLISHED, and on to ACTIVE when its window has begun. The team hears it is
 * live. Internal: callers have already decided it may.
 */
create or replace function publish_deal_now(p_deal_id uuid, p_reason text) returns deal_status
language plpgsql security definer set search_path = public as $$
declare
  v_deal   deals;
  v_status deal_status;
  v_member uuid;
begin
  select * into v_deal from deals where id = p_deal_id;
  if v_deal.status <> 'SUBMITTED' then
    return v_deal.status;
  end if;
  perform transition_deal_internal(p_deal_id, 'APPROVED', 'system', p_reason);
  v_status := transition_deal_internal(p_deal_id, 'PUBLISHED', 'system');
  if (v_deal.starts_at is null or v_deal.starts_at <= now())
     and (v_deal.ends_at is null or v_deal.ends_at > now()) then
    v_status := transition_deal_internal(p_deal_id, 'ACTIVE', 'system');
  end if;

  for v_member in select profile_id from business_members where business_id = v_deal.business_id loop
    perform notify_profile(
      v_member, 'deal_approved',
      case when v_status = 'ACTIVE' then 'Live now: ' else 'Approved: ' end || v_deal.title,
      case when v_status = 'ACTIVE' then 'Customers can see it and take it now.'
           else 'It goes live on ' || to_char(v_deal.starts_at at time zone 'Asia/Kolkata', 'FMDD Mon') || '.' end,
      jsonb_build_object('deal_id', p_deal_id)
    );
  end loop;
  return v_status;
end $$;

revoke execute on function publish_deal_now(uuid, text) from public, anon, authenticated;
revoke execute on function deal_paused_by_admin(uuid, boolean) from public, anon, authenticated;
revoke execute on function notify_admins(text, text, text, jsonb) from public, anon, authenticated;

/**
 * As in 0002, with the go-live rules: a merchant's submission goes straight
 * live for a verified business (unless YOLO once paused that deal), and
 * otherwise waits for review with the admins told. A deal YOLO paused after
 * reports cannot simply be resumed by its merchant.
 */
create or replace function transition_deal(
  p_deal_id   uuid,
  p_to_status deal_status,
  p_actor     actor_kind default 'merchant',
  p_reason    text       default null
) returns deal_status
language plpgsql security definer set search_path = public as $$
declare
  v_deal   deals;
  v_actor  actor_kind;
  v_status deal_status;
  v_biz    businesses;
begin
  select * into v_deal from deals where id = p_deal_id;
  if not found then
    raise exception 'deal % not found', p_deal_id using errcode = 'P0002';
  end if;

  if current_is_admin() then
    v_actor := 'admin';
  elsif is_business_member(v_deal.business_id) then
    v_actor := 'merchant';
  elsif auth.uid() is null then
    v_actor := 'system';       -- pg_cron and server-side workers
  else
    raise exception 'not permitted to move deal %', p_deal_id using errcode = '42501';
  end if;

  if v_actor = 'merchant' and v_deal.status = 'PAUSED' and p_to_status = 'ACTIVE'
     and deal_paused_by_admin(p_deal_id, true) then
    raise exception 'YOLO paused this deal after reports. Edit it and send it for review'
      using errcode = 'P0001';
  end if;

  v_status := transition_deal_internal(p_deal_id, p_to_status, v_actor, p_reason);

  if v_actor = 'merchant' and p_to_status = 'SUBMITTED' then
    select * into v_biz from businesses where id = v_deal.business_id;
    if v_biz.verification_status = 'verified' and not deal_paused_by_admin(p_deal_id) then
      return publish_deal_now(p_deal_id, 'verified business');
    end if;
    perform notify_admins('review_needed', 'Deal to review: ' || v_deal.title,
      v_biz.name || case when v_biz.verification_status = 'verified' then ' (paused before after reports)'
                         else ' is not verified yet' end,
      jsonb_build_object('deal_id', p_deal_id, 'business_id', v_deal.business_id));
  end if;
  return v_status;
end $$;

/** When a business is verified, the deals it already sent go live together. */
create or replace function business_verified_publish() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if new.verification_status = 'verified' and old.verification_status is distinct from 'verified' then
    for v_id in
      select id from deals
      where business_id = new.id and status = 'SUBMITTED' and not deal_paused_by_admin(id)
    loop
      perform publish_deal_now(v_id, 'business verified');
    end loop;
  end if;
  return null;
end $$;

drop trigger if exists businesses_verified_publish on businesses;
create trigger businesses_verified_publish
  after update of verification_status on businesses
  for each row execute function business_verified_publish();

/** A verification request reaches the admins, so the queue is never unseen. */
create or replace function verification_submitted_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform notify_admins('verification_needed',
    'Business to verify: ' || coalesce((select name from businesses where id = new.business_id), 'a business'),
    'Check the GST, PAN or FSSAI details and approve or reject.',
    jsonb_build_object('business_id', new.business_id));
  return null;
end $$;

drop trigger if exists business_verifications_notify on business_verifications;
create trigger business_verifications_notify
  after insert on business_verifications
  for each row execute function verification_submitted_notify();

-- ---------------------------------------------------------- order alerts --

/**
 * Both sides hear about an order as it happens: every member of the business
 * on a new order, booking, enquiry or cancellation (with the customer's first
 * name, never their contact details), the customer on confirmation, and a
 * rate-your-visit prompt when the code is used.
 */
create or replace function customer_action_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_deal   deals;
  v_biz    businesses;
  v_first  text;
  v_when   text;
  v_title  text;
  v_member uuid;
begin
  select * into v_deal from deals where id = new.deal_id;
  select * into v_biz from businesses where id = v_deal.business_id;
  select nullif(split_part(btrim(coalesce(full_name, '')), ' ', 1), '') into v_first
    from profiles where id = new.customer_id;
  v_when := case when new.slot_start is not null
                 then to_char(new.slot_start at time zone 'Asia/Kolkata', 'Dy FMDD Mon, FMHH12:MI AM') end;

  if tg_op = 'INSERT' then
    v_title := case new.action_type
                 when 'booking'         then 'New booking: '
                 when 'reserve'         then 'New booking: '
                 when 'enquiry'         then 'New enquiry: '
                 when 'registration'    then 'New registration: '
                 else                        'New order: '
               end || v_deal.title;
    for v_member in select profile_id from business_members where business_id = v_deal.business_id loop
      perform notify_profile(v_member, 'new_claim', v_title,
        concat_ws(' · ', coalesce(v_first, 'A customer'),
                  case when new.quantity > 1 then new.quantity || ' ×' end, v_when),
        jsonb_build_object('deal_id', new.deal_id, 'action_id', new.id));
    end loop;
    if new.status = 'confirmed' then
      perform notify_profile(new.customer_id, 'action_confirmed', 'You are all set: ' || v_deal.title,
        concat_ws(' · ', v_when,
                  case when new.redemption_code is not null
                       then 'Show ' || new.redemption_code || ' at ' || v_biz.name end),
        jsonb_build_object('deal_id', new.deal_id, 'action_id', new.id));
    end if;
  elsif new.status is distinct from old.status then
    if new.status = 'cancelled' then
      for v_member in select profile_id from business_members where business_id = v_deal.business_id loop
        perform notify_profile(v_member, 'order_cancelled', 'Cancelled: ' || v_deal.title,
          concat_ws(' · ', coalesce(v_first, 'A customer'), v_when),
          jsonb_build_object('deal_id', new.deal_id, 'action_id', new.id));
      end loop;
    elsif new.status = 'redeemed' then
      perform notify_profile(new.customer_id, 'rate_visit', 'How was ' || v_deal.title || '?',
        'Rate your visit to ' || v_biz.name || '. It helps others choose.',
        jsonb_build_object('deal_id', new.deal_id, 'action_id', new.id));
    end if;
  end if;
  return null;
end $$;

drop trigger if exists customer_actions_notify on customer_actions;
create trigger customer_actions_notify
  after insert or update of status on customer_actions
  for each row execute function customer_action_notify();

-- ---------------------------------------------------------------- payment --

/**
 * Only a verified payment may say an order is paid. The demo's checkout puts
 * a "paid" note in the payload, and a client could put any amount there, so
 * it is dropped unless the payment flow has verified it with the gateway and
 * set yolo.payment_verified for this transaction.
 */
create or replace function customer_action_guard_payment() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('yolo.payment_verified', true), '') <> 'on' then
    new.payload := coalesce(new.payload, '{}'::jsonb) - 'payment';
  end if;
  return new;
end $$;

drop trigger if exists customer_actions_guard_payment on customer_actions;
create trigger customer_actions_guard_payment
  before insert or update of payload on customer_actions
  for each row execute function customer_action_guard_payment();

-- ---------------------------------------------------------------- reviews --

-- "Aarav S.": a first name and initial, the way review sites show people.
create or replace function display_name(p_full_name text) returns text
language sql immutable as $$
  select case
    when coalesce(btrim(p_full_name), '') = '' then null
    when position(' ' in btrim(p_full_name)) = 0 then btrim(p_full_name)
    else split_part(btrim(p_full_name), ' ', 1) || ' '
         || upper(left(regexp_replace(btrim(p_full_name), '^.*\s', ''), 1)) || '.'
  end
$$;

create or replace function review_rows(p_ids uuid[])
returns table (
  id uuid, deal_id uuid, deal_title text, business_id uuid, customer_id uuid,
  customer_name text, rating smallint, body text, created_at timestamptz, action_id uuid
)
language sql stable security definer set search_path = public as $$
  select r.id, r.deal_id, d.title, d.business_id,
         -- Your own id only: nobody else needs anyone's account id.
         case when r.customer_id = auth.uid() then r.customer_id end,
         display_name(p.full_name), r.rating, r.body, r.created_at, r.customer_action_id
  from reviews r
  join deals d on d.id = r.deal_id
  left join profiles p on p.id = r.customer_id
  where r.id = any (p_ids)
  order by r.created_at desc
$$;

revoke execute on function review_rows(uuid[]) from public, anon, authenticated;

/**
 * Reviews of a business or of one deal, newest first. Kept after the deal
 * ends: they are about the place, and the deal's visibility does not change
 * what people said.
 */
create or replace function list_reviews(
  p_business_id uuid default null,
  p_deal_id     uuid default null,
  p_limit       int  default 20
)
returns table (
  id uuid, deal_id uuid, deal_title text, business_id uuid, customer_id uuid,
  customer_name text, rating smallint, body text, created_at timestamptz, action_id uuid
)
language sql stable security definer set search_path = public as $$
  select * from review_rows(array(
    select r.id from reviews r join deals d on d.id = r.deal_id
    where (p_business_id is null or d.business_id = p_business_id)
      and (p_deal_id is null or r.deal_id = p_deal_id)
      and (p_business_id is not null or p_deal_id is not null)
      and (r.status = 'visible' or r.customer_id = auth.uid() or current_is_admin())
    order by r.created_at desc
    limit least(greatest(p_limit, 1), 100)
  ))
$$;

create or replace function my_reviews()
returns table (
  id uuid, deal_id uuid, deal_title text, business_id uuid, customer_id uuid,
  customer_name text, rating smallint, body text, created_at timestamptz, action_id uuid
)
language sql stable security definer set search_path = public as $$
  select * from review_rows(array(
    select r.id from reviews r where r.customer_id = auth.uid() order by r.created_at desc limit 200
  ))
$$;

/**
 * Rate a visit: only your own, only once the code was used, once per deal.
 * The business's team is told.
 */
create or replace function create_review(p_action_id uuid, p_rating int, p_body text default null)
returns table (
  id uuid, deal_id uuid, deal_title text, business_id uuid, customer_id uuid,
  customer_name text, rating smallint, body text, created_at timestamptz, action_id uuid
)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_action customer_actions;
  v_deal   deals;
  v_id     uuid;
  v_body   text := nullif(btrim(coalesce(p_body, '')), '');
  v_member uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to rate your visit' using errcode = '42501';
  end if;
  select * into v_action from customer_actions a where a.id = p_action_id;
  if not found or v_action.customer_id <> auth.uid() then
    raise exception 'That visit is not on your account' using errcode = 'P0001';
  end if;
  if v_action.status <> 'redeemed' then
    raise exception 'You can rate it once your code has been used' using errcode = 'P0001';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Choose 1 to 5 stars' using errcode = 'P0001';
  end if;
  if length(v_body) > 1000 then
    raise exception 'Keep the review under 1000 characters' using errcode = 'P0001';
  end if;
  if exists (select 1 from reviews r where r.deal_id = v_action.deal_id and r.customer_id = auth.uid()) then
    raise exception 'You have already rated this' using errcode = 'P0001';
  end if;

  insert into reviews (deal_id, customer_id, customer_action_id, rating, body)
  values (v_action.deal_id, auth.uid(), v_action.id, p_rating, v_body)
  returning reviews.id into v_id;

  select * into v_deal from deals where deals.id = v_action.deal_id;
  for v_member in select profile_id from business_members where business_id = v_deal.business_id loop
    perform notify_profile(v_member, 'new_review',
      'New review: ' || p_rating || '★ for ' || v_deal.title,
      coalesce(left(v_body, 140), 'No comment, just stars.'),
      jsonb_build_object('deal_id', v_deal.id, 'review_id', v_id));
  end loop;

  return query select * from review_rows(array[v_id]);
end $$;

/** Keeps the deal's and the business's averages true to their visible reviews. */
create or replace function reviews_recount() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_deal uuid := coalesce(new.deal_id, old.deal_id);
  v_biz  uuid;
begin
  select business_id into v_biz from deals where id = v_deal;
  update deals d set
    rating_avg   = coalesce((select round(avg(r.rating)::numeric, 2) from reviews r
                             where r.deal_id = v_deal and r.status = 'visible'), 0),
    rating_count = (select count(*) from reviews r where r.deal_id = v_deal and r.status = 'visible')
  where d.id = v_deal;
  update businesses b set
    rating_avg   = coalesce((select round(avg(r.rating)::numeric, 2) from reviews r
                             join deals d on d.id = r.deal_id
                             where d.business_id = v_biz and r.status = 'visible'), 0),
    rating_count = (select count(*) from reviews r join deals d on d.id = r.deal_id
                    where d.business_id = v_biz and r.status = 'visible')
  where b.id = v_biz;
  return null;
end $$;

drop trigger if exists reviews_recount on reviews;
create trigger reviews_recount
  after insert or update of rating, status or delete on reviews
  for each row execute function reviews_recount();

-- Reviews are written only through create_review; admins hide them through RPCs.
drop policy if exists reviews_write_own  on reviews;
drop policy if exists reviews_update_own on reviews;
revoke insert, update, delete on reviews from anon, authenticated;

grant execute on function list_reviews(uuid, uuid, int)     to anon, authenticated;
grant execute on function my_reviews()                      to authenticated;
grant execute on function create_review(uuid, int, text)    to authenticated;
revoke execute on function my_reviews()                     from public, anon;
revoke execute on function create_review(uuid, int, text)   from public, anon;

-- ------------------------------------------------------------------ search --

create or replace function search_deals(
  p_filters jsonb,
  p_lat     double precision,
  p_lng     double precision,
  p_limit   int default 20,
  p_offset  int default 0
) returns setof deal_card
language plpgsql stable security definer set search_path = public as $$
declare
  v_q         text    := nullif(trim(coalesce(p_filters->>'q', '')), '');
  v_radius_km double precision := coalesce((p_filters->>'radius_km')::double precision, 5);
  v_locality  text    := nullif(p_filters->>'locality', '');
  v_origin    geography;
  v_dob       date    := (select date_of_birth from profiles where id = auth.uid());
  v_types     text[]  := case when jsonb_typeof(p_filters->'deal_types') = 'array'
                              then array(select jsonb_array_elements_text(p_filters->'deal_types'))
                              else null end;
  v_days      int[]   := case when jsonb_typeof(p_filters->'day_of_week') = 'array'
                              then array(select (jsonb_array_elements_text(p_filters->'day_of_week'))::int)
                              else null end;
  v_tod       text    := nullif(p_filters->>'time_of_day', '');
  v_from      time;
  v_to        time;
  v_pmin      numeric := nullif(p_filters->>'party_min', '')::numeric;
  v_pmax      numeric := nullif(p_filters->>'party_max', '')::numeric;
  v_vehicles  text[]  := case when jsonb_typeof(p_filters->'vehicle_tags') = 'array'
                              then array(select jsonb_array_elements_text(p_filters->'vehicle_tags'))
                              else '{}' end;
  v_terms     text[];
  -- Shop filters (0016): the place must have every amenity, and cost no more for two.
  v_amenities text[]  := case when jsonb_typeof(p_filters->'amenities') = 'array'
                              then array(select jsonb_array_elements_text(p_filters->'amenities'))
                              else '{}' end;
  v_cost_two  int     := case when jsonb_typeof(p_filters->'max_cost_for_two') = 'number'
                              then (p_filters->>'max_cost_for_two')::numeric::int end;
begin
  if cardinality(v_types) = 0 then v_types := null; end if;
  if cardinality(v_days)  = 0 then v_days  := null; end if;

  -- The app sends the words left after it has read prices, places, group
  -- sizes and vehicles out of the query. An older client that sends only
  -- the raw text gets its words split here.
  if jsonb_typeof(p_filters->'keywords') = 'array' then
    v_terms := array(
      select distinct search_stem(k) from jsonb_array_elements_text(p_filters->'keywords') k
      where length(search_stem(k)) > 1
    );
  elsif v_q is not null then
    v_terms := array(
      select distinct search_stem(w) from unnest(string_to_array(v_q, ' ')) w
      where length(search_stem(w)) > 2
    );
  else
    v_terms := '{}';
  end if;

  -- A named locality replaces the device location as the search centre.
  if v_locality is not null then
    select l.centroid into v_origin
    from localities l
    where lower(l.name) = lower(v_locality)
       or lower(v_locality) = any (l.aliases)
    limit 1;
  end if;
  v_origin := coalesce(v_origin, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography);

  v_from := case v_tod when 'morning' then '06:00'::time when 'lunch' then '12:00'::time
                       when 'evening' then '17:00'::time when 'night'  then '21:00'::time end;
  v_to   := case v_tod when 'morning' then '11:00'::time when 'lunch' then '15:30'::time
                       when 'evening' then '21:00'::time when 'night'  then '23:59'::time end;

  return query
  with candidates as (
    select
      v.*,
      st_distance(v.location, v_origin) / 1000.0 as distance_km,
      tr.hits,
      vehicle_relevance(v.attributes->'vehicles', v_vehicles) as fit
    from deal_card_base v
    -- Title weighs most, then tags, category, business, descriptions:
    -- the same ladder as textRelevance().
    cross join lateral (
      select coalesce(sum(case
          when starts_word(v.title, t)                                    then 1.0
          when starts_word(array_to_string(v.tags, ' '), t)               then 0.7
          when starts_word(v.category_name || ' ' || v.category_slug, t)  then 0.6
          when starts_word(v.business_name, t)                            then 0.5
          when starts_word(coalesce(v.short_description, '') || ' '
                           || coalesce(v.description, ''), t)              then 0.4
          else 0 end), 0)::double precision
        / greatest(cardinality(v_terms), 1) as hits
      from unnest(v_terms) t
    ) tr
    where v.status = 'ACTIVE'
      and (v.ends_at is null or v.ends_at > now())
      and (v.starts_at is null or v.starts_at <= now())
      and v.location is not null
      and st_dwithin(v.location, v_origin, (v_radius_km * 1000)::int)
      -- Any word may match; a typo still finds a close title.
      and (cardinality(v_terms) = 0 or tr.hits > 0
           or (v_q is not null and similarity(lower(v.title), lower(v_q)) > 0.3))
      and (p_filters->>'vertical'      is null or v.vertical      = p_filters->>'vertical')
      and (p_filters->>'category_slug' is null or v.category_slug = p_filters->>'category_slug')
      and (p_filters->>'price_min'     is null or coalesce(v.deal_price, 0) >= (p_filters->>'price_min')::numeric)
      and (p_filters->>'price_max'     is null or coalesce(v.deal_price, 0) <= (p_filters->>'price_max')::numeric)
      and (p_filters->>'min_rating'    is null or v.rating_avg    >= (p_filters->>'min_rating')::numeric)
      and (coalesce((p_filters->>'verified_only')::boolean, false) = false or v.is_verified)
      and (coalesce((p_filters->>'ending_soon')::boolean,  false) = false
           or (v.ends_at is not null and v.ends_at <= now() + interval '24 hours'))
      and (v_types is null or v.deal_type_code = any (v_types))
      and (v_days  is null or cardinality(v.availability_days) = 0
           or v.availability_days && v_days::smallint[])
      and (v_tod   is null or (v.availability_start < v_to and v.availability_end > v_from))
      -- Category-specific attributes, e.g. {"bhk": 2} for property.
      and (not (p_filters ? 'attributes') or v.attributes @> (p_filters->'attributes'))
      -- The group going: the deal's range must overlap theirs.
      and ((v_pmin is null and v_pmax is null)
           or (jsonb_typeof(v.attributes->'party_min') = 'number'
               and jsonb_typeof(v.attributes->'party_max') = 'number'
               and (v.attributes->>'party_min')::numeric <= coalesce(v_pmax, 99)
               and (v.attributes->>'party_max')::numeric >= coalesce(v_pmin, 1)))
      -- The vehicle: any shared tag.
      and (cardinality(v_vehicles) = 0
           or (jsonb_typeof(v.attributes->'vehicles') = 'array'
               and (v.attributes->'vehicles') ?| v_vehicles))
      and (
        v.min_age is null
        or (v_dob is not null and v_dob <= (current_date - (v.min_age || ' years')::interval))
      )
      and (cardinality(v_amenities) = 0
           or exists (select 1 from businesses b
                      where b.id = v.business_id and b.amenities @> v_amenities))
      and (v_cost_two is null
           or exists (select 1 from businesses b
                      where b.id = v.business_id and b.cost_for_two is not null
                        and b.cost_for_two <= v_cost_two))
  ), scored as (
    select
      c.*,
      (c.ends_at is not null and c.ends_at <= now() + interval '24 hours') as ending_soon,
      deal_score(
        case
          when cardinality(v_vehicles) = 0 then
            case when cardinality(v_terms) = 0 then 0.5 else least(c.hits, 1.0) end
          when cardinality(v_terms) = 0 then c.fit
          else least(c.hits, 1.0) * 0.6 + c.fit * 0.4
        end,
        c.distance_km, v_radius_km, c.discount_pct, c.published_at,
        c.rating_avg, c.rating_count, c.is_verified, c.ends_at,
        c.availability_days, c.availability_start, c.availability_end
      ) as score
    from candidates c
  )
  select
    s.id, s.business_id, s.category_id, s.deal_type_code, s.offering_kind,
    s.title, s.short_description, s.description, s.status,
    s.original_price, s.deal_price, s.discount_pct, s.currency,
    s.price_unit, s.taxes_note, s.min_purchase, s.max_qty_per_customer,
    s.starts_at, s.ends_at, s.capacity_total, s.capacity_remaining,
    s.booking_required, s.cancellation_policy, s.terms, s.attributes, s.tags,
    st_y(s.location::geometry), st_x(s.location::geometry),
    s.published_at, s.rating_avg, s.rating_count, s.view_count, s.search_count,
    s.business_name, s.business_phone, s.is_verified,
    s.category_slug, s.category_name, s.vertical, s.category_icon,
    s.address_line, s.locality_name, s.image_url,
    s.primary_cta, s.secondary_ctas,
    s.availability_days, s.availability_start, s.availability_end,
    s.min_age, s.min_spend,
    s.distance_km, s.ending_soon, s.score,
    s.audience::text, s.membership_required, s.advance_booking_hours, s.custom_rule,
    s.rejection_reason, s.created_at, s.business_rating, s.business_rating_count
  from scored s
  order by
    -- By relevance, specialists for the vehicle come first.
    case when coalesce(p_filters->>'sort', 'relevance') = 'relevance' then -s.fit else 0 end,
    case coalesce(p_filters->>'sort', 'relevance')
      when 'distance'    then  s.distance_km
      when 'ending_soon' then  extract(epoch from s.ends_at)
      when 'best_value'  then -coalesce(s.discount_pct, 0)::double precision
      else                    -s.score
    end
  limit  greatest(p_limit, 1)
  offset greatest(p_offset, 0);
end $$;

-- --------------------------------------------------------------- hardening --

-- Profiles are made by the on_auth_user_created trigger alone. A client that
-- could insert its own row could set is_admin on it.
drop policy if exists profiles_self_insert on profiles;
revoke insert, delete on profiles from anon, authenticated;

-- Anyone who signed in before the profile trigger existed gets their profile now.
insert into profiles (id, phone, email)
select u.id,
       case when coalesce(u.phone, '') <> '' then '+' || ltrim(u.phone, '+') end,
       nullif(u.email, '')
from auth.users u
where not exists (select 1 from profiles p where p.id = u.id)
on conflict do nothing;

-- Raw activity partitions are tables of their own: without this they could be
-- read and changed straight through the API, bypassing the parent's policies.
do $$
declare r record;
begin
  for r in
    select c.relname from pg_inherits i
    join pg_class c on c.oid = i.inhrelid
    join pg_class p on p.oid = i.inhparent
    where p.relname = 'deal_events'
  loop
    execute format('alter table %I enable row level security', r.relname);
    execute format('revoke all on %I from anon, authenticated', r.relname);
  end loop;
end $$;

/** Keeps deal_events partitioned three months ahead, each partition locked like the parent. */
create or replace function ensure_event_partitions() returns void
language plpgsql as $$
declare
  m date := date_trunc('month', now())::date;
  i int;
  v_name text;
begin
  for i in 0..3 loop
    v_name := 'deal_events_' || to_char(m + (i || ' month')::interval, 'YYYY_MM');
    execute format(
      'create table if not exists %I partition of deal_events for values from (%L) to (%L)',
      v_name,
      (m + (i     || ' month')::interval)::date,
      (m + (i + 1 || ' month')::interval)::date
    );
    execute format('alter table %I enable row level security', v_name);
    execute format('revoke all on %I from anon, authenticated', v_name);
  end loop;
end $$;

revoke execute on function ensure_event_partitions() from public, anon, authenticated;

-- A deal's details change only through save_deal_draft, which allows it only
-- while the deal is a draft or was sent back. Writing the child tables
-- directly would let an approved deal swap its photo, buttons or rules.
drop policy if exists deal_media_write        on deal_media;
drop policy if exists deal_availability_write on deal_availability;
drop policy if exists deal_eligibility_write  on deal_eligibility;
drop policy if exists deal_actions_write      on deal_actions;
drop policy if exists deal_tags_write         on deal_tags;
drop policy if exists deal_locations_write    on deal_locations;
revoke insert, update, delete on deal_media, deal_availability, deal_eligibility,
                                 deal_actions, deal_tags, deal_locations from anon, authenticated;

-- Deleting an account goes through request_account_deletion(); nobody may
-- clear the mark on their own row.
revoke update on profiles from anon, authenticated;
grant  update (full_name, email, date_of_birth, default_radius_m, onboarded_at, avatar_path)
  on profiles to authenticated;

-- Public buckets serve files by their address, so reading the object rows is
-- needed only by their owners (Storage checks it before a delete). Nobody
-- else may list every avatar folder (named by account id) or a business's photos.
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'avatars_read') then
    execute 'drop policy avatars_read on storage.objects';
    execute $p$create policy avatars_read on storage.objects for select to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'deal_photos_read') then
    execute 'drop policy deal_photos_read on storage.objects';
    execute $p$create policy deal_photos_read on storage.objects for select to authenticated
      using (bucket_id = 'deal-photos' and public.is_member_of_folder(name))$p$;
  end if;
end $$;
