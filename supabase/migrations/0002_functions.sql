-- ============================================================================
-- YOLO Deals — 0003_functions: the five PRD engines as RPCs
--
--   Deal Engine        transition_deal, review_deal, save_deal_draft
--   Taxonomy Engine    reads straight off categories / deal_types
--   Local Search       feed_nearby, search_deals  (PostGIS + FTS + SQL ranking)
--   Trust Engine       review_deal, review_business, report_target
--   Action Engine      take_deal_action, cancel_action, redeem_action
--
-- Every state change goes through a SECURITY DEFINER function that checks
-- ownership and the allowed transition, so a client holding an anon key cannot
-- move a deal or mint a redemption code by writing to a table directly.
-- ============================================================================

-- --------------------------------------------------------------- helpers ---

create or replace function current_is_admin() returns boolean
language sql stable as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;

create or replace function is_business_member(p_business_id uuid) returns boolean
language sql stable as $$
  select exists (
    select 1 from business_members
    where business_id = p_business_id and profile_id = auth.uid()
  );
$$;

/** Short, unambiguous redemption code. No O/0/I/1 so staff can read it aloud. */
create or replace function gen_redemption_code() returns text
language plpgsql as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  i int;
begin
  loop
    code := 'YOLO-';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from customer_actions where redemption_code = code);
  end loop;
  return code;
end $$;

/** Writes to the outbox inside the caller's transaction. */
create or replace function emit_event(
  p_type           text,
  p_aggregate_type text,
  p_aggregate_id   uuid,
  p_payload        jsonb default '{}'::jsonb,
  p_actor_id       uuid  default null
) returns uuid
language plpgsql as $$
declare v_id uuid;
begin
  insert into outbox_events (type, aggregate_type, aggregate_id, actor_id, payload)
  values (p_type, p_aggregate_type, p_aggregate_id, coalesce(p_actor_id, auth.uid()), p_payload)
  returning id into v_id;
  return v_id;
end $$;

create or replace function notify_profile(
  p_profile_id uuid, p_kind text, p_title text, p_body text, p_data jsonb default '{}'::jsonb
) returns void
language sql as $$
  insert into notifications (profile_id, kind, title, body, data)
  values (p_profile_id, p_kind, p_title, p_body, p_data);
$$;

-- ------------------------------------------------- denormalized read view --
-- One place that flattens a deal into what a card needs. feed_nearby and
-- search_deals both read from here, so the two never drift apart.

create or replace view deal_card_base as
select
  d.id,
  d.business_id,
  d.category_id,
  d.deal_type_code,
  d.offering_kind,
  d.title,
  d.short_description,
  d.description,
  d.status,
  d.original_price,
  d.deal_price,
  d.discount_pct,
  -- char(3) on the table, text in the deal_card composite: cast once here so
  -- every reader inherits it.
  d.currency::text as currency,
  d.price_unit,
  d.taxes_note,
  d.min_purchase,
  d.max_qty_per_customer,
  d.starts_at,
  d.ends_at,
  d.capacity_total,
  d.capacity_remaining,
  d.booking_required,
  d.fulfilment,
  d.cancellation_policy,
  d.terms,
  d.attributes,
  d.tags,
  d.location,
  d.search_radius_m,
  d.search_vector,
  d.rejection_reason,
  d.published_at,
  d.rating_avg,
  d.rating_count,
  d.view_count,
  d.search_count,
  d.created_at,

  b.name                             as business_name,
  b.phone                            as business_phone,
  (b.verification_status = 'verified') as is_verified,
  b.rating_avg                       as business_rating,

  c.slug                             as category_slug,
  c.name                             as category_name,
  c.vertical                         as vertical,
  c.icon                             as category_icon,

  bl.address_line                    as address_line,
  coalesce(loc.name, bl.city)        as locality_name,

  coalesce(med.url, '')              as image_url,
  coalesce(act.primary_cta, 'claim'::cta_type) as primary_cta,
  coalesce(act.secondary_ctas, '{}')  as secondary_ctas,

  coalesce(av.days, '{}')            as availability_days,
  coalesce(av.start_time, '00:00'::time) as availability_start,
  coalesce(av.end_time,   '23:59'::time) as availability_end,

  el.audience                        as audience,
  el.min_age                         as min_age,
  el.min_spend                       as min_spend,
  el.membership_required             as membership_required,
  el.advance_booking_hours           as advance_booking_hours,
  el.custom_rule                     as custom_rule
from deals d
join businesses b on b.id = d.business_id
join categories c on c.id = d.category_id
left join lateral (
  select * from business_locations x
  where x.business_id = d.business_id
  order by x.is_primary desc, x.id
  limit 1
) bl on true
left join localities loc on loc.id = bl.locality_id
left join lateral (
  select storage_path as url from deal_media m
  where m.deal_id = d.id and m.kind = 'image'
  order by m.position limit 1
) med on true
left join lateral (
  select
    max(case when a.is_primary then a.action_type end)                       as primary_cta,
    array_remove(array_agg(case when not a.is_primary then a.action_type end
                           order by a.sort_order), null)                      as secondary_ctas
  from deal_actions a where a.deal_id = d.id
) act on true
left join lateral (
  select
    array_remove(array_agg(distinct a.day_of_week), null) as days,
    min(a.start_time) as start_time,
    max(a.end_time)   as end_time
  from deal_availability a where a.deal_id = d.id
) av on true
left join deal_eligibility el on el.deal_id = d.id;

