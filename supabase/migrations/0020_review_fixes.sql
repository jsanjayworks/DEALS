-- ============================================================================
-- YOLO Deals — fixes from the production review of 0016-0019
--
-- Two critical and many smaller defects found by an independent review:
--
--   1. transition_deal could be called with only the public key, as "system",
--      so anyone could publish a waiting deal or end someone else's. It now
--      needs a signed-in member or admin; scheduled jobs use the internal one.
--   2. A deal YOLO paused after reports or turned down keeps a needs-review
--      mark: copies carry it, resuming and auto-publishing respect it, and a
--      pause from the reports queue sets it whatever state the deal is in.
--      Paused -> draft is gone (it reset what was left to sell).
--   3. Auto-publish needs a complete deal with allowed photos; a deal whose
--      dates passed while waiting is sent back, not "approved".
--   4. Photos only from this project's own storage (the signed-in person's
--      token names the project), inside the business's own folder, or the
--      sample library. Checked for deal photos as well as shop and menu ones.
--   5. A business's own team cannot review its deals; the reviews table is
--      read only through list_reviews and my_reviews; hidden reviews stay hidden.
--   6. Activity: signed out, an event needs its session id; only live deals
--      count; one network address is rate limited. The old record_deal_events
--      is for signed-in callers only.
--   7. One open enquiry per customer per deal, and enquiries take no stock.
--   8. A date of birth that shows someone is under 18 erases what was learned
--      and records that they are not an adult. "Not for me" and interests
--      survive a consent change; only account deletion removes them.
--   9. Taste also learns from shop pages opened and words searched or asked.
--  10. app_settings marks a production database, which the sample seed
--      refuses; schema_version() lets the deploy check the database is current.
-- ============================================================================

-- ------------------------------------------------------------- settings --

create table if not exists app_settings (
  key   text primary key,
  value text not null
);
alter table app_settings enable row level security;
revoke all on app_settings from anon, authenticated;

/** The newest migration the database has; the web deploy checks it. */
create or replace function schema_version() returns int
language sql immutable as $$ select 20 $$;
grant execute on function schema_version() to anon, authenticated;

/**
 * Whether the owner marked this database as production (docs/LAUNCH.md).
 * The web deploy refuses until it is; the sample seed refuses once it is.
 */
create or replace function is_production() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_settings where key = 'environment' and value = 'production')
$$;
grant execute on function is_production() to anon, authenticated;

-- -------------------------------------------------- 1. deal transitions --

revoke execute on function transition_deal(uuid, deal_status, actor_kind, text) from public, anon;
grant  execute on function transition_deal(uuid, deal_status, actor_kind, text) to authenticated;
revoke execute on function record_deal_events(jsonb) from public, anon;
grant  execute on function record_deal_events(jsonb) to authenticated;

-- Copies of a reported deal go through review instead of being edited in place.
delete from deal_transitions where from_status = 'PAUSED' and to_status = 'DRAFT' and actor = 'merchant';
-- A deal whose dates passed while it waited goes back to its owner to fix.
insert into deal_transitions (from_status, to_status, actor) values ('SUBMITTED', 'REJECTED', 'system')
on conflict do nothing;

-- ------------------------------------------------ 2. needs-review mark --

alter table deals add column if not exists requires_review boolean not null default false;

/** YOLO pausing or turning down a deal marks it; YOLO approving it clears the mark. */
create or replace function deal_history_review_mark() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.actor = 'admin' and new.to_status in ('PAUSED', 'REJECTED') then
    update deals set requires_review = true where id = new.deal_id;
  elsif new.actor = 'admin' and new.to_status = 'APPROVED' then
    update deals set requires_review = false where id = new.deal_id;
  end if;
  return null;
end $$;

drop trigger if exists deal_status_history_review_mark on deal_status_history;
create trigger deal_status_history_review_mark
  after insert on deal_status_history
  for each row execute function deal_history_review_mark();

/** A pause from the reports queue marks the deal whatever state it was in. */
create or replace function reports_actioned_mark() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.target_type = 'deal' and new.status = 'actioned' and old.status is distinct from 'actioned' then
    update deals set requires_review = true where id = new.target_id;
  end if;
  return null;
end $$;

drop trigger if exists reports_actioned_mark on reports;
create trigger reports_actioned_mark
  after update of status on reports
  for each row execute function reports_actioned_mark();

