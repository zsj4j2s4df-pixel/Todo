-- In-app notifications only. No push subscription or external delivery.
create table public.notification_preferences(
 user_id uuid primary key references auth.users on delete cascade,
 assignment_enabled boolean not null default true,
 completion_enabled boolean not null default true
);
create table public.notifications(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users on delete cascade,
 item_id uuid not null references public.items on delete cascade,
 kind text not null check(kind in ('assignment','completion')),
 created_at timestamptz not null default now(),
 read_at timestamptz
);
create index notifications_recipient on public.notifications(user_id,created_at desc);
alter table public.notification_preferences enable row level security;
alter table public.notifications enable row level security;
create policy preference_read on public.notification_preferences for select to authenticated using(user_id=auth.uid());
create policy preference_insert on public.notification_preferences for insert to authenticated with check(user_id=auth.uid());
create policy preference_update on public.notification_preferences for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy notification_read on public.notifications for select to authenticated using(user_id=auth.uid() and exists(select 1 from public.items where id=item_id));
create policy notification_seen on public.notifications for update to authenticated using(user_id=auth.uid() and exists(select 1 from public.items where id=item_id)) with check(user_id=auth.uid() and exists(select 1 from public.items where id=item_id));
revoke all on public.notifications,public.notification_preferences from anon;
revoke all on public.notifications from authenticated;
grant select on public.notifications to authenticated;
grant update(read_at) on public.notifications to authenticated;
grant select,insert,update on public.notification_preferences to authenticated;
create function public.record_item_notifications() returns trigger language plpgsql security definer set search_path=public as $$
declare recipient uuid;recipients uuid[];allowed boolean;begin
 if TG_OP='INSERT' then select coalesce(array_agg(distinct person),'{}'::uuid[]) into recipients from unnest(new.assignees) person;
 else select coalesce(array_agg(distinct person),'{}'::uuid[]) into recipients from unnest(new.assignees) person where not(person=any(old.assignees));end if;
 foreach recipient in array recipients loop
  if recipient<>auth.uid() and coalesce((select assignment_enabled from notification_preferences where user_id=recipient),true) then
   insert into notifications(user_id,item_id,kind) values(recipient,new.id,'assignment');
  end if;
 end loop;
 if TG_OP='UPDATE' and old.status<>'done' and new.status='done' then
  for recipient in select distinct unnest(new.assignees||array[new.owner_id]) loop
   allowed=recipient=new.owner_id or (exists(select 1 from household_members where household_id=new.household_id and user_id=recipient) and (new.visibility='shared' or (new.visibility='selected' and recipient=any(new.selected_users))));
   if allowed and recipient<>auth.uid() and coalesce((select completion_enabled from notification_preferences where user_id=recipient),true) then
    insert into notifications(user_id,item_id,kind) values(recipient,new.id,'completion');
   end if;
  end loop;
 end if;
 return new;
end $$;
create trigger item_notifications after insert or update on public.items for each row execute function public.record_item_notifications();
revoke all on function public.record_item_notifications() from public,anon,authenticated;
