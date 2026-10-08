-- ============================================================================
-- YOLO Deals — activity that teaches the app, with consent
--
-- The app learns what someone likes from what they do: the deals and shops
-- they open, what they search for or ask the assistant, what they save,
-- book and rate, and what they say "not for me" to. Under the DPDP Act 2023
-- personalisation is a purpose of its own: it needs a separate, recorded
-- consent that is as easy to withdraw as to give, and nothing is learned
-- about anyone who has not said they are 18 or older.
--
--   consent_records  append-only: purpose, yes or no, the notice they saw, how, when
--   activity_events  one row per thing done, written only through track(),
--                    linked to the person only with consent, kept 180 days
--   hidden_items     "not for me": a deal, a place or a kind of thing
--
-- Orders, bookings and reviews run the service and are kept as before; only
-- learning from them (my_taste, feed_for_you) needs the consent.
-- ============================================================================

-- ---------------------------------------------------------------- consent --

create table if not exists consent_records (
  id             bigint generated always as identity primary key,
  profile_id     uuid not null references profiles(id) on delete cascade,
  purpose        text not null check (purpose in ('personalisation', 'voice', 'location', 'marketing', 'adult')),
  granted        boolean not null,
  notice_version text not null,
  channel        text not null check (channel in ('app', 'voice', 'web')),
  created_at     timestamptz not null default now()
);
create index if not exists consent_records_latest on consent_records (profile_id, purpose, created_at desc, id desc);

alter table consent_records enable row level security;
create policy consent_records_own on consent_records for select using (profile_id = auth.uid());
revoke insert, update, delete on consent_records from anon, authenticated;

/** The latest answer for one purpose; no answer means no. */
create or replace function has_consent(p_profile_id uuid, p_purpose text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select granted from consent_records
                   where profile_id = p_profile_id and purpose = p_purpose
                   order by created_at desc, id desc limit 1), false)
$$;

/** Learning from someone's activity needs both: a yes to it, and 18 or older. */
create or replace function may_personalise(p_profile_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_profile_id is not null
     and has_consent(p_profile_id, 'personalisation')
     and has_consent(p_profile_id, 'adult')
$$;

revoke execute on function has_consent(uuid, text)  from public, anon, authenticated;
revoke execute on function may_personalise(uuid)    from public, anon, authenticated;

-- ---------------------------------------------------------------- activity --

create table if not exists activity_events (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  -- Only with consent; otherwise the row counts for the shop, not the person.
  profile_id  uuid references profiles(id) on delete cascade,
  -- A random id per app session, never tied to the account: dedupes and caps.
  session_id  uuid,
  name        text not null,
  surface     text,
  position    smallint,
  deal_id     uuid references deals(id) on delete set null,
  business_id uuid references businesses(id) on delete set null,
  category_id uuid references categories(id) on delete set null,
  query       text,
  props       jsonb not null default '{}'
);
create index if not exists activity_events_profile on activity_events (profile_id, occurred_at desc) where profile_id is not null;
create index if not exists activity_events_session on activity_events (session_id, occurred_at desc) where session_id is not null;
create index if not exists activity_events_name    on activity_events (name, occurred_at desc);

alter table activity_events enable row level security;
-- "What do you know about me": your own rows only. Writes go through track().
create policy activity_events_own on activity_events for select using (profile_id = auth.uid());
revoke insert, update, delete on activity_events from anon, authenticated;

create table if not exists hidden_items (
  profile_id uuid not null references profiles(id) on delete cascade,
  kind       text not null check (kind in ('deal', 'business', 'category')),
  target_id  uuid not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, kind, target_id)
);
alter table hidden_items enable row level security;
create policy hidden_items_own_read   on hidden_items for select using (profile_id = auth.uid());
create policy hidden_items_own_delete on hidden_items for delete using (profile_id = auth.uid());
revoke insert, update on hidden_items from anon, authenticated;

/**
 * Records what someone did, up to 50 events a call. Unknown event names are
 * skipped, deals and businesses must exist, a deal or shop opened again within
 * 30 minutes counts once, and a session sending more than 120 events a minute
 * is ignored. The person is linked only if they agreed to personalisation;
 * without it the row still counts for the shop's analytics.
 */
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
  v_names   text[] := array['app_open', 'deal_open', 'shop_open', 'search', 'voice_query', 'cta_tap', 'share',
                            'save', 'unsave', 'not_interested', 'collection_open', 'category_open',
                            'notif_open', 'checkout_start', 'reorder_tap'];