-- ------------------------------------------------------- shared row type ---
-- The exact shape the TypeScript mapping layer expects back from both reads.

create type deal_card as (
  id                    uuid,
  business_id           uuid,
  category_id           uuid,
  deal_type_code        text,
  offering_kind         offering_kind,
  title                 text,
  short_description     text,
  description           text,
  status                deal_status,
  original_price        numeric,
  deal_price            numeric,
  discount_pct          numeric,
  currency              text,
  price_unit            text,
  taxes_note            text,
  min_purchase          numeric,
  max_qty_per_customer  int,
  starts_at             timestamptz,
  ends_at               timestamptz,
  capacity_total        int,
  capacity_remaining    int,
  booking_required      boolean,
  cancellation_policy   text,
  terms                 text,
  attributes            jsonb,
  tags                  text[],
  lat                   double precision,
  lng                   double precision,
  published_at          timestamptz,
  rating_avg            numeric,
  rating_count          int,
  view_count            int,
  search_count          int,
  business_name         text,
  business_phone        text,
  is_verified           boolean,
  category_slug         text,
  category_name         text,
  vertical              text,
  category_icon         text,
  address_line          text,
  locality_name         text,
  image_url             text,
  primary_cta           cta_type,
  secondary_ctas        cta_type[],
  availability_days     smallint[],
  availability_start    time,
  availability_end      time,
  min_age               smallint,
  min_spend             numeric,
  distance_km           double precision,
  ending_soon           boolean,
  score                 double precision
);

-- -------------------------------------------------------------- ranking ----
-- Mirrors src/domain/ranking.ts exactly. Weights live in ranking_config so
-- they can be tuned without shipping an app release.

create or replace function deal_score(
  p_relevance double precision,
  p_distance_km double precision,
  p_radius_km double precision,
  p_discount_pct numeric,
  p_published_at timestamptz,
  p_rating_avg numeric,
  p_rating_count int,
  p_is_verified boolean,
  p_ends_at timestamptz,
  p_avail_days smallint[],
  p_avail_start time,
  p_avail_end time
) returns double precision
language plpgsql stable as $$
declare
  w              ranking_config;
  v_now          timestamptz := now();
  v_local        timestamp   := timezone('Asia/Kolkata', now());
  v_dow          smallint    := extract(dow from v_local)::smallint;
  v_time         time        := v_local::time;
  s_distance     double precision;
  s_available    double precision;
  s_value        double precision;
  s_fresh        double precision;
  s_rating       double precision;
  s_urgency      double precision;
  v_day_ok       boolean;
begin
  select * into w from ranking_config where id = 1;

  -- Distance: 1 at the user's feet, 0 at the edge of the radius.
  s_distance := 1 - least(p_distance_km / greatest(p_radius_km, 0.1), 1);

  -- Availability now: open = 1, opens later today = 0.5, otherwise 0.
  v_day_ok := (p_avail_days is null or cardinality(p_avail_days) = 0
               or v_dow = any (p_avail_days));
  if v_day_ok and v_time between p_avail_start and p_avail_end then
    s_available := 1.0;
  elsif v_day_ok and v_time < p_avail_start then
    s_available := 0.5;
  else
    s_available := 0.0;
  end if;

  -- Deal value: normalized discount, capped at 70% so a 95% "deal" cannot buy rank.
  s_value := least(coalesce(p_discount_pct, 0)::double precision, 70) / 70;

  -- Freshness: linear decay over 7 days since publish.
  s_fresh := greatest(
    0, 1 - (extract(epoch from (v_now - coalesce(p_published_at, v_now))) / (7 * 86400))
  );

  -- Rating: Bayesian average, prior 4.0 weighted as 5 reviews, so one 5-star
  -- review does not outrank a 4.6 with 400.
  s_rating := ((coalesce(p_rating_avg, 0)::double precision * coalesce(p_rating_count, 0)
                + 4.0 * 5) / (coalesce(p_rating_count, 0) + 5)) / 5;

  -- Urgency: boost inside the last 24 hours.
  s_urgency := case
    when p_ends_at is null then 0
    when p_ends_at <= v_now + interval '24 hours' then 1
    else 0
  end;

  return w.w_relevance * least(coalesce(p_relevance, 0), 1)
       + w.w_distance  * s_distance
       + w.w_available * s_available
       + w.w_value     * s_value
       + w.w_fresh     * s_fresh
       + w.w_rating    * s_rating
       + w.w_verified  * (case when p_is_verified then 1 else 0 end)
       + w.w_urgency   * s_urgency;
