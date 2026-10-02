-- ============================================================================
-- YOLO Deals — 0001_init: extensions, enums, tables, indexes
-- PostgreSQL 16 + PostGIS (Supabase, ap-south-1)
--
-- Run order: 0001_init -> 0002_rls -> 0003_functions -> 0004_seed
-- ============================================================================

create extension if not exists postgis;
create extension if not exists pg_trgm;
create extension if not exists pgcrypto;
-- create extension if not exists vector;  -- Phase 2: semantic search

-- ---------------------------------------------------------------- enums ----
create type verification_state as enum ('unverified','pending','verified','rejected');

create type deal_status as enum (
  'DRAFT','SUBMITTED','VERIFICATION','APPROVED','REJECTED','PUBLISHED',
  'ACTIVE','PAUSED','EXPIRED','COMPLETED','ARCHIVED'
);

create type offering_kind as enum (
  'product','service','meal','experience','event','property','transport','other'
);

create type fulfilment_mode as enum ('walk_in','online','both');
create type location_mode   as enum ('store','service_area','online');

create type audience_kind as enum (
  'everyone','verified','members','new_customers','existing_customers'
);

create type cta_type as enum (
  'buy','book','claim','reserve','enquire','call','chat','directions','register','visit'
);

create type customer_action_type as enum (
  'claim','booking','reserve','enquiry','registration','purchase_intent'
);

create type customer_action_status as enum (
  'pending','confirmed','redeemed','cancelled','expired'
);

create type actor_kind as enum ('merchant','admin','system');

-- ------------------------------------------------------------- identity ----
create table profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  is_admin          boolean     not null default false,  -- merchant access comes from business_members
  full_name         text,
  phone             text unique,
  email             text,
  date_of_birth     date,                                -- gates age-restricted deals
  is_yolo_verified  boolean     not null default false,
  default_radius_m  int         not null default 3000
                    check (default_radius_m in (500,1000,3000,5000,10000)),
  onboarded_at      timestamptz,
  created_at        timestamptz not null default now(),
  deleted_at        timestamptz                          -- in-app account deletion (Apple 5.1.1(v))
);

create table localities (
  id        uuid primary key default gen_random_uuid(),
  name      text   not null,
  city      text   not null,
  centroid  geography(Point,4326) not null,
  aliases   text[] not null default '{}',                -- "HSR" -> "HSR Layout"
  unique (name, city)
);
create index localities_aliases_gin on localities using gin (aliases);
create index localities_geo         on localities using gist (centroid);

create table push_tokens (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  expo_token  text not null unique,
  platform    text not null check (platform in ('ios','android')),
  created_at  timestamptz not null default now()
);

create table saved_locations (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  label       text not null,
  location    geography(Point,4326) not null,
  is_default  boolean not null default false
);
create index saved_locations_profile on saved_locations (profile_id);

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  kind        text not null,   -- deal_approved | deal_rejected | action_confirmed | new_claim | ending_soon
  title       text not null,
  body        text,
  data        jsonb not null default '{}',   -- deep-link target
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_inbox on notifications (profile_id, created_at desc);

-- ------------------------------------------------- businesses and trust ----
create table businesses (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  legal_name           text,
  phone                text,
  email                text,
  registration_number  text,                             -- GSTIN etc.
  primary_category_id  uuid,                             -- FK added after categories
  verification_status  verification_state not null default 'unverified',
  rating_avg           numeric(3,2) not null default 0,
  rating_count         int          not null default 0,
  created_at           timestamptz  not null default now()
);

create table business_members (
  business_id  uuid references businesses(id) on delete cascade,
  profile_id   uuid references profiles(id)   on delete cascade,
  member_role  text not null default 'owner'
               check (member_role in ('owner','manager','staff')),
  primary key (business_id, profile_id)
);
create index business_members_profile on business_members (profile_id);

create table business_locations (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  label             text,
  address_line      text not null,
  locality_id       uuid references localities(id),
  city              text not null,
  location          geography(Point,4326) not null,
  service_radius_m  int check (service_radius_m between 0 and 100000),
  is_primary        boolean not null default false
);
create index business_locations_geo on business_locations using gist (location);
create index business_locations_biz on business_locations (business_id);

create table business_verifications (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  status            text not null default 'submitted'
                    check (status in ('submitted','approved','rejected')),
  owner_name        text not null,
  documents         jsonb not null default '[]',         -- private storage paths
  rejection_reason  text,
  reviewed_by       uuid references profiles(id),
  reviewed_at       timestamptz,
  created_at        timestamptz not null default now(),
  check (status <> 'rejected' or rejection_reason is not null)
);
create index business_verifications_queue
  on business_verifications (created_at) where status = 'submitted';

