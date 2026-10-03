-- ============================================================================
-- Customer support, account deletion, and profile pictures.
--
-- YOLO Deals takes no payments: a customer shows a code and pays the business.
-- So there is nothing for the app to refund. What customers need is a way to
-- raise a problem — the shop did not honour the code, charged more than the
-- deal price, the deal was not as described — and for YOLO to answer. That is
-- a support ticket, optionally tied to one of their claims.
--
-- Account deletion has to start in the app (Apple 5.1.1(v), and Google Play's
-- account deletion policy). request_account_deletion() marks the profile,
-- cancels open claims and bookings so the capacity goes back to the deal,
-- forgets saved deals, and files a ticket so the auth user is removed by the
-- team (that last step needs the service role, so it is not done from here).
-- ============================================================================

create table support_tickets (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  topic       text not null check (topic in
                ('claim_problem','payment_refund','deal_wrong','account','account_deletion','other')),
  action_id   uuid references customer_actions(id) on delete set null,
  deal_id     uuid references deals(id) on delete set null,
  message     text not null,
  status      text not null default 'open' check (status in ('open','answered','closed')),
  reply       text,
  replied_by  uuid references profiles(id),
  replied_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index support_tickets_profile on support_tickets (profile_id, created_at desc);
create index support_tickets_open    on support_tickets (created_at) where status = 'open';

alter table support_tickets enable row level security;

-- A customer reads their own requests; admins read everything. Writes only
-- through the functions below, so status and replies cannot be forged.
create policy support_tickets_read on support_tickets for select
  using (profile_id = auth.uid() or current_is_admin());
revoke insert, update, delete on support_tickets from anon, authenticated;

-- --------------------------------------------------------------- tickets --

/**
 * Files a request. Input keys: topic, message, and optionally action_id (one
 * of the caller's own claims or bookings) or deal_id.
 */
create or replace function create_support_ticket(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_topic   text := p->>'topic';
  v_message text := btrim(coalesce(p->>'message', ''));
  v_action  customer_actions%rowtype;
  v_deal    uuid;
  v_id      uuid;
begin
  if v_uid is null then
    raise exception 'Sign in to contact support' using errcode = '42501';
  end if;
  if v_topic is null or v_topic not in
     ('claim_problem','payment_refund','deal_wrong','account','account_deletion','other') then
    raise exception 'Choose what your request is about' using errcode = 'P0001';
  end if;
  if length(v_message) < 10 then
    raise exception 'Tell us a little more, at least 10 characters' using errcode = 'P0001';
  end if;
  if length(v_message) > 2000 then
    raise exception 'Keep it under 2,000 characters' using errcode = 'P0001';
  end if;

  if coalesce(p->>'action_id', '') <> '' then
    select * into v_action from customer_actions where id::text = p->>'action_id';
    if not found or v_action.customer_id <> v_uid then
      raise exception 'That claim is not on your account' using errcode = 'P0001';
    end if;
    v_deal := v_action.deal_id;
  elsif coalesce(p->>'deal_id', '') <> '' then
    select id into v_deal from deals where id::text = p->>'deal_id';
    if v_deal is null then
      raise exception 'That deal no longer exists' using errcode = 'P0001';
    end if;
  end if;

  if (select count(*) from support_tickets where profile_id = v_uid and status = 'open') >= 5 then
    raise exception 'You have 5 open requests. We will answer those first' using errcode = 'P0001';
  end if;

  insert into support_tickets (profile_id, topic, action_id, deal_id, message)
  values (v_uid, v_topic, v_action.id, v_deal, v_message)
  returning id into v_id;

  perform emit_event('support.ticket_created', 'support_ticket', v_id,
    jsonb_build_object('topic', v_topic), v_uid);
  return v_id;
end $$;

/** Open requests first, oldest first, then the answered ones. Admins only. */
create or replace function support_queue()
returns table (
  id uuid, topic text, message text, status text, created_at timestamptz,
  customer_name text, customer_contact text, redemption_code text,
  action_status text, deal_title text, reply text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not current_is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return query
    select t.id, t.topic, t.message, t.status, t.created_at,
           coalesce(p.full_name, ''), coalesce(p.phone, p.email, ''),
           a.redemption_code, a.status::text, d.title, t.reply
    from support_tickets t
    join profiles p on p.id = t.profile_id
    left join customer_actions a on a.id = t.action_id
    left join deals d on d.id = t.deal_id
    where t.status <> 'closed'
    order by (t.status = 'open') desc, t.created_at;
end $$;

/** An admin answers; the customer gets a notification with the reply. */
create or replace function reply_support_ticket(
  p_ticket_id uuid, p_reply text, p_close boolean default false
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_ticket support_tickets%rowtype;
  v_status text := case when p_close then 'closed' else 'answered' end;
begin
  if not current_is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reply, ''))) < 2 then
    raise exception 'Write a reply first' using errcode = 'P0001';
  end if;
  select * into v_ticket from support_tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'That request no longer exists' using errcode = 'P0001';
  end if;

  update support_tickets
     set reply = btrim(p_reply), status = v_status, replied_by = auth.uid(), replied_at = now()
   where id = p_ticket_id;

  perform notify_profile(v_ticket.profile_id, 'support_reply', 'YOLO support replied',
    left(btrim(p_reply), 160), jsonb_build_object('ticket_id', p_ticket_id));
  return v_status;
end $$;

-- ------------------------------------------------------- account deletion --

/**
 * Starts deleting the caller's account. Owners of a business are stopped:
 * deleting them would orphan the business and its live deals, so that goes
 * through support. Returns when the request was made.
 */
create or replace function request_account_deletion(p_reason text default null)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_at  timestamptz := now();
  v_action uuid;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if exists (select 1 from business_members where profile_id = v_uid and member_role = 'owner') then
    raise exception 'You own a business on YOLO. Contact support to transfer or close it first'
      using errcode = 'P0001';
  end if;
  if exists (select 1 from profiles where id = v_uid and deleted_at is not null) then
    raise exception 'Deletion is already requested for this account' using errcode = 'P0001';
  end if;

  -- Open claims and bookings go back to their deals, through the same path
  -- as a customer cancelling them.
  for v_action in
    select id from customer_actions where customer_id = v_uid and status in ('pending', 'confirmed')
  loop
    perform cancel_action(v_action);
  end loop;

  delete from saved_deals where profile_id = v_uid;
  update profiles set deleted_at = v_at where id = v_uid;

  insert into support_tickets (profile_id, topic, message)
  values (v_uid, 'account_deletion',
          coalesce(nullif(btrim(p_reason), ''), 'Please delete my account and my data.'));

  perform emit_event('account.deletion_requested', 'profile', v_uid, '{}'::jsonb, v_uid);
  return v_at;
end $$;

-- ---------------------------------------------------------------- avatars --
--
-- A profile picture is a file in the public 'avatars' bucket, under a folder
-- named after its owner. The profile keeps the path, not a URL: a free-form
-- URL could point anywhere, while a path is checked to sit in the owner's own
-- folder, and storage policies only let people write to that folder.

alter table profiles add column avatar_path text
  check (avatar_path is null
         or (starts_with(avatar_path, id::text || '/') and length(avatar_path) <= 200));
grant update (avatar_path) on profiles to authenticated;

-- Storage exists on Supabase, not in the bare-Postgres test database.
do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'storage schema not present; skipping the avatars bucket';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  execute 'drop policy if exists avatars_read on storage.objects';
  execute 'drop policy if exists avatars_insert_own on storage.objects';
  execute 'drop policy if exists avatars_update_own on storage.objects';
  execute 'drop policy if exists avatars_delete_own on storage.objects';

  execute $p$create policy avatars_read on storage.objects for select
    using (bucket_id = 'avatars')$p$;
  execute $p$create policy avatars_insert_own on storage.objects for insert to authenticated
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy avatars_update_own on storage.objects for update to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy avatars_delete_own on storage.objects for delete to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
end $$;

-- ---------------------------------------------------------------- grants --

revoke execute on function create_support_ticket(jsonb)                 from public, anon;
revoke execute on function support_queue()                              from public, anon;
revoke execute on function reply_support_ticket(uuid, text, boolean)    from public, anon;
revoke execute on function request_account_deletion(text)               from public, anon;
grant  execute on function create_support_ticket(jsonb)                 to authenticated;
grant  execute on function support_queue()                              to authenticated;
grant  execute on function reply_support_ticket(uuid, text, boolean)    to authenticated;
grant  execute on function request_account_deletion(text)               to authenticated;