begin
  if jsonb_typeof(p_events) <> 'array' then
    return 0;
  end if;

  for v_e in select value from jsonb_array_elements(p_events) limit 50 loop
    v_name := v_e->>'name';
    continue when v_name is null or not (v_name = any (v_names));

    v_session := case when coalesce(v_e->>'session_id', '') ~ v_uuid then (v_e->>'session_id')::uuid end;
    if v_session is not null and (select count(*) from activity_events
                                  where session_id = v_session and occurred_at > now() - interval '1 minute') > 120 then
      exit;
    end if;

    v_deal := case when coalesce(v_e->>'deal_id', '') ~ v_uuid then (v_e->>'deal_id')::uuid end;
    v_biz := null;
    v_cat := null;
    if v_deal is not null then
      select d.business_id, d.category_id into v_biz, v_cat from deals d where d.id = v_deal;
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

grant execute on function track(jsonb) to anon, authenticated;

/**
 * The older entry point, kept for older app versions: capped, deals must
 * exist, and a signed-in view of the same deal within 30 minutes counts once.
 */
create or replace function record_deal_events(p_events jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_item  jsonb;
  v_count int := 0;
  v_deal  uuid;
  v_type  text;
  v_learn boolean := may_personalise(auth.uid());
begin
  if jsonb_typeof(p_events) <> 'array' then
    return 0;
  end if;
  for v_item in select value from jsonb_array_elements(p_events) limit 50 loop
    v_type := v_item->>'event_type';
    continue when v_type is null or v_type not in ('view', 'cta_click', 'share', 'impression', 'search_appearance');
    select id into v_deal from deals
     where id::text = coalesce(v_item->>'deal_id', '') and status = 'ACTIVE';
    continue when v_deal is null;
    if v_type = 'view' and auth.uid() is not null and exists (
      select 1 from deal_events e where e.deal_id = v_deal and e.profile_id = auth.uid()
        and e.event_type = 'view' and e.occurred_at > now() - interval '30 minutes'
    ) then
      continue;
    end if;

    insert into deal_events (deal_id, profile_id, event_type, source)
    values (v_deal, case when v_learn then auth.uid() end, v_type, left(v_item->>'source', 40));
    if v_type = 'view' then
      update deals set view_count = view_count + 1 where id = v_deal;
    elsif v_type = 'search_appearance' then
      update deals set search_count = search_count + 1 where id = v_deal;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- Raw events and search logs are written only through the functions above.
drop policy if exists deal_events_insert     on deal_events;
drop policy if exists search_queries_insert  on search_queries;
revoke insert, update, delete on deal_events, search_queries from anon, authenticated;

-- ------------------------------------------------------------ "not for me" --

/**
 * "Not for me": this deal, this place, or this kind of thing is never
 * suggested again. An instruction rather than tracking, so it is kept
 * whatever the consent; "Show again" deletes the row.
 */
create or replace function not_interested(p_deal_id uuid, p_scope text default 'deal') returns void
language plpgsql security definer set search_path = public as $$
declare
  v_deal deals;
  v_target uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to tune your suggestions' using errcode = '42501';
  end if;
  select * into v_deal from deals where id = p_deal_id;
  if not found then
    raise exception 'That deal is not there any more' using errcode = 'P0001';
  end if;
  v_target := case p_scope when 'business' then v_deal.business_id
                           when 'category' then v_deal.category_id
                           else v_deal.id end;
  insert into hidden_items (profile_id, kind, target_id)
  values (auth.uid(), case when p_scope in ('business', 'category') then p_scope else 'deal' end, v_target)
  on conflict do nothing;
end $$;

revoke execute on function not_interested(uuid, text) from public, anon;
grant  execute on function not_interested(uuid, text) to authenticated;

-- ------------------------------------------------------ consent and erasure --

/** Forgets everything learned about one person: activity, views, searches, hidden items, interests. */
create or replace function erase_activity_of(p_profile_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from activity_events   where profile_id = p_profile_id;
  delete from deal_events       where profile_id = p_profile_id;
  delete from search_queries    where profile_id = p_profile_id;
  delete from hidden_items      where profile_id = p_profile_id;
  delete from profile_interests where profile_id = p_profile_id;
end $$;

revoke execute on function erase_activity_of(uuid) from public, anon, authenticated;

/** "Clear my activity": one tap, takes effect at once. */
create or replace function erase_my_activity() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  perform erase_activity_of(auth.uid());
end $$;

revoke execute on function erase_my_activity() from public, anon;
grant  execute on function erase_my_activity() to authenticated;

/**
 * Records a yes or no for one purpose. Saying no to personalisation also
 * forgets what was learned, so withdrawing is as complete as it is easy.
 */
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
  insert into consent_records (profile_id, purpose, granted, notice_version, channel)
  values (auth.uid(), p_purpose, coalesce(p_granted, false),
          left(coalesce(nullif(btrim(p_notice_version), ''), 'v1'), 20),
          case when p_channel in ('app', 'voice', 'web') then p_channel else 'app' end);
  if p_purpose in ('personalisation', 'adult') and not coalesce(p_granted, false) then
    perform erase_activity_of(auth.uid());
  end if;
end $$;

revoke execute on function set_consent(text, boolean, text, text) from public, anon;
grant  execute on function set_consent(text, boolean, text, text) to authenticated;

/** Each purpose's latest answer, for the privacy screen and the app. */
create or replace function my_consents()
returns table (purpose text, granted boolean, notice_version text, channel text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select distinct on (c.purpose) c.purpose, c.granted, c.notice_version, c.channel, c.created_at
  from consent_records c
  where c.profile_id = auth.uid()
  order by c.purpose, c.created_at desc, c.id desc
$$;

revoke execute on function my_consents() from public, anon;
grant  execute on function my_consents() to authenticated;

/** "What do you know about me": counts of what was recorded, last 180 days. */
create or replace function my_activity_summary()
returns table (name text, events bigint, last_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.name, count(*), max(a.occurred_at)
  from activity_events a
  where a.profile_id = auth.uid() and a.occurred_at > now() - interval '180 days'
  group by a.name
  order by count(*) desc
$$;

revoke execute on function my_activity_summary() from public, anon;
grant  execute on function my_activity_summary() to authenticated;

-- A deleted account's learning goes with it, the moment deletion is asked for.
create or replace function profile_deleted_erase() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    perform erase_activity_of(new.id);
  end if;
  return null;
end $$;

drop trigger if exists profiles_deleted_erase on profiles;
create trigger profiles_deleted_erase
  after update of deleted_at on profiles
  for each row execute function profile_deleted_erase();

-- --------------------------------------------------------------- learning --

/**
 * As in 0009, now only with consent: empty for anyone who has not agreed to
 * personalisation and said they are 18 or older. Cancelled actions and
 * unanswered enquiries no longer count as liking something.
 */
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
  )
  select * from (
    select 'category'::text, c.slug, c.name, sum(p.w)::double precision
    from per_deal p
    join deals d      on d.id = p.deal_id
    join categories c on c.id = d.category_id
    where not exists (select 1 from hidden_items h
                      where h.profile_id = auth.uid() and h.kind = 'category' and h.target_id = c.id)
    group by c.slug, c.name
    union all
    select 'tag'::text, t, t, sum(p.w)::double precision
    from per_deal p
    join deals d on d.id = p.deal_id
    cross join unnest(d.tags) t
    group by t
  ) x (kind, key, label, weight)
  order by weight desc
  limit 60
$$;

/**
 * As in 0009, leaving out anything they said "not for me" to: the deal, the
 * place, or the kind of thing.
 */
create or replace function feed_for_you(
  p_lat      double precision,
  p_lng      double precision,
  p_radius_m int default 5000,
  p_limit    int default 12
) returns setof deal_card
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return;
  end if;

  return query
  with taste as (
    select t.kind, t.key, t.weight from my_taste() t
  ), top as (
    select coalesce(max(weight) filter (where kind = 'category'), 0) as cat_max,
           coalesce(max(weight) filter (where kind = 'tag'), 0)      as tag_max
    from taste
  ), near as (
    select f.* from feed_nearby(p_lat, p_lng, p_radius_m, 'near_you', 300, 0) f
  )
  select n.*
  from near n
  cross join top
  cross join lateral (
    select
      0.6 * coalesce((select t.weight from taste t
                      where t.kind = 'category' and t.key = n.category_slug)
                     / nullif(top.cat_max, 0), 0)
      + 0.4 * least(coalesce((select sum(t.weight) from taste t
                              where t.kind = 'tag' and t.key = any (n.tags))
                             / nullif(top.tag_max, 0), 0), 1)
      as a
  ) aff
  where aff.a > 0
    and not exists (
      select 1 from customer_actions ca
      where ca.deal_id = n.id and ca.customer_id = auth.uid()
    )
    and not exists (
      select 1 from hidden_items h
      where h.profile_id = auth.uid()
        and ((h.kind = 'deal' and h.target_id = n.id)
             or (h.kind = 'business' and h.target_id = n.business_id)
             or (h.kind = 'category' and h.target_id = n.category_id))
    )
  order by aff.a * 0.65 + coalesce(n.score, 0) * 0.35 desc, n.distance_km
  limit greatest(p_limit, 1);
end $$;

-- -------------------------------------------------------------- retention --

/**
 * Daily: activity tied to a person is kept 180 days, then dropped; views and
 * searches lose their link to the person; delivered outbox rows go after 30
 * days and read notifications after 90.
 */
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
end $$;

revoke execute on function purge_old_activity() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not available here; the retention job was not scheduled';
    return;
  end if;
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'purge-old-activity';
  perform cron.schedule('purge-old-activity', '30 21 * * *', 'select public.purge_old_activity()');
end $$;
