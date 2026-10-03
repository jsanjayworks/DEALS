-- ============================================================================
-- YOLO Deals — 0004: a profile for every new sign-in
--
-- profiles.id references auth.users, and nearly every table hangs off
-- profiles: customer_actions, saved_deals, notifications, business_members.
-- Without this, someone signing in for the first time has an auth user but no
-- profile, and their first claim fails on a foreign key.
--
-- The trigger only creates the row. Everything else (name, birth date for
-- age-gated deals, verification) is filled in later by the person or an admin.
-- ============================================================================

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, phone, email)
  values (
    new.id,
    -- Auth stores phones without the leading +; profiles keep E.164.
    case when coalesce(new.phone, '') = '' then null
         when new.phone like '+%' then new.phone
         else '+' || new.phone end,
    nullif(new.email, '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Only the trigger calls it.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
