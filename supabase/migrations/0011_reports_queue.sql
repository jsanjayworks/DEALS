-- ============================================================================
-- YOLO Deals — reports queue
--
-- Customers have been able to report a deal ("misleading", "not honoured")
-- since 0002, but nobody could see the reports. Admins now get them grouped
-- per deal, newest first, and either dismiss them or pause the deal with a
-- note the merchant receives. Pausing goes through the same lifecycle path
-- as everything else, so the history and the outbox record it.
-- ============================================================================

/** Open reports, one row per reported deal or business, most reported first. */
create or replace function reports_queue()
returns table (
  target_type  text,
  target_id    uuid,
  title        text,
  business_id  uuid,
  business_name text,
  deal_status  text,
  open_count   int,
  reasons      text[],
  details      text[],
  first_at     timestamptz,
  last_at      timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not current_is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;

  return query
  select
    r.target_type,
    r.target_id,
    coalesce(d.title, b.name, 'Removed item')::text,
    coalesce(d.business_id, b.id),
    coalesce(db.name, b.name)::text,
    d.status::text,
    count(*)::int,
    array_agg(distinct r.reason),
    array_remove(array_agg(nullif(btrim(r.details), '') order by r.created_at desc), null),
    min(r.created_at),
    max(r.created_at)
  from reports r
  left join deals d      on r.target_type = 'deal' and d.id = r.target_id
  left join businesses db on db.id = d.business_id
  left join businesses b  on r.target_type = 'business' and b.id = r.target_id
  where r.status = 'open'
  group by r.target_type, r.target_id, d.title, b.name, d.business_id, b.id, db.name, d.status
  order by count(*) desc, max(r.created_at) desc;
end $$;

/**
 * Settle the open reports on one deal or business.
 *   dismiss  nothing wrong: the reports are closed as dismissed
 *   pause    the deal is paused (if live) and its owners are told why;
 *            the note is required
 * Returns how many reports were settled.
 */
create or replace function resolve_reports(
  p_target_type text,
  p_target_id   uuid,
  p_action      text,
  p_note        text default null
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_deal  deals;
  v_count int;
  v_owner uuid;
begin
  if not current_is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  if p_action not in ('dismiss', 'pause') then
    raise exception 'action must be dismiss or pause' using errcode = '22023';
  end if;

  if p_action = 'pause' then
    if p_target_type <> 'deal' then
      raise exception 'only a deal can be paused' using errcode = '22023';
    end if;
    if coalesce(btrim(p_note), '') = '' then
      raise exception 'say why the deal is paused; the merchant sees it' using errcode = '22023';
    end if;
    select * into v_deal from deals where id = p_target_id;
    if not found then
      raise exception 'deal not found' using errcode = 'P0002';
    end if;
    if v_deal.status = 'ACTIVE' then
      perform transition_deal_internal(p_target_id, 'PAUSED', 'admin', p_note);
    end if;
    for v_owner in
      select profile_id from business_members where business_id = v_deal.business_id
    loop
      perform notify_profile(v_owner, 'deal_paused', 'Your deal was paused',
        v_deal.title || ': ' || btrim(p_note),
        jsonb_build_object('deal_id', p_target_id));
    end loop;
  end if;

  update reports
     set status = case p_action when 'pause' then 'actioned' else 'dismissed' end,
         resolved_by = auth.uid(),
         resolved_at = now()
   where target_type = p_target_type and target_id = p_target_id and status = 'open';
  get diagnostics v_count = row_count;

  perform emit_event('reports.resolved', p_target_type, p_target_id,
    jsonb_build_object('action', p_action, 'count', v_count, 'note', p_note));
  return v_count;
end $$;

revoke execute on function reports_queue()                         from public, anon;
revoke execute on function resolve_reports(text, uuid, text, text) from public, anon;
grant  execute on function reports_queue()                         to authenticated;
grant  execute on function resolve_reports(text, uuid, text, text) to authenticated;
