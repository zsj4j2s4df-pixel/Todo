-- Browser subscriptions contain no VAPID private keys. Own-device CRUD only.
create table public.push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users on delete cascade,
 endpoint text not null unique check(length(endpoint) <= 4096 and endpoint ~ '^https://(fcm\.googleapis\.com|([A-Za-z0-9-]+\.)*push\.services\.mozilla\.com|([A-Za-z0-9-]+\.)+push\.apple\.com|([A-Za-z0-9-]+\.)+notify\.windows\.com)/[^[:space:]]+$'),
 p256dh text not null check(length(p256dh)=87 and p256dh ~ '^[A-Za-z0-9_-]+$'),
 auth text not null check(length(auth)=22 and auth ~ '^[A-Za-z0-9_-]+$'),
 reminders_enabled boolean not null default true,
 morning_enabled boolean not null default false,
 timezone text not null default 'Europe/Amsterdam',
 created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public,anon,authenticated;
grant select,insert,update,delete on public.push_subscriptions to authenticated;
create policy push_read on public.push_subscriptions for select to authenticated using(user_id=(select auth.uid()));
create policy push_insert on public.push_subscriptions for insert to authenticated with check(user_id=(select auth.uid()));
create policy push_update on public.push_subscriptions for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy push_delete on public.push_subscriptions for delete to authenticated using(user_id=(select auth.uid()));
create index push_subscriptions_user on public.push_subscriptions(user_id);
create function private.validate_push_subscription() returns trigger language plpgsql set search_path='' as $$ begin
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then raise exception 'Ongeldige tijdzone';end if;
 if TG_OP='UPDATE' then new.created_at=old.created_at;end if;
 return new;end $$;
revoke all on function private.validate_push_subscription() from public,anon,authenticated;
create trigger validate_push_subscription before insert or update on public.push_subscriptions for each row execute function private.validate_push_subscription();

-- Private durable outbox: lease, retry, deduplication and no task titles.
create table private.push_jobs (
 id uuid primary key default gen_random_uuid(),
 subscription_id uuid not null references public.push_subscriptions on delete cascade,
 event_key text not null, item_id uuid references public.items on delete cascade,
 kind text not null check(kind in ('assignment','completion','reminder','morning')),
 state text not null default 'pending' check(state in ('pending','accepted','discarded')),
 attempts integer not null default 0, retry_at timestamptz not null default now(),
 lease uuid, created_at timestamptz not null default now(),
 unique(subscription_id,event_key)
);
alter table private.push_jobs enable row level security;
revoke all on private.push_jobs from public,anon,authenticated;
create index push_jobs_due on private.push_jobs(retry_at) where state='pending';
create index push_jobs_item on private.push_jobs(item_id);
create function private.push_item_visible(i public.items, recipient uuid) returns boolean language sql stable set search_path='' as $$
 select i.owner_id=recipient or (exists(select 1 from public.household_members m where m.household_id=i.household_id and m.user_id=recipient) and (i.visibility='shared' or (i.visibility='selected' and recipient=any(i.selected_users))))
$$;
revoke all on function private.push_item_visible(public.items,uuid) from public,anon,authenticated;
