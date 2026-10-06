-- ============================================================================
-- YOLO Deals — deal photos
--
-- Merchants upload a photo of what they are offering into the public
-- 'deal-photos' bucket, under a folder named after their business id. Only
-- members of that business may write there. The deal keeps the public URL in
-- deal_media.storage_path, as the seeded deals do; a deal without its own
-- photo gets a stock photo matched to it (src/data/photo-library.ts), and
-- every deal is reviewed by an admin before it goes live.
-- ============================================================================

/**
 * True when the first folder of a storage path is a business the caller
 * belongs to. Anything that is not a business id is simply refused, never
 * an error, so a stray upload cannot break the policy check.
 */
create or replace function is_member_of_folder(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_folder text := split_part(coalesce(p_name, ''), '/', 1);
begin
  if v_folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return is_business_member(v_folder::uuid);
end $$;

revoke execute on function is_member_of_folder(text) from public, anon;
grant  execute on function is_member_of_folder(text) to authenticated;

-- Storage exists on Supabase, not in the bare-Postgres test database.
do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'storage schema not present; skipping the deal-photos bucket';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('deal-photos', 'deal-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  execute 'drop policy if exists deal_photos_read on storage.objects';
  execute 'drop policy if exists deal_photos_insert_member on storage.objects';
  execute 'drop policy if exists deal_photos_update_member on storage.objects';
  execute 'drop policy if exists deal_photos_delete_member on storage.objects';

  execute $p$create policy deal_photos_read on storage.objects for select
    using (bucket_id = 'deal-photos')$p$;
  execute $p$create policy deal_photos_insert_member on storage.objects for insert to authenticated
    with check (bucket_id = 'deal-photos' and public.is_member_of_folder(name))$p$;
  execute $p$create policy deal_photos_update_member on storage.objects for update to authenticated
    using (bucket_id = 'deal-photos' and public.is_member_of_folder(name))$p$;
  execute $p$create policy deal_photos_delete_member on storage.objects for delete to authenticated
    using (bucket_id = 'deal-photos' and public.is_member_of_folder(name))$p$;
end $$;