-- ------------------------------------------------------------- taxonomy ----
create table categories (
  id                uuid primary key default gen_random_uuid(),
  parent_id         uuid references categories(id),
  slug              text not null unique,
  name              text not null,
  vertical          text not null check (vertical in
                    ('retail','food','events','mobility','property','services','business','community')),
  icon              text,                                 -- Ionicons name
  attribute_schema  jsonb not null default '{}',          -- JSON Schema for deals.attributes
  sort_order        int   not null default 0
);
create index categories_parent on categories (parent_id);

create table deal_types (
  code          text primary key,
  name          text not null,
  rules_schema  jsonb not null default '{}'
);

alter table businesses
  add constraint businesses_primary_category_fk
  foreign key (primary_category_id) references categories(id);

create table profile_interests (
  profile_id   uuid references profiles(id)   on delete cascade,
  category_id  uuid references categories(id) on delete cascade,
  primary key (profile_id, category_id)
);

create table tags (
  id    uuid primary key default gen_random_uuid(),
  slug  text not null unique
);

-- --------------------------------- deal engine: Universal Deal Object -----
create table deals (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid not null references businesses(id) on delete cascade,
  category_id           uuid not null references categories(id),
  deal_type_code        text not null references deal_types(code),
  offering_kind         offering_kind not null,

  title                 text not null check (char_length(title) between 4 and 90),
  short_description     text check (char_length(short_description) <= 160),
  description           text,
  status                deal_status not null default 'DRAFT',

  original_price        numeric(12,2) check (original_price >= 0),
  deal_price            numeric(12,2) check (deal_price >= 0),
  discount_pct          numeric(5,2) generated always as (
                          case when original_price > 0 and deal_price is not null
                               then round((1 - deal_price / original_price) * 100, 2) end
                        ) stored,
  currency              char(3) not null default 'INR',
  -- Rents and subscriptions read as "₹38,000/mo" rather than a one-off price.
  price_unit            text,
  taxes_note            text,
  min_purchase          numeric(12,2),
  max_qty_per_customer  int check (max_qty_per_customer > 0),

  starts_at             timestamptz,
  ends_at               timestamptz,
  capacity_total        int check (capacity_total >= 0),
  capacity_remaining    int check (capacity_remaining >= 0),
  booking_required      boolean not null default false,
  fulfilment            fulfilment_mode not null default 'walk_in',

  cancellation_policy   text,
  terms                 text,
  attributes            jsonb  not null default '{}',   -- validated against categories.attribute_schema
  tags                  text[] not null default '{}',   -- denormalized from deal_tags for search

  location              geography(Point,4326),          -- primary location, denormalized
  search_radius_m       int not null default 5000,

  -- Tags are deliberately NOT folded in here: array_to_string() is only
  -- stored as stable, not immutable, so Postgres rejects it in a generated
  -- column. search_deals() matches the tags array directly instead, which the
  -- deals_tags GIN index serves.
  search_vector         tsvector generated always as (
                          setweight(to_tsvector('simple', coalesce(title,'')), 'A') ||
                          setweight(to_tsvector('simple', coalesce(short_description,'')), 'B') ||
                          setweight(to_tsvector('simple', coalesce(description,'')), 'C')
                        ) stored,

  rejection_reason      text,
  published_at          timestamptz,
  rating_avg            numeric(3,2) not null default 0,
  rating_count          int          not null default 0,

  -- Denormalized counters so the merchant dashboard is one row read, not a scan.
  view_count            int not null default 0,
  search_count          int not null default 0,
  action_count          int not null default 0,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint deals_price_order
    check (deal_price is null or original_price is null or deal_price <= original_price),
  constraint deals_window
    check (ends_at is null or starts_at is null or ends_at > starts_at),
  constraint deals_rejection_has_reason
    check (status <> 'REJECTED' or rejection_reason is not null)
);

create index deals_geo        on deals using gist (location);
create index deals_live       on deals (status, ends_at) where status in ('ACTIVE','PUBLISHED');
create index deals_search     on deals using gin (search_vector);
create index deals_title_trgm on deals using gin (title gin_trgm_ops);
create index deals_attributes on deals using gin (attributes jsonb_path_ops);
create index deals_tags       on deals using gin (tags);
create index deals_business   on deals (business_id, status);
create index deals_category   on deals (category_id) where status = 'ACTIVE';
create index deals_published  on deals (published_at desc) where status = 'ACTIVE';

