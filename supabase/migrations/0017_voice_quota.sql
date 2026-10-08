-- ============================================================================
-- YOLO Deals — a daily allowance for the voice assistant
--
-- /api/assist sends what someone said to Claude on the server's key. Only a
-- signed-in person may use it, and each has a daily allowance, so a script
-- that finds the endpoint cannot run up the bill. The server calls
-- use_voice_quota() with the person's own token before every request.
--
--   customer  everyday commands ("best deal for me")      100 a day
--   deal      a merchant describing one deal               40 a day, members only
--   merchant  describing a whole business to sign up        10 a day
-- ============================================================================

create table if not exists voice_usage (
  profile_id uuid not null references profiles(id) on delete cascade,
  day        date not null,
  task       text not null check (task in ('customer', 'deal', 'merchant')),
  uses       int  not null default 0,
  primary key (profile_id, day, task)
);

alter table voice_usage enable row level security;
-- Read your own counts; only use_voice_quota() writes.
create policy voice_usage_own on voice_usage for select using (profile_id = auth.uid());
revoke insert, update, delete on voice_usage from anon, authenticated;

/**
 * Counts one use of the assistant for today (Bengaluru time) and says whether
 * it is within the allowance. Refuses signed-out callers, and deal drafting
 * for anyone who is not on a business.
 */
create or replace function use_voice_quota(p_task text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_day   date := (now() at time zone 'Asia/Kolkata')::date;
  v_limit int  := case p_task when 'customer' then 100 when 'deal' then 40 when 'merchant' then 10 end;
  v_uses  int;
begin
  if v_uid is null then
    raise exception 'Sign in to use the voice assistant' using errcode = '42501';
  end if;
  if v_limit is null then
    raise exception 'Unknown assistant task' using errcode = '22023';
  end if;
  if p_task = 'deal' and not exists (select 1 from business_members where profile_id = v_uid) then
    raise exception 'Only a business can draft deals by voice' using errcode = '42501';
  end if;

  insert into voice_usage as u (profile_id, day, task, uses)
  values (v_uid, v_day, p_task, 1)
  on conflict (profile_id, day, task) do update set uses = u.uses + 1
  returning uses into v_uses;

  return v_uses <= v_limit;
end $$;

revoke execute on function use_voice_quota(text) from public, anon;
grant  execute on function use_voice_quota(text) to authenticated;
