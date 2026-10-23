create table public.brief_preferences (
 user_id uuid primary key references auth.users on delete cascade,
 delivery_time time not null default '08:00',
 tasks_enabled boolean not null default true, events_enabled boolean not null default true,
 clashes_enabled boolean not null default true, weather_enabled boolean not null default false,
 place_name text not null default '' check(length(place_name)<=120),
 latitude double precision check(latitude between -90 and 90),longitude double precision check(longitude between -180 and 180),
 weather_time time not null default '08:30',weather_later_time time not null default '17:30',
 timezone text not null default 'Europe/Amsterdam',
 check(not weather_enabled or (latitude is not null and longitude is not null and length(trim(place_name))>0))
);
alter table public.brief_preferences enable row level security;
revoke all on public.brief_preferences from public,anon,authenticated;
grant select,insert,update on public.brief_preferences to authenticated;
create policy brief_read on public.brief_preferences for select to authenticated using(user_id=(select auth.uid()));
create policy brief_insert on public.brief_preferences for insert to authenticated with check(user_id=(select auth.uid()));
create policy brief_update on public.brief_preferences for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create function private.validate_brief_preferences() returns trigger language plpgsql set search_path='' as $$begin
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then raise exception 'Ongeldige tijdzone';end if;
 return new;end$$;
revoke all on function private.validate_brief_preferences() from public,anon,authenticated;
create trigger validate_brief_preferences before insert or update on public.brief_preferences for each row execute function private.validate_brief_preferences();

-- Account-level delivery time, day content and optional weather.
create or replace function private.claim_push_jobs(dispatch_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare expected text; vapid_public text; vapid_private text; jobs jsonb;
begin
 select decrypted_secret into expected from vault.decrypted_secrets where name='todo_push_dispatch_key';
 if expected is null or dispatch_key is null or length(dispatch_key)<32 or dispatch_key<>expected then raise exception 'Unauthorized';end if;
 select decrypted_secret into vapid_public from vault.decrypted_secrets where name='todo_push_vapid_public';
 select decrypted_secret into vapid_private from vault.decrypted_secrets where name='todo_push_vapid_private';
 if vapid_public is null or vapid_private is null then raise exception 'Push is not configured';end if;
 -- Bound retention and retries. Accepted means push provider accepted, not device delivery.
 delete from private.push_jobs where created_at<now()-interval '7 days';
 insert into private.push_jobs(subscription_id,event_key,item_id,kind)
 select s.id,'notification:'||n.id,n.item_id,n.kind from public.push_subscriptions s
 join public.notifications n on n.user_id=s.user_id
 join public.items i on i.id=n.item_id
 left join public.notification_preferences p on p.user_id=s.user_id
 where n.created_at>=s.created_at and n.created_at>now()-interval '1 day' and private.push_item_visible(i,s.user_id)
 and ((n.kind='assignment' and coalesce(p.assignment_enabled,true)) or (n.kind='completion' and coalesce(p.completion_enabled,true)))
 on conflict(subscription_id,event_key) do nothing;
 insert into private.push_jobs(subscription_id,event_key,item_id,kind)
 select s.id,'reminder:'||i.id||':'||i.due_at,i.id,'reminder'
 from public.push_subscriptions s join public.items i on (i.owner_id=s.user_id or s.user_id=any(i.assignees))
 where s.reminders_enabled and i.kind='reminder' and i.status='open' and i.due_at<=now() and i.due_at>=s.created_at and i.due_at>now()-interval '1 day' and private.push_item_visible(i,s.user_id)
 on conflict(subscription_id,event_key) do nothing;
 insert into private.push_jobs(subscription_id,event_key,kind)
 select s.id,'morning:'||s.user_id||':'||(now() at time zone coalesce(p.timezone,s.timezone))::date,'morning'
 from public.push_subscriptions s left join public.brief_preferences p on p.user_id=s.user_id
 where s.morning_enabled
 and now() >= (((now() at time zone coalesce(p.timezone,s.timezone))::date + coalesce(p.delivery_time,'08:00'::time)) at time zone coalesce(p.timezone,s.timezone))
 and now() < (((now() at time zone coalesce(p.timezone,s.timezone))::date + coalesce(p.delivery_time,'08:00'::time)) at time zone coalesce(p.timezone,s.timezone)) + interval '1 hour'
 on conflict(subscription_id,event_key) do nothing;
 -- Recheck privacy and preferences at every claim, including retries.
 update private.push_jobs j set state='discarded' from public.push_subscriptions s left join public.brief_preferences b on b.user_id=s.user_id
 where s.id=j.subscription_id and j.state='pending' and (
 j.created_at<now()-interval '1 day' or (j.kind='morning' and (not s.morning_enabled or j.event_key<>'morning:'||s.user_id||':'||(now() at time zone coalesce(b.timezone,s.timezone))::date)) or (j.kind='reminder' and not s.reminders_enabled)
 or (j.item_id is not null and not exists(select 1 from public.items i where i.id=j.item_id and private.push_item_visible(i,s.user_id)
 and (j.kind<>'reminder' or (i.status='open' and i.due_at>now()-interval '1 day' and i.kind='reminder' and (i.owner_id=s.user_id or s.user_id=any(i.assignees)) and j.event_key='reminder:'||i.id||':'||i.due_at))))
 or (j.kind='assignment' and exists(select 1 from public.notification_preferences p where p.user_id=s.user_id and not p.assignment_enabled))
 or (j.kind='completion' and exists(select 1 from public.notification_preferences p where p.user_id=s.user_id and not p.completion_enabled))
 );
 with due as (select id from private.push_jobs where state='pending' and attempts<5 and retry_at<=now() order by retry_at,id limit 50 for update skip locked),
 claimed as (update private.push_jobs j set lease=gen_random_uuid(),attempts=attempts+1,retry_at=now()+interval '5 minutes' from due where j.id=due.id returning j.*)
 select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'lease',j.lease,'kind',j.kind,'tag',j.event_key,'weather',case when j.kind='morning' and p.weather_enabled then jsonb_build_object('latitude',p.latitude,'longitude',p.longitude,'timezone',p.timezone,'weather_time',to_char(p.weather_time,'HH24:MI'),'weather_later_time',to_char(p.weather_later_time,'HH24:MI')) else null end,'subscription',jsonb_build_object('endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth)))),'[]'::jsonb) into jobs
 from claimed j join public.push_subscriptions s on s.id=j.subscription_id left join public.brief_preferences p on p.user_id=s.user_id;
 return jsonb_build_object('publicKey',vapid_public,'privateKey',vapid_private,'jobs',jobs);
end $$;
