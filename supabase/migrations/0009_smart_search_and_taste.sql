-- ============================================================================
-- YOLO Deals — smart search, group deals, vehicles, and "For you"
--
--   1. Group deals. A deal can say how many people it is for, in
--      attributes.party_min / party_max ("Biryani Feast for 5" is for 4–6).
--      A search for a group matches when the two ranges overlap.
--   2. Vehicles. A deal lists the vehicles it is for in attributes.vehicles:
--      a kind ('bike'), a brand ('royal-enfield') or a model
--      ('re-classic-350'); see src/data/vehicles.ts. Searching for a vehicle
--      finds every deal for it, in any category.
--   3. search_deals v2. Matches the cleaned keywords the app sends, each
--      word on its own (a deal matching some words still shows, below one
--      matching them all), by word prefix so "biry" finds biryani and "veg"
--      does not find non-veg. Mirrors textRelevance() in the app, so search
--      behaves the same with and without the database.
--   4. Taste. my_taste() reads what a customer opens, saves and claims, with
--      older signals counting less, and feed_for_you() reranks the deals
--      near them by it. Nothing is stored: it is computed from rows the app
--      already writes, so deleting those rows forgets the taste too.
-- ============================================================================

-- ------------------------------------------------- attribute shapes --------
-- The app reads these three keys on every deal, so they have one shape.
alter table deals drop constraint if exists deals_party_and_vehicles;
alter table deals add constraint deals_party_and_vehicles check (
  (not attributes ? 'party_min' or (jsonb_typeof(attributes->'party_min') = 'number'
     and (attributes->>'party_min')::numeric between 1 and 50))
  and (not attributes ? 'party_max' or (jsonb_typeof(attributes->'party_max') = 'number'
     and (attributes->>'party_max')::numeric between 1 and 50))
  and (not (attributes ? 'party_min' and attributes ? 'party_max')
     or (attributes->>'party_min')::numeric <= (attributes->>'party_max')::numeric)
  and (not attributes ? 'vehicles' or jsonb_typeof(attributes->'vehicles') = 'array')
);

-- ------------------------------------------------------- text helpers ------

/** A search word as matched: lower case, a plural's "s" dropped. Mirrors searchStem(). */
create or replace function search_stem(p text) returns text
language sql immutable set search_path = public as $$
  select case
    when length(t) > 3 and t like '%s' and t not like '%ss' then left(t, -1)
    else t
  end
  from (select lower(regexp_replace(coalesce(p, ''), '[^a-zA-Z0-9-]', '', 'g')) as t) x
$$;

/**
 * Does a word in p_text start with p_stem? A hyphen joins a word, so
 * "non-veg" is one word. Mirrors startsWord(). The stem is already reduced
 * to [a-z0-9-] by search_stem, so it is safe inside the pattern.
 */
create or replace function starts_word(p_text text, p_stem text) returns boolean
language sql immutable set search_path = public as $$
  select p_stem <> '' and lower(coalesce(p_text, '')) ~ ('(^|[^a-z0-9-])' || p_stem)
$$;

/**
 * How closely a deal's vehicle tags fit the vehicle searched for; p_wanted
 * starts with the tag the person named. Mirrors vehicleRelevance().
 */
create or replace function vehicle_relevance(p_fits jsonb, p_wanted text[])
returns double precision
language sql immutable set search_path = public as $$
  select case
    when cardinality(p_wanted) = 0 or cardinality(f.fits) = 0 then 0::double precision
    else (case
            when p_wanted[1] = any (f.fits) then 1.0
            when exists (select 1 from unnest(f.fits) t
                         where t not in ('bike', 'scooter', 'car') and t = any (p_wanted)) then 0.85
            when f.fits && p_wanted then 0.6
            else 0
          end
          * case when cardinality(f.fits) = 1 then 1.0 else 0.85 end)::double precision
  end
  from (select array(
          select jsonb_array_elements_text(
            case when jsonb_typeof(p_fits) = 'array' then p_fits else '[]'::jsonb end)
        ) as fits) f
$$;

-- ---------------------------------------------------- search_deals v2 ------
-- Same signature and row type as before, so the app needs no new call.
-- New filter keys: party_min, party_max (numbers), vehicle_tags (array).

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

-- ----------------------------------------------------------- taste ---------

create index if not exists deal_events_profile
  on deal_events (profile_id, occurred_at desc) where profile_id is not null;

/**
 * What the signed-in customer is into, as weighted categories and tags.
 * Opening a deal counts 1, saving it 3, claiming, booking or buying it 5;
 * every signal halves in weight roughly every three weeks (30-day decay).
 * Empty for a signed-out visitor or a new account.
 */
create or replace function my_taste()
returns table (kind text, key text, label text, weight double precision)
language sql stable security definer set search_path = public as $$
  with signals as (
    select e.deal_id,
           1.0 * exp(-extract(epoch from now() - e.occurred_at) / 86400.0 / 30) as w
    from deal_events e
    where e.profile_id = auth.uid()
      and e.event_type = 'view'
      and e.occurred_at > now() - interval '90 days'
    union all
    select s.deal_id, 3.0 * exp(-extract(epoch from now() - s.created_at) / 86400.0 / 30)
    from saved_deals s
    where s.profile_id = auth.uid()
    union all
    select a.deal_id, 5.0 * exp(-extract(epoch from now() - a.created_at) / 86400.0 / 30)
    from customer_actions a
    where a.customer_id = auth.uid()
      and a.created_at > now() - interval '180 days'
  ), per_deal as (
    select deal_id, sum(w) as w from signals group by deal_id
  )
  select * from (
    select 'category'::text, c.slug, c.name, sum(p.w)::double precision
    from per_deal p
    join deals d      on d.id = p.deal_id
    join categories c on c.id = d.category_id
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
 * Deals near the customer, reranked by their taste: the category they keep
 * coming back to counts 60%, shared tags 40%, then blended with the usual
 * score so a great deal nearby still beats a so-so one they might like.
 * Deals they have already claimed are left out. Empty without a taste.
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
  order by aff.a * 0.65 + coalesce(n.score, 0) * 0.35 desc, n.distance_km
  limit greatest(p_limit, 1);
end $$;

-- ---------------------------------------------------------------- grants --

revoke execute on function my_taste()                                          from public, anon;
revoke execute on function feed_for_you(double precision, double precision, int, int) from public, anon;
grant  execute on function my_taste()                                          to authenticated;
grant  execute on function feed_for_you(double precision, double precision, int, int) to authenticated;
grant  execute on function search_deals(jsonb, double precision, double precision, int, int)
  to anon, authenticated;
