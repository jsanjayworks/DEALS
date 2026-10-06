-- ============================================================================
-- YOLO Deals — support requests become conversations
--
-- 0007 kept one reply per request, so a second answer wrote over the first
-- and the customer could not answer back. Each request now has a thread of
-- messages: the customer's first message, every team reply and every
-- follow-up. support_tickets.reply stays as the latest team reply for
-- anything that still reads it.
--
-- Also: an admin can close a request without typing a reply, see closed
-- requests, and decisions on deals name the deal in the notification.
-- ============================================================================

create table support_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references support_tickets(id) on delete cascade,
  author      text not null check (author in ('customer', 'team')),
  author_id   uuid references profiles(id) on delete set null,
  body        text not null check (length(btrim(body)) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index support_messages_ticket on support_messages (ticket_id, created_at);

alter table support_messages enable row level security;
create policy support_messages_read on support_messages for select
  using (exists (select 1 from support_tickets t
                 where t.id = ticket_id and (t.profile_id = auth.uid() or current_is_admin())));
revoke insert, update, delete on support_messages from anon, authenticated;

-- Existing requests keep their history.
insert into support_messages (ticket_id, author, author_id, body, created_at)
select id, 'customer', profile_id, message, created_at from support_tickets;
insert into support_messages (ticket_id, author, author_id, body, created_at)
select id, 'team', replied_by, reply, coalesce(replied_at, created_at)
  from support_tickets where reply is not null;

/** Every new request opens its thread with the customer's message. */
create or replace function support_ticket_first_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into support_messages (ticket_id, author, author_id, body, created_at)
  values (new.id, 'customer', new.profile_id, new.message, new.created_at);
  return new;
end $$;

drop trigger if exists support_ticket_first_message on support_tickets;
create trigger support_ticket_first_message after insert on support_tickets
  for each row execute function support_ticket_first_message();

/**
 * An admin answers, closes, or both. A reply is added to the thread and the
 * customer is notified; closing without a reply is allowed.
 */
create or replace function reply_support_ticket(
  p_ticket_id uuid, p_reply text, p_close boolean default false
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_ticket support_tickets%rowtype;
  v_reply  text := btrim(coalesce(p_reply, ''));
  v_status text;
begin
  if not current_is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if length(v_reply) < 2 and not p_close then
    raise exception 'Write a reply first' using errcode = 'P0001';
  end if;
  select * into v_ticket from support_tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'That request no longer exists' using errcode = 'P0001';
  end if;

  v_status := case when p_close then 'closed' else 'answered' end;
  if length(v_reply) >= 2 then
    insert into support_messages (ticket_id, author, author_id, body)
    values (p_ticket_id, 'team', auth.uid(), v_reply);
    update support_tickets
       set reply = v_reply, status = v_status, replied_by = auth.uid(), replied_at = now()
     where id = p_ticket_id;
    perform notify_profile(v_ticket.profile_id, 'support_reply', 'YOLO support replied',
      left(v_reply, 160), jsonb_build_object('ticket_id', p_ticket_id));
  else
    update support_tickets set status = v_status where id = p_ticket_id;
  end if;
  return v_status;
end $$;

/** The customer answers back; the request opens again for the team. */
create or replace function follow_up_support_ticket(p_ticket_id uuid, p_message text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_ticket support_tickets%rowtype;
  v_body   text := btrim(coalesce(p_message, ''));
begin
  select * into v_ticket from support_tickets where id = p_ticket_id for update;
  if not found or v_ticket.profile_id is distinct from auth.uid() then
    raise exception 'That request is not yours' using errcode = '42501';
  end if;
  if length(v_body) < 2 then
    raise exception 'Write your message first' using errcode = 'P0001';
  end if;
  if length(v_body) > 2000 then
    raise exception 'Keep it under 2,000 characters' using errcode = 'P0001';
  end if;
  insert into support_messages (ticket_id, author, author_id, body)
  values (p_ticket_id, 'customer', auth.uid(), v_body);
  update support_tickets set status = 'open' where id = p_ticket_id;
  perform emit_event('support.follow_up', 'support_ticket', p_ticket_id, '{}'::jsonb, auth.uid());
  return 'open';
end $$;

/**
 * The admin inbox: active requests (open first, then answered) or closed
 * ones, each with its thread.
 */
drop function if exists support_queue();
create or replace function support_queue(p_view text default 'active')
returns table (
  id uuid, topic text, message text, status text, created_at timestamptz,
  customer_name text, customer_contact text, redemption_code text,
  action_status text, deal_id uuid, deal_title text, reply text, messages jsonb
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not current_is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return query
    select t.id, t.topic, t.message, t.status, t.created_at,
           coalesce(p.full_name, ''), coalesce(p.phone, p.email, ''),
           a.redemption_code, a.status::text, t.deal_id, d.title, t.reply,
           coalesce((select jsonb_agg(jsonb_build_object('author', m.author, 'body', m.body,
                                                         'created_at', m.created_at)
                                      order by m.created_at)
                     from support_messages m where m.ticket_id = t.id), '[]'::jsonb)
    from support_tickets t
    join profiles p on p.id = t.profile_id
    left join customer_actions a on a.id = t.action_id
    left join deals d on d.id = t.deal_id
    where case p_view
            when 'closed' then t.status = 'closed'
            when 'all'    then true
            else t.status <> 'closed'
          end
    order by (t.status = 'open') desc, t.created_at;
end $$;

revoke execute on function support_queue(text)                    from public, anon;
revoke execute on function follow_up_support_ticket(uuid, text)   from public, anon;
grant  execute on function support_queue(text)                    to authenticated;
grant  execute on function follow_up_support_ticket(uuid, text)   to authenticated;

-- ------------------------------------------------- deal decision wording --
-- Same decision as 0002's review_deal; the notification now names the deal,
-- says "goes live on <date>" for a scheduled deal instead of "is live", and
-- reaches every owner of the business.
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

  for v_owner in
    select profile_id from business_members where business_id = v_deal.business_id
  loop
    perform notify_profile(
      v_owner,
      case when p_approve then 'deal_approved' else 'deal_rejected' end,
      case when p_approve then 'Deal approved: ' else 'Needs changes: ' end || v_deal.title,
      case
        when not p_approve then coalesce(p_reason, 'Please review and resubmit.')
        when v_status = 'ACTIVE' then 'It is live and visible to customers.'
        else 'It goes live on ' || to_char(v_deal.starts_at at time zone 'Asia/Kolkata', 'FMDD Mon') || '.'
      end,
      jsonb_build_object('deal_id', p_deal_id)
    );
  end loop;

  return v_status;
end $$;
