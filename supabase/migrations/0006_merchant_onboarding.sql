-- ============================================================================
-- Merchant onboarding.
--
-- One sign-in for everyone: an account is a merchant because it belongs to a
-- business, never because of something picked at login. This migration adds
-- the way in — create_business() makes the business, its first owner and its
-- main location in one step — and the way to the YOLO Verified badge.
--
-- It also closes two holes left by 0003. businesses had a table-wide INSERT
-- and UPDATE grant, so any signed-in user could insert a business already
-- marked 'verified' with any rating, and any member could later set
-- verification_status or rating_avg on their own business. As with deals,
-- table writes are revoked and only the editable columns are granted back:
-- not the registered name or number, which only an approved verification sets.
-- ============================================================================

-- ------------------------------------------------------------- lockdown ---

drop policy if exists businesses_insert on businesses;
revoke insert, update, delete on businesses from anon, authenticated;
-- The registered name and number are not here: they come from an approved
-- verification (review_business), so a verified business cannot quietly swap them.
grant  update (name, phone, email, primary_category_id)
  on businesses to authenticated;

-- Verification requests go through submit_business_verification(), which
-- also moves the business to 'pending'. A direct insert could have created a
-- row already marked 'approved'.
drop policy if exists business_verifications_insert on business_verifications;
revoke insert, update, delete on business_verifications from anon, authenticated;

-- --------------------------------------------------------- create_business --

/**
 * Creates a business owned by the caller. Input keys: name, phone, email,
 * primary_category_id, locality_id, address_line, and optionally lat / lng for
 * a precise pin (else the locality centre). Returns the new business id.
 */
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

  if p ? 'lat' and p ? 'lng' then
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

  perform emit_event('merchant.business_created', 'business', v_id,
    jsonb_build_object('name', v_name), v_uid);
  return v_id;
end $$;

-- ---------------------------------------------------------- verification --
--
-- The YOLO Verified badge says a real, registered business is behind the
-- deals. So a request carries what an Indian business can show for that:
--
--   * the registered (legal) name and the type of business
--   * a GSTIN, checked for shape, state code and its check digit
--   * or, for a business under the GST threshold, a PAN plus a registration
--     (Udyam, Shop and Establishment, or a trade licence)
--   * an FSSAI number for food businesses, which the law requires of all of them
--   * the registered address, and who is applying and in what role
--
-- The checks here catch typos and obvious mismatches. An admin still checks
-- the GSTIN against the public GST record before approving; approval copies
-- the registered name and number onto the business, where the owner can no
-- longer edit them.

alter table business_verifications
  add column legal_name         text,
  add column constitution       text check (constitution in
                                 ('proprietorship','partnership','llp','private_limited','public_limited','other')),
  add column gstin              text,
  add column pan                text,
  add column licence_type       text check (licence_type in ('udyam','shop_establishment','trade_licence')),
  add column licence_number     text,
  add column fssai              text,
  add column registered_address text,
  add column owner_role         text check (owner_role in ('owner','partner','director','manager')),
  add column declared_at        timestamptz;

create index business_verifications_gstin on business_verifications (gstin) where gstin is not null;

/**
 * A well-formed GSTIN: state code, the PAN inside it, entity number, 'Z', and
 * a check digit that matches. Mirrors gstinProblem() in src/lib/india-ids.ts.
 */
create or replace function gstin_is_valid(p text) returns boolean
language plpgsql immutable as $$
declare
  chars constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  v_sum int := 0;
  v     int;
begin
  if p is null or p !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' then
    return false;
  end if;
  if not (substr(p, 1, 2)::int between 1 and 38 or substr(p, 1, 2) in ('97', '99')) then
    return false;
  end if;
  for i in 1..14 loop
    v := (strpos(chars, substr(p, i, 1)) - 1) * (case when i % 2 = 1 then 1 else 2 end);
    v_sum := v_sum + v / 36 + v % 36;
  end loop;
  return substr(chars, (36 - v_sum % 36) % 36 + 1, 1) = substr(p, 15, 1);
end $$;

/**
 * The PAN's fourth letter says who holds it: P a person (a proprietorship's
 * PAN is the proprietor's), F a firm or LLP, C a company. Anything else is
 * a trust, society, HUF and the like, which belongs under 'other'.
 */
create or replace function pan_matches_constitution(p_pan text, p_constitution text) returns boolean
language sql immutable as $$
  select case substr(p_pan, 4, 1)
    when 'P' then p_constitution = 'proprietorship'
    when 'F' then p_constitution in ('partnership', 'llp')
    when 'C' then p_constitution in ('private_limited', 'public_limited')
    else p_constitution = 'other'
  end;
$$;

