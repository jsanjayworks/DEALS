-- ============================================================================
-- YOLO Deals — 0002_rls: row level security
--
-- Shape of the rules:
--   * Customers read only live deals, and only their own actions.
--   * Merchants read and write only deals of businesses they belong to, via
--     business_members, so one account can be a customer and a merchant.
--   * Admins are flagged by profiles.is_admin.
--   * deals.status is NOT writable by anyone directly — column privilege is
--     revoked below, so the lifecycle can only move through transition_deal().
-- ============================================================================

alter table profiles               enable row level security;
alter table localities             enable row level security;
alter table push_tokens            enable row level security;
alter table saved_locations        enable row level security;
alter table notifications          enable row level security;
alter table businesses             enable row level security;
alter table business_members       enable row level security;
alter table business_locations     enable row level security;
alter table business_verifications enable row level security;
alter table categories             enable row level security;
alter table deal_types             enable row level security;
alter table profile_interests      enable row level security;
alter table tags                   enable row level security;
alter table deals                  enable row level security;
alter table deal_tags              enable row level security;
alter table deal_media             enable row level security;
alter table deal_locations         enable row level security;
alter table deal_availability      enable row level security;
alter table deal_eligibility       enable row level security;
alter table deal_actions           enable row level security;
alter table deal_status_history    enable row level security;
alter table deal_transitions       enable row level security;
alter table customer_actions       enable row level security;
alter table reviews                enable row level security;
alter table reports                enable row level security;
alter table saved_deals            enable row level security;
alter table deal_events            enable row level security;
alter table deal_analytics_daily   enable row level security;
alter table search_queries         enable row level security;
alter table outbox_events          enable row level security;
alter table processed_events       enable row level security;
alter table ranking_config         enable row level security;

-- ------------------------------------------------- reference / taxonomy ----
-- Open for reading: the app needs the category tree and locality list before
-- anyone signs in.

create policy categories_read      on categories      for select using (true);
create policy deal_types_read      on deal_types      for select using (true);
create policy tags_read            on tags            for select using (true);
create policy localities_read      on localities      for select using (true);
create policy transitions_read     on deal_transitions for select using (true);
create policy ranking_read         on ranking_config  for select using (true);

create policy categories_admin on categories for all
  using (current_is_admin()) with check (current_is_admin());
create policy deal_types_admin on deal_types for all
  using (current_is_admin()) with check (current_is_admin());
create policy localities_admin on localities for all
  using (current_is_admin()) with check (current_is_admin());

-- -------------------------------------------------------------- profiles ---
create policy profiles_self_read on profiles for select
  using (id = auth.uid() or current_is_admin());

create policy profiles_self_write on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

create policy profiles_self_insert on profiles for insert
  with check (id = auth.uid());

create policy push_tokens_own on push_tokens for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy saved_locations_own on saved_locations for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy interests_own on profile_interests for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy notifications_own on notifications for select
  using (profile_id = auth.uid());

create policy notifications_own_update on notifications for update
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy saved_deals_own on saved_deals for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ------------------------------------------------------------ businesses ---
-- Any signed-in user may create a business and become its owner; that is the
-- "I'm a business" path off the login screen.

create policy businesses_read on businesses for select using (true);

create policy businesses_insert on businesses for insert
  with check (auth.uid() is not null);

create policy businesses_member_update on businesses for update
  using (is_business_member(id) or current_is_admin())
  with check (is_business_member(id) or current_is_admin());

create policy business_members_read on business_members for select
  using (profile_id = auth.uid() or is_business_member(business_id) or current_is_admin());

-- Existing members add staff; admins add anyone. Nobody adds themselves: the
-- earlier `profile_id = auth.uid()` clause let any signed-in user join any
-- business and take over its deals and redemptions. Merchant sign-up must
-- create a business and its first owner together in one SECURITY DEFINER RPC.
create policy business_members_insert on business_members for insert
  with check (is_business_member(business_id) or current_is_admin());

create policy business_locations_read on business_locations for select using (true);