-- Deals already paused or turned down by YOLO before this migration.
update deals d set requires_review = true
where exists (select 1 from deal_status_history h
              where h.deal_id = d.id and h.actor = 'admin' and h.to_status in ('PAUSED', 'REJECTED'));

create or replace function duplicate_deal(p_deal_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_src deals;
  v_new uuid;
begin
  select * into v_src from deals where id = p_deal_id;
  if not found then
    raise exception 'deal not found' using errcode = 'P0002';
  end if;
  if not (is_business_member(v_src.business_id) or current_is_admin()) then
    raise exception 'not your deal' using errcode = '42501';
  end if;

  insert into deals (
    business_id, category_id, deal_type_code, offering_kind, title,
    short_description, description, status, original_price, deal_price,
    price_unit, taxes_note, min_purchase, max_qty_per_customer,
    starts_at, ends_at, capacity_total, capacity_remaining, booking_required,
    fulfilment, cancellation_policy, terms, attributes, tags, location,
    search_radius_m, requires_review
  )
  select
    business_id, category_id, deal_type_code, offering_kind,
    left(title || ' (copy)', 90),
    short_description, description, 'DRAFT', original_price, deal_price,
    price_unit, taxes_note, min_purchase, max_qty_per_customer,
    starts_at, ends_at, capacity_total, capacity_total, booking_required,
    fulfilment, cancellation_policy, terms, attributes, tags, location,
    -- A copy of a deal YOLO paused or turned down still needs YOLO to look (0020).
    search_radius_m, requires_review
  from deals where id = p_deal_id
  returning id into v_new;

  insert into deal_media (deal_id, kind, storage_path, position)
    select v_new, kind, storage_path, position from deal_media where deal_id = p_deal_id;
  insert into deal_availability (deal_id, day_of_week, start_time, end_time)
    select v_new, day_of_week, start_time, end_time from deal_availability where deal_id = p_deal_id;
  insert into deal_eligibility (deal_id, audience, min_age, min_spend,
                                membership_required, advance_booking_hours, custom_rule)
    select v_new, audience, min_age, min_spend, membership_required,
           advance_booking_hours, custom_rule
    from deal_eligibility where deal_id = p_deal_id;
  insert into deal_actions (deal_id, action_type, is_primary, label, config, sort_order)
    select v_new, action_type, is_primary, label, config, sort_order
    from deal_actions where deal_id = p_deal_id;

  return v_new;
end $$;

create or replace function activate_due_deals() returns int
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_n int := 0;
begin
  for v_id in
    select id from deals
    where status = 'PUBLISHED'
      and not requires_review
      and (starts_at is null or starts_at <= now())
      and (ends_at is null or ends_at > now())
  loop
    perform transition_deal_internal(v_id, 'ACTIVE', 'system');
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ------------------------------------------------------------- 4. photos --

/**
 * A photo YOLO may show: one from the sample library, or a file in THIS
 * project's deal-photos bucket. The project is the one named by the
 * signed-in person's token; inside it the file must be in the business's own
 * folder when the business is known, and must exist. Without a token (the
 * server, the SQL editor, tests) the file must still exist where storage is
 * present.
 */
create or replace function is_allowed_photo(p_url text, p_business_id uuid default null) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_path   text;
  v_origin text;
  v_iss    text;
begin
  if p_url is null or length(p_url) > 600 then
    return false;
  end if;
  if p_url ~ '^https://images\.unsplash\.com/photo-[A-Za-z0-9_-]+(\?[A-Za-z0-9=&_.%-]*)?$' then
    return true;
  end if;
  v_path := substring(p_url from '^https?://[^/]+/storage/v1/object/public/deal-photos/([A-Za-z0-9/_.-]+)$');
  if v_path is null or v_path like '%..%' then
    return false;
  end if;
  begin
    v_iss := auth.jwt()->>'iss';
  exception when others then
    v_iss := null;
  end;
  v_origin := coalesce((select value from app_settings where key = 'storage_origin'),
                       substring(v_iss from '^(https?://[^/]+)'));
  if v_origin is not null and left(p_url, length(v_origin) + 1) <> v_origin || '/' then
    return false;
  end if;
  if v_origin is null and p_url !~ '^https://[a-z0-9-]+\.supabase\.co/' then
    return false;
  end if;
  if p_business_id is not null and split_part(v_path, '/', 1) <> p_business_id::text then
    return false;
  end if;
  if to_regclass('storage.objects') is not null then
    return exists (select 1 from storage.objects o where o.bucket_id = 'deal-photos' and o.name = v_path);
  end if;
  return true;
end $$;

-- The old one-argument form is replaced by the one above (its default covers old callers).
drop function if exists is_allowed_photo(text);

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
      where is_allowed_photo(u, p_business_id)
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
             'photo',       case when is_allowed_photo(i->>'photo', p_business_id)
                                 then to_jsonb(i->>'photo') end
           )) order by n), '[]'::jsonb)
      into v_menu
      from jsonb_array_elements(p->'menu') with ordinality as x(i, n)
     where jsonb_typeof(i) = 'object' and length(btrim(coalesce(i->>'name', ''))) between 1 and 80;
    update businesses set menu = v_menu where id = p_business_id;
  end if;