/**
 * Asks for the YOLO Verified badge. Owners only, and only from 'unverified'
 * or 'rejected': a pending request is not filed twice, and a verified
 * business has nothing to ask for. Input keys: legal_name, constitution,
 * gstin | (pan, licence_type, licence_number), fssai, registered_address,
 * owner_name, owner_role, declared (true).
 */
create or replace function submit_business_verification(p_business_id uuid, p jsonb)
returns verification_state
language plpgsql security definer set search_path = public as $$
declare
  v_state        verification_state;
  v_legal        text := btrim(coalesce(p->>'legal_name', ''));
  v_constitution text := nullif(p->>'constitution', '');
  v_gstin        text := nullif(upper(regexp_replace(coalesce(p->>'gstin', ''), '\s', '', 'g')), '');
  v_pan          text := nullif(upper(regexp_replace(coalesce(p->>'pan', ''), '\s', '', 'g')), '');
  v_licence_type text := nullif(p->>'licence_type', '');
  v_licence      text := nullif(upper(btrim(coalesce(p->>'licence_number', ''))), '');
  v_fssai        text := nullif(regexp_replace(coalesce(p->>'fssai', ''), '\s', '', 'g'), '');
  v_address      text := btrim(coalesce(p->>'registered_address', ''));
  v_owner        text := btrim(coalesce(p->>'owner_name', ''));
  v_role         text := nullif(p->>'owner_role', '');
  v_food         boolean;
begin
  if not exists (select 1 from business_members
                  where business_id = p_business_id and profile_id = auth.uid()
                    and member_role = 'owner') then
    raise exception 'Only the owner can ask for verification' using errcode = '42501';
  end if;

  if length(v_legal) < 2 then
    raise exception 'Enter the registered business name' using errcode = 'P0001';
  end if;
  if v_constitution is null or v_constitution not in
     ('proprietorship','partnership','llp','private_limited','public_limited','other') then
    raise exception 'Choose the type of business' using errcode = 'P0001';
  end if;

  if v_gstin is not null then
    if not gstin_is_valid(v_gstin) then
      raise exception 'That GSTIN is not valid. Copy it from your GST certificate' using errcode = 'P0001';
    end if;
    -- The PAN is characters 3 to 12 of the GSTIN; a separate registration is not needed.
    v_pan := substr(v_gstin, 3, 10);
    v_licence_type := null;
    v_licence := null;
  else
    if v_pan is null or v_pan !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' then
      raise exception 'Enter your GSTIN, or your PAN if you are not registered under GST'
        using errcode = 'P0001';
    end if;
    if v_licence_type is null or v_licence_type not in ('udyam','shop_establishment','trade_licence') then
      raise exception 'Without GST, add a Udyam, Shop and Establishment or trade licence number'
        using errcode = 'P0001';
    end if;
    if v_licence is null or length(v_licence) < 5 then
      raise exception 'Enter the registration number' using errcode = 'P0001';
    end if;
    if v_licence_type = 'udyam' and v_licence !~ '^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$' then
      raise exception 'Udyam numbers look like UDYAM-KR-03-0012345' using errcode = 'P0001';
    end if;
  end if;

  if not pan_matches_constitution(v_pan, v_constitution) then
    raise exception '%', case substr(v_pan, 4, 1)
      when 'P' then 'This PAN belongs to a person, which means a proprietorship. Check the business type or the number'
      when 'F' then 'This PAN belongs to a firm, which means a partnership or LLP. Check the business type or the number'
      when 'C' then 'This PAN belongs to a company. Check the business type or the number'
      else 'This PAN is not a person, firm or company. Choose Other, or check the number'
    end using errcode = 'P0001';
  end if;

  select c.vertical = 'food' into v_food
    from businesses b join categories c on c.id = b.primary_category_id
   where b.id = p_business_id;
  if v_fssai is not null and v_fssai !~ '^[0-9]{14}$' then
    raise exception 'FSSAI numbers have 14 digits' using errcode = 'P0001';
  end if;
  if coalesce(v_food, false) and v_fssai is null then
    raise exception 'Food businesses need their 14-digit FSSAI licence or registration number'
      using errcode = 'P0001';
  end if;

  if length(v_address) < 10 then
    raise exception 'Enter the registered address' using errcode = 'P0001';
  end if;
  if length(v_owner) < 2 then
    raise exception 'Enter your full name as on your PAN or ID' using errcode = 'P0001';
  end if;
  if v_role is null or v_role not in ('owner','partner','director','manager') then
    raise exception 'Choose your role in the business' using errcode = 'P0001';
  end if;
  if coalesce(p->'declared', 'false'::jsonb) <> 'true'::jsonb then
    raise exception 'Confirm that these details are correct' using errcode = 'P0001';
  end if;

  select verification_status into v_state from businesses where id = p_business_id for update;
  if v_state = 'pending' then
    raise exception 'Verification is already being reviewed' using errcode = 'P0001';
  elsif v_state = 'verified' then
    raise exception 'This business is already verified' using errcode = 'P0001';
  end if;

  insert into business_verifications (
    business_id, owner_name, owner_role, legal_name, constitution, gstin, pan,
    licence_type, licence_number, fssai, registered_address, declared_at)
  values (
    p_business_id, v_owner, v_role, v_legal, v_constitution, v_gstin, v_pan,
    v_licence_type, v_licence, v_fssai, v_address, now());
  update businesses set verification_status = 'pending' where id = p_business_id;

  perform emit_event('merchant.verification_submitted', 'business', p_business_id,
    '{}'::jsonb, auth.uid());
  return 'pending';