create table deal_tags (
  deal_id  uuid references deals(id) on delete cascade,
  tag_id   uuid references tags(id)  on delete cascade,
  primary key (deal_id, tag_id)
);

create table deal_media (
  id            uuid primary key default gen_random_uuid(),
  deal_id       uuid not null references deals(id) on delete cascade,
  kind          text not null check (kind in ('image','video')),
  storage_path  text not null,          -- Supabase Storage path, or an absolute URL for seeded demo media
  position      int  not null default 0
);
create index deal_media_deal on deal_media (deal_id, position);

create table deal_locations (
  deal_id               uuid references deals(id) on delete cascade,
  business_location_id  uuid references business_locations(id) on delete cascade,
  mode                  location_mode not null default 'store',
  location              geography(Point,4326),
  service_radius_m      int,
  primary key (deal_id, business_location_id)
);
create index deal_locations_geo on deal_locations using gist (location);

create table deal_availability (
  id           uuid primary key default gen_random_uuid(),
  deal_id      uuid not null references deals(id) on delete cascade,
  day_of_week  smallint check (day_of_week between 0 and 6),  -- null = every day
  start_time   time not null,
  end_time     time not null
);
create index deal_availability_deal on deal_availability (deal_id);

create table deal_eligibility (
  deal_id                uuid primary key references deals(id) on delete cascade,
  audience               audience_kind not null default 'everyone',
  min_age                smallint check (min_age between 0 and 100),
  min_spend              numeric(12,2),
  membership_required    boolean not null default false,
  advance_booking_hours  int,
  custom_rule            text
);

create table deal_actions (
  id           uuid primary key default gen_random_uuid(),
  deal_id      uuid not null references deals(id) on delete cascade,
  action_type  cta_type not null,
  is_primary   boolean  not null default false,
  label        text,
  config       jsonb    not null default '{}',   -- phone number, url, enquiry form fields
  sort_order   int      not null default 0
);
-- Exactly one primary CTA per deal.
create unique index deal_actions_one_primary on deal_actions (deal_id) where is_primary;
create index deal_actions_deal on deal_actions (deal_id, sort_order);

create table deal_status_history (
  id           bigint generated always as identity primary key,
  deal_id      uuid not null references deals(id) on delete cascade,
  from_status  deal_status,
  to_status    deal_status not null,
  actor        actor_kind   not null,
  actor_id     uuid references profiles(id),
  reason       text,
  created_at   timestamptz  not null default now()
);
create index deal_status_history_deal on deal_status_history (deal_id, created_at);

-- Allowed lifecycle transitions. transition_deal() refuses anything absent here.
create table deal_transitions (
  from_status  deal_status not null,
  to_status    deal_status not null,
  actor        actor_kind  not null,
  primary key (from_status, to_status, actor)
);

insert into deal_transitions (from_status, to_status, actor) values
  ('DRAFT','SUBMITTED','merchant'),
  ('SUBMITTED','VERIFICATION','admin'),
  ('SUBMITTED','APPROVED','admin'),      -- admin may approve straight from the queue
  ('SUBMITTED','REJECTED','admin'),
  ('VERIFICATION','APPROVED','admin'),
  ('VERIFICATION','REJECTED','admin'),
  ('REJECTED','DRAFT','merchant'),
  ('APPROVED','PUBLISHED','system'),
  ('APPROVED','PUBLISHED','admin'),
  ('PUBLISHED','ACTIVE','system'),
  ('ACTIVE','PAUSED','merchant'),
  ('ACTIVE','PAUSED','admin'),
  ('PAUSED','ACTIVE','merchant'),
  ('PAUSED','ACTIVE','admin'),
  ('ACTIVE','EXPIRED','system'),
  ('PUBLISHED','EXPIRED','system'),
  ('PAUSED','EXPIRED','system'),
  ('EXPIRED','COMPLETED','system'),
  ('COMPLETED','ARCHIVED','admin'),
  ('COMPLETED','ARCHIVED','system'),
  ('EXPIRED','ARCHIVED','admin'),
  ('DRAFT','ARCHIVED','merchant');