end $$;

/** Deal photos follow the same rule as shop photos. */
create or replace function deal_media_photo_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'image' and not is_allowed_photo(new.storage_path,
       (select business_id from deals where id = new.deal_id)) then
    raise exception 'Use a photo uploaded to YOLO, or one from the photo library' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists deal_media_photo_check on deal_media;
create trigger deal_media_photo_check
  before insert or update of storage_path on deal_media
  for each row execute function deal_media_photo_check();

-- ------------------------------------------------- 3. complete to publish --

/** What stops a deal going live without a person looking; null when nothing does. */
create or replace function deal_publish_problem(p_deal_id uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_deal deals;
begin
  select * into v_deal from deals where id = p_deal_id;
  if coalesce(btrim(v_deal.short_description), '') = '' and coalesce(btrim(v_deal.description), '') = '' then
    return 'Add a line saying what the deal is';
  end if;
  if not exists (select 1 from deal_actions where deal_id = p_deal_id and is_primary) then
    return 'Choose what customers do: claim, book, buy or enquire';
  end if;
  if not exists (select 1 from deal_availability where deal_id = p_deal_id) then
    return 'Add the days and hours the deal is on';
  end if;
  if v_deal.ends_at is not null and v_deal.ends_at <= now() then
    return 'Set an end date in the future';
  end if;
  return null;
end $$;

revoke execute on function deal_publish_problem(uuid) from public, anon, authenticated;

/**
 * As in 0016, with the checks above: a deal whose dates passed while it
 * waited goes back to its owner instead of being "approved".
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
  if v_deal.ends_at is not null and v_deal.ends_at <= now() then
    v_status := transition_deal_internal(p_deal_id, 'REJECTED', 'system',
      'The end date passed before it went live. Set new dates and send it again.');
    for v_member in select profile_id from business_members where business_id = v_deal.business_id loop
      perform notify_profile(v_member, 'deal_rejected', 'Needs new dates: ' || v_deal.title,
        'It ended before it could go live. Set new dates and send it again.',
        jsonb_build_object('deal_id', p_deal_id));
    end loop;
    return v_status;
  end if;

  perform transition_deal_internal(p_deal_id, 'APPROVED', 'system', p_reason);
  v_status := transition_deal_internal(p_deal_id, 'PUBLISHED', 'system');
  if v_deal.starts_at is null or v_deal.starts_at <= now() then
    v_status := transition_deal_internal(p_deal_id, 'ACTIVE', 'system');
  end if;

  for v_member in select profile_id from business_members where business_id = v_deal.business_id loop
    perform notify_profile(
      v_member, 'deal_approved',
      case when v_status = 'ACTIVE' then 'Live now: ' else 'Approved: ' end || v_deal.title,
      case when v_status = 'ACTIVE' then 'Customers can see it and take it now.'
           else 'It goes live on ' || coalesce(to_char(v_deal.starts_at at time zone 'Asia/Kolkata', 'FMDD Mon'), 'its start date') || '.' end,
      jsonb_build_object('deal_id', p_deal_id)
    );
  end loop;
  return v_status;
end $$;

/**
 * As in 0016, closed to anyone not signed in, and with the needs-review mark:
 * a signed-in member or admin moves deals; only a server connection (cron,
 * the SQL editor) may act as "system". A merchant's submission must be
 * complete; it goes live at once for a verified business with allowed photos
 * and no review mark, and otherwise waits for an admin.
 */
create or replace function transition_deal(
  p_deal_id   uuid,
  p_to_status deal_status,
  p_actor     actor_kind default 'merchant',
  p_reason    text       default null
) returns deal_status
language plpgsql security definer set search_path = public as $$
declare
  v_deal    deals;
  v_actor   actor_kind;
  v_status  deal_status;
  v_biz     businesses;
  v_problem text;
  v_photos  boolean;
begin
  select * into v_deal from deals where id = p_deal_id;
  if not found then
    raise exception 'deal % not found', p_deal_id using errcode = 'P0002';
  end if;

  if current_is_admin() then
    v_actor := 'admin';
  elsif is_business_member(v_deal.business_id) then
    v_actor := 'merchant';
  elsif auth.uid() is null
        -- Only a server connection (pg_cron, the SQL editor), never a request
        -- through the API: those come in as authenticator and carry claims,
        -- even with just the public key.
        and session_user not in ('anon', 'authenticated', 'authenticator', 'service_role')
        and coalesce(current_setting('request.jwt.claims', true), '') = '' then
    v_actor := 'system';
  else
    raise exception 'not permitted to move deal %', p_deal_id using errcode = '42501';
  end if;

  if v_actor = 'merchant' and v_deal.status = 'PAUSED' and p_to_status = 'ACTIVE'
     and (v_deal.requires_review or deal_paused_by_admin(p_deal_id, true)) then
    raise exception 'YOLO paused this deal after reports. Make a copy, fix what was reported and send the copy for review'
      using errcode = 'P0001';
  end if;

  if v_actor = 'merchant' and p_to_status = 'SUBMITTED' then
    v_problem := deal_publish_problem(p_deal_id);
    if v_problem is not null then
      raise exception '%', v_problem using errcode = 'P0001';
    end if;
  end if;

  v_status := transition_deal_internal(p_deal_id, p_to_status, v_actor, p_reason);

  if v_actor = 'merchant' and p_to_status = 'SUBMITTED' then
    select * into v_biz from businesses where id = v_deal.business_id;
    v_photos := not exists (select 1 from deal_media m where m.deal_id = p_deal_id
                            and not is_allowed_photo(m.storage_path, v_deal.business_id));
    if v_biz.verification_status = 'verified' and not v_deal.requires_review
       and not deal_paused_by_admin(p_deal_id) and v_photos then
      return publish_deal_now(p_deal_id, 'verified business');
    end if;
    perform notify_admins('review_needed', 'Deal to review: ' || v_deal.title,
      v_biz.name || case when v_deal.requires_review then ': YOLO paused or turned down this deal or the one it was copied from'
                         when not v_photos then ': a photo needs a look'
                         when v_biz.verification_status = 'verified' then ''
                         else ' is not verified yet' end,
      jsonb_build_object('deal_id', p_deal_id, 'business_id', v_deal.business_id));
  end if;
  return v_status;
end $$;

revoke execute on function transition_deal(uuid, deal_status, actor_kind, text) from public, anon;

/** When a business is verified, its waiting deals go live, except ones YOLO must look at. */
create or replace function business_verified_publish() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if new.verification_status = 'verified' and old.verification_status is distinct from 'verified' then
    for v_id in
      select d.id from deals d
      where d.business_id = new.id and d.status = 'SUBMITTED' and not d.requires_review
        and not deal_paused_by_admin(d.id)
        and deal_publish_problem(d.id) is null
        and not exists (select 1 from deal_media m where m.deal_id = d.id
                        and not is_allowed_photo(m.storage_path, d.business_id))
    loop
      perform publish_deal_now(v_id, 'business verified');
    end loop;
  end if;
  return null;
end $$;

-- -------------------------------------------------------------- 5. reviews --

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
  -- A business's own team cannot rate its own deals (0020).
  if is_business_member((select d.business_id from deals d where d.id = v_action.deal_id)) then
    raise exception 'You cannot review your own business' using errcode = 'P0001';
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
      -- Only what is public: a hidden review shows nowhere but the author's own list (0020).
      and r.status = 'visible'
    order by r.created_at desc
    limit least(greatest(p_limit, 1), 100)
  ))