end $$;

-- ------------------------------------------------------------ feed read ----
-- Home sections. Hard filters run first against the GiST index, so the score
-- is only computed for candidates already inside the radius.

create or replace function feed_nearby(
  p_lat        double precision,
  p_lng        double precision,
  p_radius_m   int     default 3000,
  p_section    text    default 'near_you',
  p_limit      int     default 20,
  p_offset     int     default 0
) returns setof deal_card
language plpgsql stable security definer set search_path = public as $$
declare
  v_origin geography := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
  v_dob    date      := (select date_of_birth from profiles where id = auth.uid());
  v_local  timestamp := timezone('Asia/Kolkata', now());
  v_dow    smallint  := extract(dow from v_local)::smallint;
begin
  return query
  with candidates as (
    select
      v.*,
      st_distance(v.location, v_origin) / 1000.0 as distance_km
    from deal_card_base v
    where v.status = 'ACTIVE'
      and (v.ends_at is null or v.ends_at > now())
      and (v.starts_at is null or v.starts_at <= now())
      and v.location is not null
      and st_dwithin(v.location, v_origin, p_radius_m)
      -- Age gate: hidden unless the profile proves the minimum age.
      and (
        v.min_age is null
        or (v_dob is not null and v_dob <= (current_date - (v.min_age || ' years')::interval))
      )
  ), scored as (
    select
      c.*,
      (c.ends_at is not null and c.ends_at <= now() + interval '24 hours') as ending_soon,
      deal_score(
        0.5, c.distance_km, p_radius_m / 1000.0, c.discount_pct, c.published_at,
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
    s.distance_km, s.ending_soon, s.score
  from scored s
  where case p_section
    -- Open right now, on a day the deal runs.
    when 'today' then
      (cardinality(s.availability_days) = 0 or v_dow = any (s.availability_days))
    when 'ending_soon' then s.ending_soon
    when 'new'         then s.published_at >= now() - interval '3 days'
    else true
  end
  order by
    case p_section
      when 'trending'    then -(s.view_count::double precision)
      when 'new'         then -(extract(epoch from s.published_at))
      when 'ending_soon' then  extract(epoch from s.ends_at)
      else                    -s.score
    end,
    s.distance_km
  limit  greatest(p_limit, 1)
  offset greatest(p_offset, 0);
end $$;

-- ---------------------------------------------------------- search read ----
-- Filters arrive as one jsonb object so the TypeScript SearchFilters type maps
-- 1:1 onto this call and the signature does not grow a parameter per filter.

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
  v_tsq       tsquery;
  v_radius_km double precision := coalesce((p_filters->>'radius_km')::double precision, 5);
  v_locality  text    := nullif(p_filters->>'locality', '');
  v_origin    geography;
  v_dob       date    := (select date_of_birth from profiles where id = auth.uid());
  v_types     text[]  := case when p_filters ? 'deal_types'
                              then array(select jsonb_array_elements_text(p_filters->'deal_types'))
                              else null end;
  v_days      int[]   := case when p_filters ? 'day_of_week'
                              then array(select (jsonb_array_elements_text(p_filters->'day_of_week'))::int)
                              else null end;
  v_tod       text    := nullif(p_filters->>'time_of_day', '');
  v_from      time;
  v_to        time;
  -- Cleaned query words, matched against the tags array. Tags cannot live in
  -- the generated search_vector (see 0001_init), so they are matched here.
  v_terms     text[]  := '{}';
begin
  -- A named locality replaces the device location as the search centre.
  if v_locality is not null then
    select l.centroid into v_origin
    from localities l
    where lower(l.name) = lower(v_locality)
       or lower(v_locality) = any (l.aliases)
    limit 1;
  end if;
  v_origin := coalesce(v_origin, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography);

  if v_q is not null then
    v_terms := array(
      select regexp_replace(w, '[^a-zA-Z0-9]', '', 'g')
      from unnest(string_to_array(lower(v_q), ' ')) w
      where length(regexp_replace(w, '[^a-zA-Z0-9]', '', 'g')) > 2
    );
    -- Prefix-match every word so "biry" still finds biryani.
    v_tsq := to_tsquery('simple',
      array_to_string(
        array(select regexp_replace(w, '[^a-zA-Z0-9]', '', 'g') || ':*'
              from unnest(string_to_array(lower(v_q), ' ')) w
              where regexp_replace(w, '[^a-zA-Z0-9]', '', 'g') <> ''),
        ' & '
      )
    );
  end if;

  v_from := case v_tod when 'morning' then '06:00'::time when 'lunch' then '12:00'::time
                       when 'evening' then '17:00'::time when 'night'  then '21:00'::time end;
  v_to   := case v_tod when 'morning' then '11:00'::time when 'lunch' then '15:30'::time
                       when 'evening' then '21:00'::time when 'night'  then '23:59'::time end;

  return query
  with candidates as (
    select
      v.*,
      st_distance(v.location, v_origin) / 1000.0 as distance_km,
      case
        when v_tsq is null then 0.5
        else least(
          ts_rank(v.search_vector, v_tsq)::double precision * 4
            + similarity(lower(v.title), lower(v_q))::double precision
            + case when v.tags && v_terms then 0.35 else 0 end,
          1.0
        )
      end as relevance
    from deal_card_base v
    where v.status = 'ACTIVE'
      and (v.ends_at is null or v.ends_at > now())
      and (v.starts_at is null or v.starts_at <= now())
      and v.location is not null
      and st_dwithin(v.location, v_origin, (v_radius_km * 1000)::int)
      and (v_tsq is null or v.search_vector @@ v_tsq
           or v.tags && v_terms
           or similarity(lower(v.title), lower(v_q)) > 0.25)
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
      and (
        v.min_age is null
        or (v_dob is not null and v_dob <= (current_date - (v.min_age || ' years')::interval))
      )
  ), scored as (
    select
      c.*,
      (c.ends_at is not null and c.ends_at <= now() + interval '24 hours') as ending_soon,
      deal_score(
        c.relevance, c.distance_km, v_radius_km, c.discount_pct, c.published_at,
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
    s.distance_km, s.ending_soon, s.score
  from scored s
  order by
    case coalesce(p_filters->>'sort', 'relevance')
      when 'distance'    then  s.distance_km
      when 'ending_soon' then  extract(epoch from s.ends_at)
      when 'best_value'  then -coalesce(s.discount_pct, 0)::double precision
      else                    -s.score
    end
  limit  greatest(p_limit, 1)
  offset greatest(p_offset, 0);
end $$;

create or replace function get_deal(p_deal_id uuid, p_lat double precision default null,
                                    p_lng double precision default null)
returns setof deal_card
language plpgsql stable security definer set search_path = public as $$
declare
  v_origin geography := case
    when p_lat is null or p_lng is null then null
    else st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography end;
begin
  return query
  select
    v.id, v.business_id, v.category_id, v.deal_type_code, v.offering_kind,
    v.title, v.short_description, v.description, v.status,
    v.original_price, v.deal_price, v.discount_pct, v.currency,
    v.price_unit, v.taxes_note, v.min_purchase, v.max_qty_per_customer,
    v.starts_at, v.ends_at, v.capacity_total, v.capacity_remaining,
    v.booking_required, v.cancellation_policy, v.terms, v.attributes, v.tags,
    st_y(v.location::geometry), st_x(v.location::geometry),
    v.published_at, v.rating_avg, v.rating_count, v.view_count, v.search_count,
    v.business_name, v.business_phone, v.is_verified,
    v.category_slug, v.category_name, v.vertical, v.category_icon,
    v.address_line, v.locality_name, v.image_url,
    v.primary_cta, v.secondary_ctas,
    v.availability_days, v.availability_start, v.availability_end,
    v.min_age, v.min_spend,
    case when v_origin is null then 0
         else st_distance(v.location, v_origin) / 1000.0 end,
    (v.ends_at is not null and v.ends_at <= now() + interval '24 hours'),
    0::double precision
  from deal_card_base v
  where v.id = p_deal_id;
end $$;

-- ------------------------------------------------------ lifecycle engine ---

/**
 * The trusted core. It takes the actor on faith, so it is never granted to
 * anon or authenticated — only other SECURITY DEFINER functions call it.
 *
 * It exists because some legitimate transitions are made by 'system' while a
 * customer is the one signed in: claiming the last unit sells a deal out, and
 * approving one walks it PUBLISHED -> ACTIVE. Deriving the actor from the
 * session, as the public wrapper does, would refuse both.
 */
create or replace function transition_deal_internal(
  p_deal_id   uuid,
  p_to_status deal_status,
  p_actor     actor_kind,
  p_reason    text default null
) returns deal_status
language plpgsql security definer set search_path = public as $$
declare
  v_deal  deals;
  v_actor actor_kind := p_actor;
begin
  select * into v_deal from deals where id = p_deal_id for update;
  if not found then
    raise exception 'deal % not found', p_deal_id using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from deal_transitions
    where from_status = v_deal.status and to_status = p_to_status and actor = v_actor
  ) then
    raise exception '% cannot move a deal from % to %', v_actor, v_deal.status, p_to_status
      using errcode = 'P0001';
  end if;

  if p_to_status = 'REJECTED' and coalesce(trim(p_reason), '') = '' then
    raise exception 'a rejection reason is required' using errcode = 'P0001';
  end if;

  update deals set
    status           = p_to_status,
    rejection_reason = case when p_to_status = 'REJECTED' then p_reason
                            when p_to_status = 'DRAFT'    then null
                            else rejection_reason end,
    published_at     = case when p_to_status = 'PUBLISHED' and published_at is null
                            then now() else published_at end
  where id = p_deal_id;

  insert into deal_status_history (deal_id, from_status, to_status, actor, actor_id, reason)
  values (p_deal_id, v_deal.status, p_to_status, v_actor, auth.uid(), p_reason);

  perform emit_event(
    'deal.' || lower(p_to_status::text), 'deal', p_deal_id,
    jsonb_build_object(
      'from',    v_deal.status,
      'to',      p_to_status,
      'actor',   v_actor,
      'reason',  p_reason,
      'business_id', v_deal.business_id,
      'title',   v_deal.title
    )
  );

  return p_to_status;
end $$;

/**
 * The client-facing entry point. Resolves who is really acting from the
 * session rather than trusting p_actor, then defers to the core. p_actor is
 * kept in the signature for call-site readability and is ignored.
 */
create or replace function transition_deal(
  p_deal_id   uuid,
  p_to_status deal_status,
  p_actor     actor_kind default 'merchant',
  p_reason    text       default null
) returns deal_status
language plpgsql security definer set search_path = public as $$
declare
  v_deal  deals;
  v_actor actor_kind;
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

  return transition_deal_internal(p_deal_id, p_to_status, v_actor, p_reason);
end $$;

/**
 * Admin decision from the review queue. Approving runs the whole tail of the
 * lifecycle in one transaction: APPROVED -> PUBLISHED, and straight on to
 * ACTIVE when the start time has already passed.
 */
create or replace function review_deal(
  p_deal_id uuid,
  p_approve boolean,
  p_reason  text default null
) returns deal_status
language plpgsql security definer set search_path = public as $$
declare
  v_deal   deals;
  v_status deal_status;
  v_owner  uuid;
begin
  if not current_is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select * into v_deal from deals where id = p_deal_id;
  if not found then
    raise exception 'deal % not found', p_deal_id using errcode = 'P0002';
  end if;

  if v_deal.status = 'SUBMITTED' then
    perform transition_deal(p_deal_id, 'VERIFICATION', 'admin');
  end if;

  if not p_approve then
    v_status := transition_deal(p_deal_id, 'REJECTED', 'admin', p_reason);
  else
    perform transition_deal(p_deal_id, 'APPROVED',  'admin');
    v_status := transition_deal(p_deal_id, 'PUBLISHED', 'admin');
    if v_deal.starts_at is null or v_deal.starts_at <= now() then
      v_status := transition_deal_internal(p_deal_id, 'ACTIVE', 'system');
    end if;
  end if;

  select profile_id into v_owner
  from business_members
  where business_id = v_deal.business_id and member_role = 'owner'
  limit 1;

  if v_owner is not null then
    perform notify_profile(
      v_owner,
      case when p_approve then 'deal_approved' else 'deal_rejected' end,
      case when p_approve then 'Deal approved' else 'Deal needs changes' end,
      case when p_approve
           then v_deal.title || ' is live and visible to customers.'
           else coalesce(p_reason, 'Please review and resubmit.') end,
      jsonb_build_object('deal_id', p_deal_id)
    );
  end if;

  return v_status;
end $$;

-- -------------------------------------------------------- action engine ----
-- Eligibility, the time window and capacity are all checked inside one
-- transaction with the row locked, so two people claiming the last unit cannot
-- both succeed.

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

  if v_deal.capacity_remaining is not null then
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
  if v_deal.capacity_remaining is not null
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
   where id = v_row.deal_id and capacity_remaining is not null;

  perform emit_event('action.cancelled', 'action', p_action_id,
    jsonb_build_object('deal_id', v_row.deal_id));
  return v_row;
end $$;

/** Merchant-side counter scan: look a code up and mark it used. */
create or replace function redeem_action(p_code text) returns customer_actions
language plpgsql security definer set search_path = public as $$
declare
  v_row  customer_actions;
  v_biz  uuid;
begin
  select * into v_row
  from customer_actions
  where redemption_code = upper(trim(p_code))
  for update;

  if not found then
    raise exception 'code not recognised' using errcode = 'P0002';
  end if;

  select business_id into v_biz from deals where id = v_row.deal_id;
  if not (is_business_member(v_biz) or current_is_admin()) then
    raise exception 'not your deal' using errcode = '42501';
  end if;
  if v_row.status = 'redeemed' then
    raise exception 'already redeemed at %', v_row.redeemed_at using errcode = 'P0001';
  end if;
  if v_row.status <> 'confirmed' then
    raise exception 'this code is %', v_row.status using errcode = 'P0001';
  end if;

  update customer_actions
     set status = 'redeemed', redeemed_at = now()
   where id = v_row.id
  returning * into v_row;

  perform emit_event('action.redeemed', 'action', v_row.id,
    jsonb_build_object('deal_id', v_row.deal_id, 'business_id', v_biz));
  return v_row;
end $$;

-- ---------------------------------------------------- merchant authoring ---
-- One upsert for the whole 7-step wizard. Each "Next" and "Save Draft" sends
-- the accumulated object, so a half-finished deal is never lost.

create or replace function save_deal_draft(p_deal jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id    uuid := nullif(p_deal->>'id', '')::uuid;
  v_biz   uuid := (p_deal->>'business_id')::uuid;
  v_cat   uuid;
  v_item  jsonb;
  v_pos   int := 0;
begin
  if not (is_business_member(v_biz) or current_is_admin()) then
    raise exception 'not a member of this business' using errcode = '42501';
  end if;

  select id into v_cat from categories
  where id = nullif(p_deal->>'category_id','')::uuid
     or slug = p_deal->>'category_slug'
  limit 1;

  if v_id is null then
    insert into deals (
      business_id, category_id, deal_type_code, offering_kind, title,
      short_description, description, original_price, deal_price, price_unit,
      taxes_note, min_purchase, max_qty_per_customer, starts_at, ends_at,
      capacity_total, capacity_remaining, booking_required, fulfilment,
      cancellation_policy, terms, attributes, tags, location, search_radius_m
    ) values (
      v_biz, v_cat,
      coalesce(p_deal->>'deal_type_code', 'discount'),
      coalesce((p_deal->>'offering_kind')::offering_kind, 'other'),
      coalesce(p_deal->>'title', 'Untitled deal'),
      p_deal->>'short_description', p_deal->>'description',
      nullif(p_deal->>'original_price','')::numeric,
      nullif(p_deal->>'deal_price','')::numeric,
      p_deal->>'price_unit', p_deal->>'taxes_note',
      nullif(p_deal->>'min_purchase','')::numeric,
      nullif(p_deal->>'max_qty_per_customer','')::int,
      nullif(p_deal->>'starts_at','')::timestamptz,
      nullif(p_deal->>'ends_at','')::timestamptz,
      nullif(p_deal->>'capacity_total','')::int,
      coalesce(nullif(p_deal->>'capacity_remaining','')::int,
               nullif(p_deal->>'capacity_total','')::int),
      coalesce((p_deal->>'booking_required')::boolean, false),
      coalesce((p_deal->>'fulfilment')::fulfilment_mode, 'walk_in'),
      p_deal->>'cancellation_policy', p_deal->>'terms',
      coalesce(p_deal->'attributes', '{}'::jsonb),
      coalesce(array(select jsonb_array_elements_text(p_deal->'tags')), '{}'),
      case when p_deal ? 'lat' then
        st_setsrid(st_makepoint((p_deal->>'lng')::float, (p_deal->>'lat')::float), 4326)::geography
      else (select location from business_locations
            where business_id = v_biz order by is_primary desc limit 1) end,
      coalesce(nullif(p_deal->>'search_radius_m','')::int, 5000)
    ) returning id into v_id;
  else
    -- Only DRAFT and REJECTED deals are editable by the merchant.
    if not exists (
      select 1 from deals
      where id = v_id and business_id = v_biz and status in ('DRAFT','REJECTED')
    ) and not current_is_admin() then
      raise exception 'only draft or rejected deals can be edited' using errcode = 'P0001';
    end if;

    update deals set
      category_id          = coalesce(v_cat, category_id),
      deal_type_code       = coalesce(p_deal->>'deal_type_code', deal_type_code),
      offering_kind        = coalesce((p_deal->>'offering_kind')::offering_kind, offering_kind),
      title                = coalesce(p_deal->>'title', title),
      short_description    = coalesce(p_deal->>'short_description', short_description),
      description          = coalesce(p_deal->>'description', description),
      original_price       = coalesce(nullif(p_deal->>'original_price','')::numeric, original_price),
      deal_price           = coalesce(nullif(p_deal->>'deal_price','')::numeric, deal_price),
      price_unit           = coalesce(p_deal->>'price_unit', price_unit),
      taxes_note           = coalesce(p_deal->>'taxes_note', taxes_note),
      min_purchase         = coalesce(nullif(p_deal->>'min_purchase','')::numeric, min_purchase),
      max_qty_per_customer = coalesce(nullif(p_deal->>'max_qty_per_customer','')::int, max_qty_per_customer),
      starts_at            = coalesce(nullif(p_deal->>'starts_at','')::timestamptz, starts_at),
      ends_at              = coalesce(nullif(p_deal->>'ends_at','')::timestamptz, ends_at),
      capacity_total       = coalesce(nullif(p_deal->>'capacity_total','')::int, capacity_total),
      capacity_remaining   = coalesce(nullif(p_deal->>'capacity_remaining','')::int, capacity_remaining),
      booking_required     = coalesce((p_deal->>'booking_required')::boolean, booking_required),
      fulfilment           = coalesce((p_deal->>'fulfilment')::fulfilment_mode, fulfilment),
      cancellation_policy  = coalesce(p_deal->>'cancellation_policy', cancellation_policy),
      terms                = coalesce(p_deal->>'terms', terms),
      attributes           = coalesce(p_deal->'attributes', attributes),
      tags                 = case when p_deal ? 'tags'
                                  then coalesce(array(select jsonb_array_elements_text(p_deal->'tags')), '{}')
                                  else tags end,
      location             = case when p_deal ? 'lat' then
                              st_setsrid(st_makepoint((p_deal->>'lng')::float,
                                                      (p_deal->>'lat')::float), 4326)::geography
                              else location end
    where id = v_id;
  end if;

  -- Child rows are replaced wholesale: the wizard always posts the full set.
  if p_deal ? 'media' then
    delete from deal_media where deal_id = v_id;
    v_pos := 0;
    for v_item in select * from jsonb_array_elements(p_deal->'media') loop
      insert into deal_media (deal_id, kind, storage_path, position)
      values (v_id, coalesce(v_item->>'kind','image'), v_item->>'storage_path', v_pos);
      v_pos := v_pos + 1;
    end loop;
  end if;

  if p_deal ? 'availability' then
    delete from deal_availability where deal_id = v_id;
    for v_item in select * from jsonb_array_elements(p_deal->'availability') loop
      insert into deal_availability (deal_id, day_of_week, start_time, end_time)
      values (v_id, nullif(v_item->>'day_of_week','')::smallint,
              (v_item->>'start_time')::time, (v_item->>'end_time')::time);
    end loop;
  end if;

  if p_deal ? 'eligibility' then
    insert into deal_eligibility (
      deal_id, audience, min_age, min_spend, membership_required,
      advance_booking_hours, custom_rule
    ) values (
      v_id,
      coalesce((p_deal->'eligibility'->>'audience')::audience_kind, 'everyone'),
      nullif(p_deal->'eligibility'->>'min_age','')::smallint,
      nullif(p_deal->'eligibility'->>'min_spend','')::numeric,
      coalesce((p_deal->'eligibility'->>'membership_required')::boolean, false),
      nullif(p_deal->'eligibility'->>'advance_booking_hours','')::int,
      p_deal->'eligibility'->>'custom_rule'
    )
    on conflict (deal_id) do update set
      audience              = excluded.audience,
      min_age               = excluded.min_age,
      min_spend             = excluded.min_spend,
      membership_required   = excluded.membership_required,
      advance_booking_hours = excluded.advance_booking_hours,
      custom_rule           = excluded.custom_rule;
  end if;

  if p_deal ? 'actions' then
    delete from deal_actions where deal_id = v_id;
    v_pos := 0;
    for v_item in select * from jsonb_array_elements(p_deal->'actions') loop
      insert into deal_actions (deal_id, action_type, is_primary, label, config, sort_order)
      values (v_id, (v_item->>'action_type')::cta_type,
              coalesce((v_item->>'is_primary')::boolean, false),
              v_item->>'label', coalesce(v_item->'config','{}'::jsonb), v_pos);
      v_pos := v_pos + 1;
    end loop;
  end if;

  return v_id;
end $$;

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
    search_radius_m
  )
  select
    business_id, category_id, deal_type_code, offering_kind,
    left(title || ' (copy)', 90),
    short_description, description, 'DRAFT', original_price, deal_price,
    price_unit, taxes_note, min_purchase, max_qty_per_customer,
    starts_at, ends_at, capacity_total, capacity_total, booking_required,
    fulfilment, cancellation_policy, terms, attributes, tags, location,
    search_radius_m
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

-- ----------------------------------------------------- trust and reports ---

create or replace function report_target(
  p_target_type text, p_target_id uuid, p_reason text, p_details text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'sign in to report' using errcode = '42501';
  end if;
  insert into reports (reporter_id, target_type, target_id, reason, details)
  values (auth.uid(), p_target_type, p_target_id, p_reason, p_details)
  returning id into v_id;
  perform emit_event('report.created', p_target_type, p_target_id,
    jsonb_build_object('report_id', v_id, 'reason', p_reason));
  return v_id;
end $$;

create or replace function review_business(
  p_business_id uuid, p_approve boolean, p_reason text default null
) returns verification_state
language plpgsql security definer set search_path = public as $$
declare v_state verification_state;
begin
  if not current_is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  v_state := case when p_approve then 'verified' else 'rejected' end::verification_state;

  update businesses set verification_status = v_state where id = p_business_id;
  update business_verifications
     set status = case when p_approve then 'approved' else 'rejected' end,
         rejection_reason = case when p_approve then null else p_reason end,
         reviewed_by = auth.uid(), reviewed_at = now()
   where business_id = p_business_id and status = 'submitted';

  perform emit_event('merchant.verification_changed', 'business', p_business_id,
    jsonb_build_object('status', v_state, 'reason', p_reason));
  return v_state;
end $$;

-- ----------------------------------------------------------- analytics -----

create or replace function record_deal_events(p_events jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_item  jsonb;
  v_count int := 0;
begin
  for v_item in select * from jsonb_array_elements(p_events) loop
    insert into deal_events (deal_id, profile_id, event_type, source)
    values ((v_item->>'deal_id')::uuid, auth.uid(),
            v_item->>'event_type', v_item->>'source');

    if v_item->>'event_type' = 'view' then
      update deals set view_count = view_count + 1
       where id = (v_item->>'deal_id')::uuid;
    elsif v_item->>'event_type' = 'search_appearance' then
      update deals set search_count = search_count + 1
       where id = (v_item->>'deal_id')::uuid;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

/** Rolls raw events into the daily table the merchant analytics screen reads. */
create or replace function rollup_deal_analytics(p_day date default current_date)
returns int
language plpgsql security definer set search_path = public as $$
declare v_rows int;
begin
  insert into deal_analytics_daily as t (
    deal_id, day, impressions, views, search_appearances, cta_clicks
  )
  select
    deal_id, p_day,
    count(*) filter (where event_type = 'impression'),
    count(*) filter (where event_type = 'view'),
    count(*) filter (where event_type = 'search_appearance'),
    count(*) filter (where event_type = 'cta_click')
  from deal_events
  where occurred_at >= p_day and occurred_at < p_day + 1
  group by deal_id
  on conflict (deal_id, day) do update set
    impressions        = excluded.impressions,
    views              = excluded.views,
    search_appearances = excluded.search_appearances,
    cta_clicks         = excluded.cta_clicks;

  insert into deal_analytics_daily as t (deal_id, day, claims, bookings, enquiries)
  select
    deal_id, p_day,
    count(*) filter (where action_type = 'claim'),
    count(*) filter (where action_type in ('booking','reserve')),
    count(*) filter (where action_type = 'enquiry')
  from customer_actions
  where created_at >= p_day and created_at < p_day + 1
  group by deal_id
  on conflict (deal_id, day) do update set
    claims    = excluded.claims,
    bookings  = excluded.bookings,
    enquiries = excluded.enquiries;

  get diagnostics v_rows = row_count;
  return v_rows;
end $$;

create or replace function merchant_stats(p_business_id uuid, p_days int default 7)
returns table (
  views int, searches int, claims int, bookings int, enquiries int,
  active_count int, draft_count int, pending_count int, expired_count int
)
language sql stable security definer set search_path = public as $$
  with d as (select id, status from deals where business_id = p_business_id),
  ev as (
    select
      coalesce(sum(a.views), 0)::int              as views,
      coalesce(sum(a.search_appearances), 0)::int as searches,
      coalesce(sum(a.claims), 0)::int             as claims,
      coalesce(sum(a.bookings), 0)::int           as bookings,
      coalesce(sum(a.enquiries), 0)::int          as enquiries
    from deal_analytics_daily a
    join d on d.id = a.deal_id
    where a.day >= current_date - p_days
  )
  select
    ev.views, ev.searches, ev.claims, ev.bookings, ev.enquiries,
    (select count(*) from d where status = 'ACTIVE')::int,
    (select count(*) from d where status = 'DRAFT')::int,
    (select count(*) from d where status in ('SUBMITTED','VERIFICATION','APPROVED','PUBLISHED'))::int,
    (select count(*) from d where status in ('EXPIRED','COMPLETED','ARCHIVED'))::int
  from ev;
$$;

-- ------------------------------------------------------- scheduled jobs ----
-- PUBLISHED -> ACTIVE when the start time arrives, ACTIVE -> EXPIRED when it
-- ends. Run by pg_cron; see 0005_cron.sql.

create or replace function activate_due_deals() returns int
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_n int := 0;
begin
  for v_id in
    select id from deals
    where status = 'PUBLISHED'
      and (starts_at is null or starts_at <= now())
      and (ends_at is null or ends_at > now())
  loop
    perform transition_deal_internal(v_id, 'ACTIVE', 'system');
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function expire_due_deals() returns int
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_n int := 0;
begin
  for v_id in
    select id from deals
    where status in ('ACTIVE','PUBLISHED','PAUSED') and ends_at is not null and ends_at <= now()
  loop
    perform transition_deal_internal(v_id, 'EXPIRED', 'system', 'window closed');
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

/** Keeps deal_events partitioned three months ahead of today. */
create or replace function ensure_event_partitions() returns void
language plpgsql as $$
declare m date := date_trunc('month', now())::date; i int;
begin
  for i in 0..3 loop
    execute format(
      'create table if not exists deal_events_%s partition of deal_events
         for values from (%L) to (%L)',
      to_char(m + (i || ' month')::interval, 'YYYY_MM'),
      (m + (i     || ' month')::interval)::date,
      (m + (i + 1 || ' month')::interval)::date
    );
  end loop;
end $$;

-- ------------------------------------------------- outbox dispatch read ----
-- The worker claims a batch with SKIP LOCKED so two workers never take the
-- same event, then marks them dispatched once the side effects are done.

create or replace function claim_outbox_batch(p_limit int default 50)
returns setof outbox_events
language plpgsql security definer set search_path = public as $$
begin
  return query
  with batch as (
    select id from outbox_events
    where dispatched_at is null
    order by occurred_at
    for update skip locked
    limit p_limit
  )
  update outbox_events o
     set dispatched_at = now()
   where o.id in (select id from batch)
  returning o.*;
end $$;