-- ------------------------------------------ actions, reviews, reports -----
create table customer_actions (
  id               uuid primary key default gen_random_uuid(),
  deal_id          uuid not null references deals(id),
  customer_id      uuid not null references profiles(id),
  deal_action_id   uuid references deal_actions(id),
  action_type      customer_action_type   not null,
  status           customer_action_status not null default 'pending',
  quantity         int not null default 1 check (quantity > 0),
  slot_start       timestamptz,
  redemption_code  text unique,
  payload          jsonb not null default '{}',   -- enquiry message, party size
  redeemed_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index customer_actions_customer on customer_actions (customer_id, created_at desc);
create index customer_actions_deal     on customer_actions (deal_id, status);
create index customer_actions_code     on customer_actions (redemption_code);

create table reviews (
  id                  uuid primary key default gen_random_uuid(),
  deal_id             uuid not null references deals(id) on delete cascade,
  customer_id         uuid not null references profiles(id),
  customer_action_id  uuid references customer_actions(id),   -- verified purchase
  rating              smallint not null check (rating between 1 and 5),
  body                text,
  status              text not null default 'visible' check (status in ('visible','hidden')),
  created_at          timestamptz not null default now(),
  unique (deal_id, customer_id)
);
create index reviews_deal on reviews (deal_id, created_at desc);

create table reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references profiles(id),
  target_type  text not null check (target_type in ('deal','business','review')),
  target_id    uuid not null,
  reason       text not null,
  details      text,
  status       text not null default 'open' check (status in ('open','actioned','dismissed')),
  resolved_by  uuid references profiles(id),
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index reports_open on reports (created_at) where status = 'open';

create table saved_deals (
  profile_id  uuid references profiles(id) on delete cascade,
  deal_id     uuid references deals(id)    on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (profile_id, deal_id)
);

-- ------------------------------------------- analytics and search logs ----
create table deal_events (
  id           bigint generated always as identity,
  deal_id      uuid not null,
  profile_id   uuid,
  event_type   text not null check (event_type in ('impression','view','cta_click','share','search_appearance')),
  source       text,                -- home | search | deeplink
  occurred_at  timestamptz not null default now(),
  primary key (id, occurred_at)
) partition by range (occurred_at);

create index deal_events_deal on deal_events (deal_id, occurred_at);

-- Create the current month plus the next three, so ingestion never hits a
-- missing partition. 0003_functions adds a pg_cron job that rolls this forward.
do $$
declare
  m date := date_trunc('month', now())::date;
  i int;
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

create table deal_analytics_daily (
  deal_id             uuid references deals(id) on delete cascade,
  day                 date,
  impressions         int not null default 0,
  views               int not null default 0,
  search_appearances  int not null default 0,
  cta_clicks          int not null default 0,
  claims              int not null default 0,
  bookings            int not null default 0,
  enquiries           int not null default 0,
  primary key (deal_id, day)
);

create table search_queries (
  id              bigint generated always as identity primary key,
  profile_id      uuid references profiles(id) on delete set null,
  raw_query       text not null,
  parsed_filters  jsonb not null default '{}',
  parser          text  not null check (parser in ('llm','rules','cache')),
  result_count    int,
  origin          geography(Point,4326),
  created_at      timestamptz not null default now()
);
create index search_queries_recent on search_queries (created_at desc);

-- ------------------------------------- event backbone (Kafka-ready) -------
-- Every state change writes its event in the SAME transaction as the data, so
-- an event is never lost and never emitted for a change that rolled back.
-- aggregate_id becomes the Kafka partition key in Phase 2, preserving per-deal
-- ordering when a dispatcher or Debezium starts reading this table.
create table outbox_events (
  id              uuid primary key default gen_random_uuid(),
  type            text not null,              -- e.g. deal.approved
  version         int  not null default 1,
  aggregate_type  text not null,              -- deal | business | action | search
  aggregate_id    uuid not null,
  actor_id        uuid,
  payload         jsonb not null,
  occurred_at     timestamptz not null default now(),
  dispatched_at   timestamptz
);
create index outbox_pending on outbox_events (occurred_at) where dispatched_at is null;

create table processed_events (          -- consumer idempotency
  consumer      text,
  event_id      uuid,
  processed_at   timestamptz not null default now(),
  primary key (consumer, event_id)
);

-- --------------------- ranking weights, tunable without a release ---------
create table ranking_config (
  id          int primary key default 1 check (id = 1),
  w_relevance numeric not null default 0.28,
  w_distance  numeric not null default 0.22,
  w_available numeric not null default 0.14,
  w_value     numeric not null default 0.10,
  w_fresh     numeric not null default 0.08,
  w_rating    numeric not null default 0.08,
  w_verified  numeric not null default 0.05,
  w_urgency   numeric not null default 0.05
);
insert into ranking_config default values;

-- ------------------------------------------------------- updated_at -------
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger deals_touch
  before update on deals
  for each row execute function touch_updated_at();

create trigger customer_actions_touch
  before update on customer_actions
  for each row execute function touch_updated_at();