$$;

-- Reads go through list_reviews and my_reviews; nobody needs the raw rows.
drop policy if exists reviews_read on reviews;
revoke select on reviews from anon, authenticated;

-- ------------------------------------------------------------ 6. activity --

create table if not exists rate_buckets (
  key          text not null,
  bucket_start timestamptz not null,
  hits         int not null default 0,
  primary key (key, bucket_start)
);
alter table rate_buckets enable row level security;
revoke all on rate_buckets from anon, authenticated;

/** Counts one hit for a key in the current window; false once over the limit. */
create or replace function bump_rate(p_key text, p_limit int, p_window interval) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / extract(epoch from p_window)) * extract(epoch from p_window));
  v_hits  int;
begin
  insert into rate_buckets as r (key, bucket_start, hits) values (p_key, v_start, 1)
  on conflict (key, bucket_start) do update set hits = r.hits + 1
  returning hits into v_hits;
  return v_hits <= p_limit;
end $$;

revoke execute on function bump_rate(text, int, interval) from public, anon, authenticated;

create or replace function track(p_events jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_learn   boolean := may_personalise(auth.uid());
  v_e       jsonb;
  v_n       int := 0;
  v_name    text;
  v_deal    uuid;
  v_biz     uuid;
  v_cat     uuid;
  v_session uuid;
  v_uuid    text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_ip      text := split_part(coalesce(nullif(current_setting('request.headers', true), '')::json->>'x-forwarded-for', ''), ',', 1);
  v_names   text[] := array['app_open', 'deal_open', 'shop_open', 'search', 'voice_query', 'cta_tap', 'share',
                            'save', 'unsave', 'not_interested', 'collection_open', 'category_open',
                            'notif_open', 'checkout_start', 'reorder_tap'];
begin
  if jsonb_typeof(p_events) <> 'array' then
    return 0;
  end if;
  -- One network address may send at most 600 events a minute, whatever ids it sends (0020).
  if v_ip <> '' and not bump_rate('track:' || md5(v_ip), 600, interval '1 minute') then
    return 0;
  end if;

  for v_e in select value from jsonb_array_elements(p_events) limit 50 loop
    v_name := v_e->>'name';
    continue when v_name is null or not (v_name = any (v_names));

    v_session := case when coalesce(v_e->>'session_id', '') ~ v_uuid then (v_e->>'session_id')::uuid end;
    -- Signed out, an event must carry its session: that is what caps and dedupes it (0020).
    continue when v_uid is null and v_session is null;
    if v_session is not null and (select count(*) from activity_events
                                  where session_id = v_session and occurred_at > now() - interval '1 minute') > 120 then
      exit;
    end if;

    v_deal := case when coalesce(v_e->>'deal_id', '') ~ v_uuid then (v_e->>'deal_id')::uuid end;
    v_biz := null;
    v_cat := null;
    if v_deal is not null then
      -- Only deals customers can see count (0020): drafts and ended deals are skipped.
      select d.business_id, d.category_id into v_biz, v_cat from deals d where d.id = v_deal and d.status = 'ACTIVE';
      if not found then
        v_deal := null;
      end if;
    end if;
    if v_biz is null and coalesce(v_e->>'business_id', '') ~ v_uuid then
      select b.id into v_biz from businesses b where b.id = (v_e->>'business_id')::uuid;
    end if;

    -- The same look again soon after is one look.
    if v_name in ('deal_open', 'shop_open') and exists (
      select 1 from activity_events a
      where a.name = v_name
        and a.deal_id is not distinct from v_deal
        and a.business_id is not distinct from v_biz
        and ((v_uid is not null and a.profile_id = v_uid)
             or (v_session is not null and a.session_id = v_session))
        and a.occurred_at > now() - interval '30 minutes'
    ) then
      continue;
    end if;

    insert into activity_events (profile_id, session_id, name, surface, position, deal_id, business_id, category_id, query, props)
    values (
      case when v_learn then v_uid end,
      v_session,
      v_name,
      left(nullif(btrim(coalesce(v_e->>'surface', '')), ''), 40),
      case when jsonb_typeof(v_e->'position') = 'number'
           then least(greatest((v_e->>'position')::numeric, 0), 1000)::smallint end,
      v_deal, v_biz, v_cat,
      left(nullif(btrim(coalesce(v_e->>'query', '')), ''), 200),
      case when jsonb_typeof(v_e->'props') = 'object' and length((v_e->'props')::text) <= 2000
           then v_e->'props' else '{}'::jsonb end
    );

    -- Merchant analytics keep their own counters, as record_deal_events did.
    if v_deal is not null and v_name in ('deal_open', 'cta_tap', 'share') then
      insert into deal_events (deal_id, profile_id, event_type, source)
      values (v_deal, case when v_learn then v_uid end,
              case v_name when 'deal_open' then 'view' when 'cta_tap' then 'cta_click' else 'share' end,
              left(v_e->>'surface', 40));
      if v_name = 'deal_open' then
        update deals set view_count = view_count + 1 where id = v_deal;
      end if;
    elsif v_name = 'search' and coalesce(v_e->>'query', '') <> '' then
      insert into search_queries (profile_id, raw_query, parsed_filters, parser, result_count)
      values (case when v_learn then v_uid end,
              left(btrim(v_e->>'query'), 200),
              case when jsonb_typeof(v_e->'props'->'filters') = 'object' then v_e->'props'->'filters' else '{}'::jsonb end,
              case when v_e->'props'->>'parser' in ('llm', 'rules', 'cache') then v_e->'props'->>'parser' else 'rules' end,
              case when jsonb_typeof(v_e->'props'->'result_count') = 'number'
                   then (v_e->'props'->>'result_count')::numeric::int end);
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ---------------------------------------------------------- 7. enquiries --

create or replace function take_deal_action(
  p_deal_id    uuid,
  p_action_type customer_action_type,
  p_quantity   int   default 1,
  p_slot_start timestamptz default null,
  p_payload    jsonb default '{}'::jsonb
) returns customer_actions
language plpgsql security definer set search_path = public as $$
declare
  v_deal     deals;
  v_elig     deal_eligibility;
  v_profile  profiles;
  v_row      customer_actions;
  v_taken    int;
  v_local    timestamp := timezone('Asia/Kolkata', now());
  v_dow      smallint  := extract(dow from v_local)::smallint;
  v_time     time      := v_local::time;
  v_day_ok   boolean;
  v_win_ok   boolean;
begin
  if auth.uid() is null then
    raise exception 'sign in to continue' using errcode = '42501';
  end if;

  select * into v_profile from profiles where id = auth.uid();
  select * into v_deal    from deals    where id = p_deal_id for update;
  if not found then
    raise exception 'deal % not found', p_deal_id using errcode = 'P0002';
  end if;

  if v_deal.status <> 'ACTIVE' then
    raise exception 'this deal is not active' using errcode = 'P0001';
  end if;
  if v_deal.ends_at is not null and v_deal.ends_at <= now() then
    raise exception 'this deal has ended' using errcode = 'P0001';
  end if;
  if p_quantity < 1 then
    raise exception 'quantity must be at least 1' using errcode = 'P0001';
  end if;
  if v_deal.max_qty_per_customer is not null
     and p_quantity > v_deal.max_qty_per_customer then
    raise exception 'limit is % per customer', v_deal.max_qty_per_customer
      using errcode = 'P0001';
  end if;

  select * into v_elig from deal_eligibility where deal_id = p_deal_id;

  if v_elig.min_age is not null then
    if v_profile.date_of_birth is null then
      raise exception 'add your date of birth to claim age-restricted deals'
        using errcode = 'P0001';
    end if;
    if v_profile.date_of_birth > (current_date - (v_elig.min_age || ' years')::interval) then
      raise exception 'this deal is restricted to % and above', v_elig.min_age
        using errcode = 'P0001';
    end if;
  end if;

  if v_elig.audience = 'verified' and not v_profile.is_yolo_verified then
    raise exception 'this deal is for YOLO verified users' using errcode = 'P0001';
  end if;

  -- Availability window, unless this is an advance booking for a later slot.
  if p_slot_start is null then
    select
      (cardinality(coalesce(array_remove(array_agg(distinct day_of_week), null), '{}')) = 0
        or v_dow = any (array_remove(array_agg(distinct day_of_week), null))),
      bool_or(v_time between start_time and end_time)
    into v_day_ok, v_win_ok
    from deal_availability where deal_id = p_deal_id;

    if coalesce(v_day_ok, true) = false or coalesce(v_win_ok, true) = false then
      raise exception 'this deal is not available right now' using errcode = 'P0001';
    end if;
  elsif v_elig.advance_booking_hours is not null
        and p_slot_start < now() + (v_elig.advance_booking_hours || ' hours')::interval then
    raise exception 'book at least % hours ahead', v_elig.advance_booking_hours
      using errcode = 'P0001';
  end if;

  -- One live action per customer per deal, so My Deals cannot fill with dupes.
  select count(*) into v_taken
  from customer_actions
  where deal_id = p_deal_id and customer_id = auth.uid()
    and status in ('pending','confirmed');
  if v_taken > 0 and p_action_type <> 'enquiry' then
    raise exception 'you have already taken this deal' using errcode = 'P0001';
  end if;
  -- One open question per deal: the business has not answered the first yet (0020).
  if p_action_type = 'enquiry' and exists (
    select 1 from customer_actions
    where deal_id = p_deal_id and customer_id = auth.uid()
      and action_type = 'enquiry' and status = 'pending'
  ) then
    raise exception 'you have already asked; the business will reply' using errcode = 'P0001';
  end if;

  -- A question takes nothing from what is left to sell (0020).
  if v_deal.capacity_remaining is not null and p_action_type <> 'enquiry' then
    if v_deal.capacity_remaining < p_quantity then
      raise exception 'only % left', v_deal.capacity_remaining using errcode = 'P0001';
    end if;
    update deals
       set capacity_remaining = capacity_remaining - p_quantity,
           action_count       = action_count + 1
     where id = p_deal_id;
  else
    update deals set action_count = action_count + 1 where id = p_deal_id;
  end if;

  insert into customer_actions (
    deal_id, customer_id, action_type, status, quantity, slot_start,
    redemption_code, payload
  ) values (
    p_deal_id, auth.uid(), p_action_type,
    -- An enquiry stays pending until the merchant replies; everything else
    -- confirms on the spot.
    (case when p_action_type = 'enquiry' then 'pending' else 'confirmed' end)
      ::customer_action_status,
    p_quantity, p_slot_start,
    case when p_action_type in ('claim','booking','reserve','registration')
         then gen_redemption_code() end,
    p_payload
  ) returning * into v_row;

  perform emit_event('action.created', 'action', v_row.id, jsonb_build_object(
    'deal_id',     p_deal_id,
    'business_id', v_deal.business_id,
    'action_type', p_action_type,
    'quantity',    p_quantity,
    'code',        v_row.redemption_code
  ));

  -- Sold out closes the deal in the same transaction.
  if v_deal.capacity_remaining is not null and p_action_type <> 'enquiry'
     and v_deal.capacity_remaining - p_quantity = 0 then
    perform transition_deal_internal(p_deal_id, 'EXPIRED', 'system', 'sold out');
  end if;

  return v_row;
end $$;

create or replace function cancel_action(p_action_id uuid) returns customer_actions
language plpgsql security definer set search_path = public as $$
declare v_row customer_actions;
begin
  select * into v_row from customer_actions where id = p_action_id for update;
  if not found then
    raise exception 'action not found' using errcode = 'P0002';
  end if;
  if v_row.customer_id <> auth.uid() and not current_is_admin() then
    raise exception 'not your booking' using errcode = '42501';
  end if;
  if v_row.status not in ('pending','confirmed') then
    raise exception 'this can no longer be cancelled' using errcode = 'P0001';
  end if;

  update customer_actions set status = 'cancelled' where id = p_action_id
  returning * into v_row;

  update deals
     set capacity_remaining = least(
           coalesce(capacity_remaining, 0) + v_row.quantity, coalesce(capacity_total, 2147483647))
   -- An enquiry took nothing, so it gives nothing back (0020).
   where id = v_row.deal_id and capacity_remaining is not null and v_row.action_type <> 'enquiry';

  perform emit_event('action.cancelled', 'action', p_action_id,
    jsonb_build_object('deal_id', v_row.deal_id));
  return v_row;
end $$;

-- ------------------------------------------------------- 8. consent and age --

drop function if exists erase_activity_of(uuid);

/**
 * Forgets what was learned about one person: activity, views and searches.
 * Their "not for me" choices and chosen interests are instructions, not
 * tracking, so they stay unless the whole account goes (p_everything).
 */
create function erase_activity_of(p_profile_id uuid, p_everything boolean default false) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from activity_events where profile_id = p_profile_id;
  delete from deal_events     where profile_id = p_profile_id;
  delete from search_queries  where profile_id = p_profile_id;
  if p_everything then
    delete from hidden_items      where profile_id = p_profile_id;
    delete from profile_interests where profile_id = p_profile_id;
  end if;
end $$;

revoke execute on function erase_activity_of(uuid, boolean) from public, anon, authenticated;

create or replace function profile_deleted_erase() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    perform erase_activity_of(new.id, true);
  end if;
  return null;
end $$;

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

/** A date of birth showing someone is under 18 ends any learning about them. */
create or replace function profiles_minor_erase() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.date_of_birth is not null and new.date_of_birth is distinct from old.date_of_birth
     and new.date_of_birth > current_date - interval '18 years' then
    perform erase_activity_of(new.id);
    insert into consent_records (profile_id, purpose, granted, notice_version, channel)
    values (new.id, 'adult', false, 'dob', 'app');
  end if;
  return null;
end $$;

drop trigger if exists profiles_minor_erase on profiles;
create trigger profiles_minor_erase
  after update of date_of_birth on profiles
  for each row execute function profiles_minor_erase();

-- --------------------------------------------------------------- 9. taste --

create or replace function my_taste()
returns table (kind text, key text, label text, weight double precision)
language sql stable security definer set search_path = public as $$
  with ok as (
    select may_personalise(auth.uid()) as yes
  ), signals as (
    select e.deal_id,
           1.0 * exp(-extract(epoch from now() - e.occurred_at) / 86400.0 / 30) as w
    from deal_events e, ok
    where ok.yes and e.profile_id = auth.uid()
      and e.event_type = 'view'
      and e.occurred_at > now() - interval '90 days'
    union all
    select s.deal_id, 3.0 * exp(-extract(epoch from now() - s.created_at) / 86400.0 / 30)
    from saved_deals s, ok
    where ok.yes and s.profile_id = auth.uid()
    union all
    select a.deal_id, 5.0 * exp(-extract(epoch from now() - a.created_at) / 86400.0 / 30)
    from customer_actions a, ok
    where ok.yes and a.customer_id = auth.uid()
      and a.status in ('confirmed', 'redeemed')
      and a.created_at > now() - interval '180 days'
  ), per_deal as (
    select deal_id, sum(w) as w from signals group by deal_id
  ), shops as (
    -- Shop pages they opened count towards that shop's kind of business (0020).
    select b.primary_category_id as category_id,
           sum(1.0 * exp(-extract(epoch from now() - a.occurred_at) / 86400.0 / 30)) as w
    from activity_events a, ok
    join businesses b on true
    where ok.yes and a.profile_id = auth.uid() and a.name = 'shop_open'
      and b.id = a.business_id and a.occurred_at > now() - interval '90 days'
    group by b.primary_category_id
  ), asked as (
    -- Words they searched for or asked the assistant, where a deal is tagged with them (0020).
    select lower(w) as tag,
           sum(0.5 * exp(-extract(epoch from now() - a.occurred_at) / 86400.0 / 30)) as w
    from activity_events a, ok
    cross join regexp_split_to_table(coalesce(a.query, ''), '[^[:alnum:]]+') w
    where ok.yes and a.profile_id = auth.uid() and a.name in ('search', 'voice_query')
      and length(w) > 2 and a.occurred_at > now() - interval '90 days'
      and exists (select 1 from tags t where t.slug = lower(w))
    group by lower(w)
  ), cats as (
    select d.category_id, p.w from per_deal p join deals d on d.id = p.deal_id
    union all
    select category_id, w from shops
  ), tagged as (
    select t, p.w from per_deal p join deals d on d.id = p.deal_id cross join unnest(d.tags) t
    union all
    select tag, w from asked
  )
  select * from (
    select 'category'::text, c.slug, c.name, sum(x.w)::double precision
    from cats x
    join categories c on c.id = x.category_id
    where not exists (select 1 from hidden_items h
                      where h.profile_id = auth.uid() and h.kind = 'category' and h.target_id = c.id)
    group by c.slug, c.name
    union all
    select 'tag'::text, t, t, sum(w)::double precision
    from tagged
    group by t
  ) x (kind, key, label, weight)
  order by weight desc
  limit 60
$$;

-- ------------------------------------------------------------- retention --

/** As in 0018, plus old rate-limit windows. */
create or replace function purge_old_activity() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from activity_events where occurred_at < now() - interval '180 days';
  update deal_events set profile_id = null
   where profile_id is not null and occurred_at < now() - interval '180 days';
  update search_queries set profile_id = null
   where profile_id is not null and created_at < now() - interval '180 days';
  delete from outbox_events where dispatched_at is not null and dispatched_at < now() - interval '30 days';
  delete from notifications where read_at is not null and read_at < now() - interval '90 days';
  delete from rate_buckets where bucket_start < now() - interval '1 day';
end $$;
