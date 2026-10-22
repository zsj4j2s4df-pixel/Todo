-- Dedicated Todo API: never inherit Supabase's broad table defaults.
revoke all on public.households,public.household_members,public.household_invites,public.items,public.notification_preferences,public.notifications from public,anon,authenticated;
grant usage on schema public to authenticated;
grant select on public.households,public.household_members to authenticated;
grant select,insert,update,delete on public.items to authenticated;
grant select,insert,update on public.notification_preferences to authenticated;
grant select on public.notifications to authenticated;
grant update(read_at) on public.notifications to authenticated;
revoke create on schema public from public,anon,authenticated;

-- This schema must remain excluded from the Data API exposed schemas.
create schema if not exists private;
revoke all on schema private from public,anon;
grant usage on schema private to authenticated;
alter function public.is_member(uuid) set schema private;
alter function public.can_read_item(public.items) set schema private;
alter function public.validate_item() set schema private;
alter function public.record_item_notifications() set schema private;
alter function public.create_household(text,text) set schema private;
alter function public.create_invite() set schema private;
alter function public.join_household(uuid,text) set schema private;
alter function public.complete_item(uuid,boolean) set schema private;
create or replace function private.can_read_item(i public.items) returns boolean language sql stable security definer set search_path='' as $$ select auth.uid() is not null and (i.owner_id=auth.uid() or (private.is_member(i.household_id) and (i.visibility='shared' or (i.visibility='selected' and auth.uid()=any(i.selected_users))))) $$;
create or replace function private.complete_item(item_id uuid,done boolean) returns void language plpgsql security definer set search_path=public as $$ declare i public.items;begin
 select * into i from public.items where id=item_id for update;
 if i.id is null or not private.can_read_item(i) then raise exception 'Geen toegang';end if;
 if auth.uid()<>i.owner_id and not(auth.uid()=any(i.assignees)) then raise exception 'Alleen eigenaar of toegewezen persoon kan afronden';end if;
 update public.items set status=case when done then 'done' else 'open' end where id=item_id;end $$;
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_member(uuid),private.can_read_item(public.items),private.create_household(text,text),private.create_invite(),private.join_household(uuid,text),private.complete_item(uuid,boolean) to authenticated;
-- Only these narrow, explicitly authorized operations are public API endpoints.
create function public.create_household(household_name text,member_name text) returns uuid language sql security invoker set search_path='' as $$ select private.create_household(household_name,member_name) $$;
create function public.create_invite() returns uuid language sql security invoker set search_path='' as $$ select private.create_invite() $$;
create function public.join_household(invite_code uuid,member_name text) returns void language sql security invoker set search_path='' as $$ select private.join_household(invite_code,member_name) $$;
create function public.complete_item(item_id uuid,done boolean) returns void language sql security invoker set search_path='' as $$ select private.complete_item(item_id,done) $$;
revoke all on function public.create_household(text,text),public.create_invite(),public.join_household(uuid,text),public.complete_item(uuid,boolean) from public,anon,authenticated;
grant execute on function public.create_household(text,text),public.create_invite(),public.join_household(uuid,text),public.complete_item(uuid,boolean) to authenticated;

create policy invite_direct_access_denied on public.household_invites for select to authenticated using(false);
alter policy item_insert on public.items with check(owner_id=(select auth.uid()) and (household_id is null or private.is_member(household_id)));
alter policy item_update on public.items using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()) and (household_id is null or private.is_member(household_id)));
alter policy item_delete on public.items using(owner_id=(select auth.uid()));
alter policy preference_read on public.notification_preferences using(user_id=(select auth.uid()));
alter policy preference_insert on public.notification_preferences with check(user_id=(select auth.uid()));
alter policy preference_update on public.notification_preferences using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
alter policy notification_read on public.notifications using(user_id=(select auth.uid()) and exists(select 1 from public.items where id=item_id));
alter policy notification_seen on public.notifications using(user_id=(select auth.uid()) and exists(select 1 from public.items where id=item_id)) with check(user_id=(select auth.uid()) and exists(select 1 from public.items where id=item_id));
create index households_owner on public.households(owner_id);
create index household_invites_household on public.household_invites(household_id);
create index notifications_item on public.notifications(item_id);