create policy business_locations_write on business_locations for all
  using (is_business_member(business_id) or current_is_admin())
  with check (is_business_member(business_id) or current_is_admin());

-- Verification documents are private: only the owning merchant and admins.
create policy business_verifications_read on business_verifications for select
  using (is_business_member(business_id) or current_is_admin());

create policy business_verifications_insert on business_verifications for insert
  with check (is_business_member(business_id));

create policy business_verifications_admin on business_verifications for update
  using (current_is_admin()) with check (current_is_admin());

-- ----------------------------------------------------------------- deals ---
-- A customer sees a deal only once it is live. A merchant sees every deal of
-- their own business, at any status, which is what My Deals needs.

create policy deals_public_read on deals for select
  using (
    status in ('ACTIVE','PUBLISHED')
    or is_business_member(business_id)
    or current_is_admin()
  );

create policy deals_merchant_insert on deals for insert
  with check (is_business_member(business_id) or current_is_admin());

create policy deals_merchant_update on deals for update
  using (
    (is_business_member(business_id) and status in ('DRAFT','REJECTED'))
    or current_is_admin()
  )
  with check (
    (is_business_member(business_id) and status in ('DRAFT','REJECTED'))
    or current_is_admin()
  );

create policy deals_merchant_delete on deals for delete
  using (is_business_member(business_id) and status = 'DRAFT');

-- Child tables inherit the parent deal's visibility.
create policy deal_media_read on deal_media for select
  using (exists (select 1 from deals d where d.id = deal_id
                 and (d.status in ('ACTIVE','PUBLISHED')
                      or is_business_member(d.business_id) or current_is_admin())));
create policy deal_media_write on deal_media for all
  using (exists (select 1 from deals d where d.id = deal_id
                 and (is_business_member(d.business_id) or current_is_admin())))
  with check (exists (select 1 from deals d where d.id = deal_id
                 and (is_business_member(d.business_id) or current_is_admin())));

create policy deal_availability_read on deal_availability for select
  using (exists (select 1 from deals d where d.id = deal_id
                 and (d.status in ('ACTIVE','PUBLISHED')
                      or is_business_member(d.business_id) or current_is_admin())));
create policy deal_availability_write on deal_availability for all
  using (exists (select 1 from deals d where d.id = deal_id
                 and (is_business_member(d.business_id) or current_is_admin())))
  with check (exists (select 1 from deals d where d.id = deal_id
                 and (is_business_member(d.business_id) or current_is_admin())));

create policy deal_eligibility_read on deal_eligibility for select
  using (exists (select 1 from deals d where d.id = deal_id
                 and (d.status in ('ACTIVE','PUBLISHED')
                      or is_business_member(d.business_id) or current_is_admin())));
create policy deal_eligibility_write on deal_eligibility for all
  using (exists (select 1 from deals d where d.id = deal_id
                 and (is_business_member(d.business_id) or current_is_admin())))
  with check (exists (select 1 from deals d where d.id = deal_id
                 and (is_business_member(d.business_id) or current_is_admin())));

create policy deal_actions_read on deal_actions for select
  using (exists (select 1 from deals d where d.id = deal_id
                 and (d.status in ('ACTIVE','PUBLISHED')
                      or is_business_member(d.business_id) or current_is_admin())));
create policy deal_actions_write on deal_actions for all
  using (exists (select 1 from deals d where d.id = deal_id
                 and (is_business_member(d.business_id) or current_is_admin())))
  with check (exists (select 1 from deals d where d.id = deal_id
                 and (is_business_member(d.business_id) or current_is_admin())));

create policy deal_tags_read on deal_tags for select using (true);
create policy deal_tags_write on deal_tags for all
  using (exists (select 1 from deals d where d.id = deal_id
                 and (is_business_member(d.business_id) or current_is_admin())))
  with check (exists (select 1 from deals d where d.id = deal_id
                 and (is_business_member(d.business_id) or current_is_admin())));

