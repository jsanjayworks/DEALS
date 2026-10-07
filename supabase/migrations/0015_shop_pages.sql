-- ============================================================================
-- YOLO Deals — shop pages
--
-- A public page per business, like District's: what it is, cost for two,
-- amenities, cuisines, hours, photos, the menu, its live deals and reviews.
--
-- The new columns hold what an owner says or types about the business; all
-- are optional. shop_deals() lists a business's live deals for anyone,
-- where business_deals() stays for its own team (it shows drafts too).
-- ============================================================================

alter table businesses add column if not exists description  text;
alter table businesses add column if not exists keywords     text[] not null default '{}';
alter table businesses add column if not exists owner_role   text;
alter table businesses add column if not exists cost_for_two int check (cost_for_two is null or cost_for_two between 0 and 100000);
alter table businesses add column if not exists amenities    text[] not null default '{}';
alter table businesses add column if not exists cuisines     text[] not null default '{}';
alter table businesses add column if not exists open_time    time;
alter table businesses add column if not exists close_time   time;
alter table businesses add column if not exists photos       text[] not null default '{}';
-- [{name, price, description, veg, photo}]
alter table businesses add column if not exists menu         jsonb  not null default '[]'::jsonb;

create or replace function shop_deals(p_business_id uuid) returns setof deal_card
language sql stable security definer set search_path = public as $$
  select * from deal_cards(array(
    select id from deals
    where business_id = p_business_id
      and status = 'ACTIVE'
      and (ends_at is null or ends_at > now())
  ))
$$;

grant execute on function shop_deals(uuid) to anon, authenticated;
