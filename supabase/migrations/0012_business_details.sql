-- ============================================================================
-- YOLO Deals — editing a business's details
--
-- An owner can change the business name, phone, email, street address and
-- area after signing up, with the same checks as create_business(). Moving
-- to another area moves the pin to that area's centre, and the business's
-- deals move with it, so search distances stay true. The verification
-- status and the registered legal name are untouched: those only change
-- through a new verification request.
-- ============================================================================

create or replace function update_business(p_business_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_name     text := btrim(coalesce(p->>'name', ''));
  v_phone    text := nullif(btrim(coalesce(p->>'phone', '')), '');
  v_email    text := nullif(btrim(coalesce(p->>'email', '')), '');
  v_address  text := btrim(coalesce(p->>'address_line', ''));
  v_locality localities%rowtype;
  v_loc      business_locations%rowtype;
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

  update businesses set name = v_name, phone = v_phone, email = v_email
   where id = p_business_id;

  select * into v_loc from business_locations
   where business_id = p_business_id order by is_primary desc, id limit 1;

  if not found then
    insert into business_locations (business_id, label, address_line, locality_id, city, location, is_primary)
    values (p_business_id, 'Main', v_address, v_locality.id, v_locality.city, v_locality.centroid, true);
  elsif v_loc.locality_id is distinct from v_locality.id then
    update business_locations
       set address_line = v_address, locality_id = v_locality.id, city = v_locality.city,
           location = v_locality.centroid
     where id = v_loc.id;
    -- The deals sit where the business is.
    update deals set location = v_locality.centroid
     where business_id = p_business_id and status not in ('EXPIRED', 'ARCHIVED', 'COMPLETED');
    update deal_locations set location = v_locality.centroid
     where business_location_id = v_loc.id;
  else
    update business_locations set address_line = v_address where id = v_loc.id;
  end if;

  perform emit_event('merchant.business_updated', 'business', p_business_id,
    jsonb_build_object('name', v_name, 'locality', v_locality.name), auth.uid());
end $$;

revoke execute on function update_business(uuid, jsonb) from public, anon;
grant  execute on function update_business(uuid, jsonb) to authenticated;