create policy deal_locations_read on deal_locations for select using (true);
create policy deal_locations_write on deal_locations for all
  using (exists (select 1 from deals d where d.id = deal_id
                 and (is_business_member(d.business_id) or current_is_admin())))
  with check (exists (select 1 from deals d where d.id = deal_id
                 and (is_business_member(d.business_id) or current_is_admin())));

-- The lifecycle timeline on the merchant deal screen.
create policy deal_status_history_read on deal_status_history for select
  using (exists (select 1 from deals d where d.id = deal_id
                 and (is_business_member(d.business_id) or current_is_admin())));

-- ------------------------------------------------------ customer actions ---
-- The customer owns the row; the merchant needs to see claims against their
-- own deals to honour them at the counter.

create policy customer_actions_own on customer_actions for select
  using (
    customer_id = auth.uid()
    or current_is_admin()
    or exists (select 1 from deals d
               where d.id = deal_id and is_business_member(d.business_id))
  );

create policy customer_actions_own_update on customer_actions for update
  using (
    customer_id = auth.uid()
    or current_is_admin()
    or exists (select 1 from deals d
               where d.id = deal_id and is_business_member(d.business_id))
  )
  with check (true);

-- ------------------------------------------------- reviews and reporting ---
create policy reviews_read on reviews for select
  using (status = 'visible' or customer_id = auth.uid() or current_is_admin());

create policy reviews_write_own on reviews for insert
  with check (customer_id = auth.uid());

create policy reviews_update_own on reviews for update
  using (customer_id = auth.uid() or current_is_admin())
  with check (customer_id = auth.uid() or current_is_admin());

create policy reports_insert on reports for insert
  with check (reporter_id = auth.uid());

create policy reports_read on reports for select
  using (reporter_id = auth.uid() or current_is_admin());

create policy reports_admin on reports for update
  using (current_is_admin()) with check (current_is_admin());

-- ---------------------------------------------------------- analytics -----
-- Raw events are write-only for clients: you may add your own, never read the
-- stream back. Merchants read their own deals' rollups.

create policy deal_events_insert on deal_events for insert
  with check (profile_id = auth.uid() or profile_id is null);

create policy deal_events_read on deal_events for select
  using (current_is_admin());

create policy analytics_read on deal_analytics_daily for select
  using (
    current_is_admin()
    or exists (select 1 from deals d
               where d.id = deal_id and is_business_member(d.business_id))
  );

create policy search_queries_insert on search_queries for insert
  with check (profile_id = auth.uid() or profile_id is null);

create policy search_queries_read on search_queries for select
  using (current_is_admin());

-- The outbox and the idempotency ledger belong to the server alone. No policy
-- is created, so with RLS enabled they are unreachable from anon/authenticated
-- keys; the SECURITY DEFINER functions and the service role still reach them.

-- -------------------------------------------------- write lockdown --------
-- Supabase grants ALL on public tables to anon and authenticated and leans on
-- RLS. A table-wide UPDATE grant OVERRIDES any column-level revoke — Postgres
-- keeps honouring the broader privilege — so `revoke update (status)` alone is
-- worthless. The table-level privilege has to go first.
--
-- Nothing is granted back. Every write to these two tables belongs to an RPC:
--   deals             -> save_deal_draft, transition_deal, review_deal, duplicate_deal
--   customer_actions  -> take_deal_action, cancel_action, redeem_action
-- Those are SECURITY DEFINER, so they run as the owner and are unaffected.
--
-- The policies above are kept deliberately: they stay correct if a future
-- migration grants a narrow column set back, and they document the intent.

revoke insert, update, delete on deals            from anon, authenticated;
revoke insert, update, delete on customer_actions from anon, authenticated;

-- profiles_self_write lets a user update their own row, which without this
-- would include is_admin and is_yolo_verified — self-promotion to admin, and
-- self-granting the badge that unlocks "verified users only" deals. Only the
-- fields a person legitimately edits about themselves are granted back.
-- Note phone is excluded: it is the identity, and changing it belongs to auth.
revoke update on profiles from anon, authenticated;
grant  update (full_name, email, date_of_birth, default_radius_m,
               onboarded_at, deleted_at)
  on profiles to authenticated;

