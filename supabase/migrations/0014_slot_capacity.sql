-- ============================================================================
-- YOLO Deals — a cap per time slot
--
-- A table or a chair can be booked only so many times at once: a deal may
-- say "6 tables at 8 PM" on top of its overall capacity. The cap lives in
-- the deal's attributes as slot_capacity, so it needs no column.
--
-- The check runs when a booking row is saved. take_deal_action() locks the
-- deal row before inserting, so two people cannot both take the last table:
-- the second waits for the first to commit, then counts it.
--
-- deal_slot_load() tells anyone which upcoming slots are taken and how
-- many times, so the booking sheet can mark full ones. It returns counts
-- only, never who booked.
-- ============================================================================

-- The cap as a whole number, or null when the deal has none (or a bad value).
create or replace function deal_slot_capacity(p_attributes jsonb) returns int
language sql immutable as $$
  select case
    when (p_attributes->>'slot_capacity') ~ '^[0-9]+$'
     and (p_attributes->>'slot_capacity')::int > 0
    then (p_attributes->>'slot_capacity')::int
  end
$$;

create or replace function enforce_slot_capacity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_cap  int;
  v_held int;
begin
  if new.slot_start is null then
    return new;
  end if;

  select deal_slot_capacity(attributes) into v_cap from deals where id = new.deal_id;
  if v_cap is null then
    return new;
  end if;

  select count(*) into v_held
  from customer_actions
  where deal_id = new.deal_id
    and slot_start = new.slot_start
    and status in ('pending', 'confirmed', 'redeemed');

  if v_held >= v_cap then
    raise exception 'that time is full. Pick another time.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists customer_actions_slot_capacity on customer_actions;
create trigger customer_actions_slot_capacity
  before insert on customer_actions
  for each row execute function enforce_slot_capacity();

create or replace function deal_slot_load(p_deal_id uuid)
returns table (slot_start timestamptz, taken int)
language sql stable security definer set search_path = public as $$
  select ca.slot_start, count(*)::int
  from customer_actions ca
  join deals d on d.id = ca.deal_id
  where ca.deal_id = p_deal_id
    and ca.slot_start is not null
    and ca.slot_start >= now()
    and ca.status in ('pending', 'confirmed', 'redeemed')
    -- Only deals customers can see; drafts and archived ones say nothing.
    and d.status in ('PUBLISHED', 'ACTIVE', 'PAUSED')
  group by ca.slot_start
$$;

grant execute on function deal_slot_load(uuid) to anon, authenticated;