end $$;

/**
 * Businesses waiting for an admin, oldest first, with everything to check.
 * same_id_elsewhere counts other businesses that used the same GSTIN or PAN
 * in a request that was not turned down: one legal entity can own several
 * outlets, but an unexpected match is worth a second look.
 */
create or replace function business_verification_queue()
returns table (
  business_id uuid, name text, category_name text, locality_name text, address_line text,
  phone text, email text, legal_name text, constitution text, gstin text, pan text,
  licence_type text, licence_number text, fssai text, registered_address text,
  owner_name text, owner_role text, same_id_elsewhere int, submitted_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not current_is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return query
    select b.id, b.name, c.name, l.name, bl.address_line,
           b.phone, b.email, v.legal_name, v.constitution, v.gstin, v.pan,
           v.licence_type, v.licence_number, v.fssai, v.registered_address,
           v.owner_name, v.owner_role,
           (select count(distinct o.business_id)::int from business_verifications o
             where o.business_id <> v.business_id and o.status <> 'rejected'
               and (o.gstin = v.gstin or o.pan = v.pan)),
           v.created_at
    from business_verifications v
    join businesses b on b.id = v.business_id
    left join categories c on c.id = b.primary_category_id
    left join lateral (
      select * from business_locations x
      where x.business_id = b.id order by x.is_primary desc, x.id limit 1
    ) bl on true
    left join localities l on l.id = bl.locality_id
    where v.status = 'submitted'
    order by v.created_at;
end $$;

/**
 * Admin decision on the latest request. Replaces the 0002 version: a decline
 * needs a reason the owner can act on, approval copies the registered name
 * and number onto the business, and the owners are told either way.
 */
create or replace function review_business(
  p_business_id uuid, p_approve boolean, p_reason text default null
) returns verification_state
language plpgsql security definer set search_path = public as $$
declare
  v_req   business_verifications%rowtype;
  v_state verification_state;
  v_name  text;
begin
  if not current_is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if not p_approve and length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Give the owner a reason they can act on' using errcode = 'P0001';
  end if;

  select * into v_req from business_verifications
   where business_id = p_business_id and status = 'submitted'
   order by created_at desc limit 1
   for update;
  if not found then
    raise exception 'Nothing is waiting for review for this business' using errcode = 'P0001';
  end if;

  v_state := case when p_approve then 'verified' else 'rejected' end::verification_state;
  update businesses
     set verification_status = v_state,
         legal_name = case when p_approve then v_req.legal_name else legal_name end,
         registration_number = case when p_approve then coalesce(v_req.gstin, v_req.licence_number)
                                    else registration_number end
   where id = p_business_id
  returning name into v_name;

  update business_verifications
     set status = case when p_approve then 'approved' else 'rejected' end,
         rejection_reason = case when p_approve then null else btrim(p_reason) end,
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = v_req.id;

  perform notify_profile(
    m.profile_id,
    case when p_approve then 'business_verified' else 'business_rejected' end,
    case when p_approve then 'You are YOLO Verified' else 'Verification needs changes' end,
    case when p_approve then v_name || ' now shows the YOLO Verified badge.' else btrim(p_reason) end,
    jsonb_build_object('business_id', p_business_id))
  from business_members m
  where m.business_id = p_business_id and m.member_role = 'owner';

  perform emit_event('merchant.verification_changed', 'business', p_business_id,
    jsonb_build_object('status', v_state, 'reason', p_reason));
  return v_state;
end $$;

-- ---------------------------------------------------------------- grants --

revoke execute on function create_business(jsonb)                     from public, anon;
revoke execute on function submit_business_verification(uuid, jsonb) from public, anon;
revoke execute on function business_verification_queue()              from public, anon;
grant  execute on function create_business(jsonb)                     to authenticated;
grant  execute on function submit_business_verification(uuid, jsonb) to authenticated;
grant  execute on function business_verification_queue()              to authenticated;