-- The audit trail is append-only, and only from inside transition_deal().
revoke insert, update, delete on deal_status_history from anon, authenticated;

-- Reviews and reports are ordinary user content and stay client-writable,
-- but their verdict fields are not.
revoke update on reports from anon, authenticated;
grant  update (details) on reports to authenticated;

-- Reference data is read-only for clients; admins change it through the
-- categories_admin / deal_types_admin / localities_admin policies, which the
-- grants below still allow.
revoke insert, update, delete on deal_transitions, ranking_config
  from anon, authenticated;

-- ----------------------------------------------------------- grants -------
-- RPCs are the supported surface. Reads go through the views and policies.

grant select on deal_card_base to anon, authenticated;

grant execute on function feed_nearby(double precision, double precision, int, text, int, int)
  to anon, authenticated;
grant execute on function search_deals(jsonb, double precision, double precision, int, int)
  to anon, authenticated;
grant execute on function get_deal(uuid, double precision, double precision)
  to anon, authenticated;
grant execute on function take_deal_action(uuid, customer_action_type, int, timestamptz, jsonb)
  to authenticated;
grant execute on function cancel_action(uuid)            to authenticated;
grant execute on function redeem_action(text)            to authenticated;
grant execute on function save_deal_draft(jsonb)         to authenticated;
grant execute on function duplicate_deal(uuid)           to authenticated;
grant execute on function transition_deal(uuid, deal_status, actor_kind, text) to authenticated;
grant execute on function review_deal(uuid, boolean, text)     to authenticated;
grant execute on function review_business(uuid, boolean, text) to authenticated;
grant execute on function report_target(text, uuid, text, text) to authenticated;
grant execute on function record_deal_events(jsonb)      to anon, authenticated;
grant execute on function merchant_stats(uuid, int)      to authenticated;
grant execute on function current_is_admin()             to anon, authenticated;
grant execute on function is_business_member(uuid)       to anon, authenticated;

-- Card reads for the app's own lists. Each checks who is asking.
grant execute on function business_deals(uuid)                               to authenticated;
grant execute on function review_queue()                                      to authenticated;
grant execute on function saved_deal_cards(double precision, double precision) to authenticated;
grant execute on function my_action_deals(double precision, double precision)  to authenticated;
grant execute on function get_business(uuid)                                  to anon, authenticated;
grant execute on function list_localities()                                   to anon, authenticated;

-- deal_cards builds cards with no visibility check; only the readers above
-- may call it.
revoke execute on function deal_cards(uuid[], double precision, double precision)
  from public, anon, authenticated;

-- Workers only.
--
-- Postgres grants EXECUTE on every new function to PUBLIC, and anon and
-- authenticated inherit it through that. Revoking from those two roles alone
-- leaves the PUBLIC grant intact and changes nothing — PUBLIC has to be named.
--
-- transition_deal_internal is the sharpest edge here: it trusts its actor
-- argument, so reaching it would let a client claim to be 'system' and drive
-- any deal anywhere. Clients get transition_deal, which derives the actor from
-- the session instead.
revoke execute on function transition_deal_internal(uuid, deal_status, actor_kind, text)
  from public, anon, authenticated;
revoke execute on function claim_outbox_batch(int)
  from public, anon, authenticated;
revoke execute on function activate_due_deals()
  from public, anon, authenticated;
revoke execute on function expire_due_deals()
  from public, anon, authenticated;
revoke execute on function rollup_deal_analytics(date)
  from public, anon, authenticated;
revoke execute on function ensure_event_partitions()
  from public, anon, authenticated;
revoke execute on function emit_event(text, text, uuid, jsonb, uuid)
  from public, anon, authenticated;
revoke execute on function notify_profile(uuid, text, text, text, jsonb)
  from public, anon, authenticated;
revoke execute on function gen_redemption_code()
  from public, anon, authenticated;
