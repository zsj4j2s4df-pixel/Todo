create table public.integrations(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users on delete cascade,
 provider text not null check(provider in ('google_calendar','gmail','outlook_calendar','icloud_calendar')),
 account_label text not null default '' check(length(account_label)<=200),enabled boolean not null default true,
 calendar_ids text[] not null default '{}',calendar_names jsonb not null default '{}',write_calendar_ids text[] not null default '{}',write_enabled boolean not null default false,
 status text not null default 'connected' check(status in ('connected','reauth','error','disconnected')),
 error_code text check(error_code in ('authorization','network','limit','configuration','conflict','unsupported')),
 last_sync timestamptz,created_at timestamptz not null default now()
);
create unique index integrations_active_account on public.integrations(user_id,provider,lower(account_label)) where enabled;
alter table public.inbox_notes add column integration_id uuid references public.integrations on delete set null;
alter policy note_insert on public.inbox_notes with check(user_id=(select auth.uid()) and state='inbox' and converted_item_id is null and integration_id is null);
create index inbox_notes_integration on public.inbox_notes(integration_id) where integration_id is not null;
create index integrations_owner on public.integrations(user_id);
alter table public.integrations enable row level security;
revoke all on public.integrations from public,anon,authenticated;
grant select on public.integrations to authenticated;
grant all on public.integrations to service_role;
create policy integrations_read on public.integrations for select to authenticated using(user_id=(select auth.uid()));
create table private.integration_secrets(connection_id uuid primary key references public.integrations on delete cascade,vault_id uuid,lease uuid,lease_until timestamptz,next_sync timestamptz not null default now());
alter table private.integration_secrets enable row level security;
revoke all on private.integration_secrets from public,anon,authenticated;
create policy integration_secrets_no_client on private.integration_secrets for all to anon,authenticated using(false) with check(false);
create table private.integration_cache(connection_id uuid primary key references public.integrations on delete cascade,window_start timestamptz not null,window_end timestamptz not null,states jsonb not null check(jsonb_typeof(states)='array' and length(states::text)<=12000000));
alter table private.integration_cache enable row level security;
revoke all on private.integration_cache from public,anon,authenticated;
create policy integration_cache_no_client on private.integration_cache for all to anon,authenticated using(false) with check(false);
create function private.integration_cache(owner_id uuid,cid uuid,window_start timestamptz,window_end timestamptz) returns jsonb language sql stable security definer set search_path='' as $$
 select x.states from private.integration_cache x join public.integrations c on c.id=x.connection_id where c.id=$2 and c.user_id=$1 and c.enabled and x.window_start=$3 and x.window_end=$4
$$;
create table private.integration_oauth(state_hash text primary key,user_id uuid not null references auth.users on delete cascade,provider text not null,vault_id uuid not null,created_at timestamptz not null default now(),consumed_at timestamptz);
alter table private.integration_oauth enable row level security;
revoke all on private.integration_oauth from public,anon,authenticated;
create policy integration_oauth_no_client on private.integration_oauth for all to anon,authenticated using(false) with check(false);
create index integration_oauth_user on private.integration_oauth(user_id,created_at);

alter table public.items add column integration_id uuid references public.integrations on delete set null,
 add column source_calendar_id text,add column source_event_id text,add column source_version text,
 add column source_hidden boolean not null default false,add column source_deleted boolean not null default false;
create unique index items_provider_identity on public.items(integration_id,source_calendar_id,source_event_id) where integration_id is not null;
-- External mirrors can be modified only through the owning connector, never direct SQL/API.
alter policy item_insert on public.items with check(owner_id=(select auth.uid()) and integration_id is null and (household_id is null or private.is_member(household_id)));
alter policy item_update on public.items using(owner_id=(select auth.uid()) and integration_id is null) with check(owner_id=(select auth.uid()) and integration_id is null and (household_id is null or private.is_member(household_id)));
create table private.integration_resources(item_id uuid primary key references public.items on delete cascade,resource jsonb not null);
alter table private.integration_resources enable row level security;
revoke all on private.integration_resources from public,anon,authenticated;
create policy integration_resources_no_client on private.integration_resources for all to anon,authenticated using(false) with check(false);

create function private.integration_oauth_state(owner_id uuid,provider_name text,state_digest text,details jsonb) returns void language plpgsql security definer set search_path='' as $$
declare secret_id uuid;old_state record;
begin
 if provider_name not in ('google_calendar','gmail','outlook_calendar') or state_digest !~ '^[0-9a-f]{64}$' or owner_id is null or length(details::text)>4000 then raise exception 'Invalid OAuth request';end if;
 for old_state in delete from private.integration_oauth where created_at<now()-interval '1 day' returning vault_id loop delete from vault.secrets where id=old_state.vault_id;end loop;
 if (select count(*) from private.integration_oauth where user_id=owner_id and created_at>now()-interval '1 hour')>=10 then raise exception 'Too many connection attempts';end if;
 secret_id=vault.create_secret(details::text,'todo-oauth-'||state_digest);
 insert into private.integration_oauth(state_hash,user_id,provider,vault_id) values(state_digest,owner_id,provider_name,secret_id);
end $$;
create function private.integration_take_oauth(owner_id uuid,provider_name text,state_digest text) returns jsonb language plpgsql security definer set search_path='' as $$
declare attempt private.integration_oauth;details jsonb;
begin
 select * into attempt from private.integration_oauth where state_hash=state_digest and user_id=owner_id and provider=provider_name and consumed_at is null and created_at>now()-interval '10 minutes' for update;
 if attempt.state_hash is null then raise exception 'Authorization expired or invalid';end if;
 select decrypted_secret::jsonb into details from vault.decrypted_secrets where id=attempt.vault_id;
 delete from vault.secrets where id=attempt.vault_id;
 update private.integration_oauth set consumed_at=now() where state_hash=state_digest;
 return details;
end $$;
create function private.integration_connect(owner_id uuid,provider_name text,label text,credentials jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare cid uuid;vid uuid;
begin
 if owner_id is null or provider_name not in ('google_calendar','gmail','outlook_calendar','icloud_calendar') or length(credentials::text)>50000 then raise exception 'Invalid connection';end if;
 select id into cid from public.integrations where user_id=owner_id and provider=provider_name and lower(account_label)=lower(label) and enabled for update;
 if cid is not null then perform private.integration_reconnect(owner_id,cid,label,credentials,false);return cid;end if;
 if (select count(*) from public.integrations where user_id=owner_id and enabled)>=12 then raise exception 'Maximaal 12 verbindingen per account';end if;
 insert into public.integrations(user_id,provider,account_label) values(owner_id,provider_name,left(label,200)) returning id into cid;
 vid=vault.create_secret(credentials::text,'todo-connector-'||cid);
 insert into private.integration_secrets(connection_id,vault_id) values(cid,vid);
 return cid;
end $$;
create table private.integration_usage(user_id uuid not null references auth.users on delete cascade,bucket timestamptz not null,requests integer not null,primary key(user_id,bucket));
alter table private.integration_usage enable row level security;
revoke all on private.integration_usage from public,anon,authenticated;
create policy integration_usage_no_client on private.integration_usage for all to anon,authenticated using(false) with check(false);
create function private.integration_gate(owner_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 delete from private.integration_usage where bucket<now()-interval '2 days';
 insert into private.integration_usage values(owner_id,date_trunc('hour',now()),1) on conflict(user_id,bucket) do update set requests=private.integration_usage.requests+1 returning requests into n;
 return n<=240;
end $$;
create function private.integration_claim(owner_id uuid,cid uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.integrations;s private.integration_secrets;cred jsonb;new_lease uuid:=gen_random_uuid();
begin
 if not private.integration_gate(owner_id) then raise exception 'Verbindingslimiet bereikt. Probeer later opnieuw.';end if;
 select * into c from public.integrations where id=cid and user_id=owner_id and enabled for update;
 if c.id is null then raise exception 'Verbinding niet beschikbaar';end if;
 select * into s from private.integration_secrets where connection_id=cid for update;
 if s.lease_until>now() then raise exception 'Verbinding is bezig. Probeer later opnieuw.';end if;
 select decrypted_secret::jsonb into cred from vault.decrypted_secrets where id=s.vault_id;
 if cred is null then raise exception 'Verbind dit account opnieuw';end if;
 update private.integration_secrets set lease=new_lease,lease_until=now()+interval '3 minutes' where connection_id=cid;
 return jsonb_build_object('connection',to_jsonb(c),'lease',new_lease,'credentials',cred);
end $$;
create function private.integration_finish(owner_id uuid,cid uuid,claim_lease uuid,credentials jsonb,result_status text,result_error text) returns void language plpgsql security definer set search_path='' as $$
declare s private.integration_secrets;
begin
 perform id from public.integrations where id=cid and user_id=owner_id and enabled for update;
 if not found then return;end if;
 select * into s from private.integration_secrets where connection_id=cid and lease=claim_lease for update;
 if s.connection_id is null then raise exception 'Verbinding is gewijzigd';end if;
 if credentials is not null then perform vault.update_secret(s.vault_id,credentials::text);end if;
 update public.integrations set status=result_status,error_code=result_error where id=cid;
 update private.integration_secrets set lease=null,lease_until=null,next_sync=now()+case when result_error is null then interval '15 minutes' else interval '1 hour' end where connection_id=cid;
end $$;
create function private.integration_select(owner_id uuid,cid uuid,calendars text[],allow_write boolean,write_ids text[] default '{}',names jsonb default '{}') returns void language plpgsql security definer set search_path='' as $$
begin
 if cardinality(calendars)>20 or exists(select 1 from unnest(calendars) x where length(x)>1000) then raise exception 'Kies maximaal 20 agenda’s';end if;
 perform id from public.integrations where id=cid and user_id=owner_id and enabled for update;
 if not found then raise exception 'Geen toegang';end if;
 if exists(select 1 from private.integration_secrets where connection_id=cid and lease_until>now()) then raise exception 'Wacht tot de huidige synchronisatie klaar is';end if;
 delete from private.integration_cache where connection_id=cid;
 update public.integrations set calendar_ids=calendars,calendar_names=names,write_enabled=allow_write,write_calendar_ids=case when allow_write then write_ids else '{}' end where id=cid;
 update private.integration_secrets set next_sync=now() where connection_id=cid;
 -- Removed calendars stop appearing; their mirrors remain recoverable.
 update public.items set source_deleted=true,deleted_at=coalesce(deleted_at,now()) where integration_id=cid and not(source_calendar_id=any(calendars));
end $$;
create function private.integration_disconnect(owner_id uuid,cid uuid,remove_mirrors boolean) returns void language plpgsql security definer set search_path='' as $$
declare vid uuid;
begin
 perform id from public.integrations where id=cid and user_id=owner_id for update;
 if not found then raise exception 'Geen toegang';end if;
 delete from private.integration_cache where connection_id=cid;
 update public.integrations set enabled=false,status='disconnected',write_enabled=false,write_calendar_ids='{}' where id=cid;
 delete from private.integration_secrets where connection_id=cid returning vault_id into vid;
 delete from vault.secrets where id=vid;
 delete from private.integration_resources where item_id in(select id from public.items where integration_id=cid);
 if remove_mirrors then update public.inbox_notes set state='trash' where user_id=owner_id and integration_id=cid;
 update public.items set deleted_at=coalesce(deleted_at,now()),source_deleted=true where integration_id=cid;
 else update public.items set integration_id=null,source_event_id=null,source_calendar_id=null,source_version=null,source_hidden=false,source_deleted=false where integration_id=cid;end if;
end $$;
create function private.integration_sync(owner_id uuid,cid uuid,claim_lease uuid,events jsonb,window_start timestamptz,window_end timestamptz,replace_snapshot boolean default true,sync_state jsonb default null) returns integer language plpgsql security definer set search_path='' as $$
declare c public.integrations;e jsonb;v public.items;synced_id uuid;seen uuid[]:='{}';
begin
 select * into c from public.integrations where id=cid and user_id=owner_id and enabled for update;
 if c.id is null or not exists(select 1 from private.integration_secrets where connection_id=cid and lease=claim_lease and lease_until>now()) then raise exception 'Verbinding is gewijzigd';end if;
 if jsonb_typeof(events)<>'array' or jsonb_array_length(events)>1000 or window_end<=window_start or window_end-window_start>interval '370 days' then raise exception 'Ongeldig syncvenster';end if;
 for e in select value from jsonb_array_elements(events) loop
  if e->>'calendar_id' is null or e->>'event_id' is null or not((e->>'calendar_id')=any(c.calendar_ids)) or length(e->>'event_id')>2000 then raise exception 'Onbekende agenda';end if;
  v=jsonb_populate_record(null::public.items,e->'item');
  insert into public.items(id,owner_id,kind,title,description,status,priority,category,due_at,end_at,timezone,location,visibility,assignees,selected_users,checklist,busy,event_type,all_day,start_date,end_date,integration_id,source_calendar_id,source_event_id,source_version)
  values(gen_random_uuid(),owner_id,'event',v.title,coalesce(v.description,''),'open','normal','',v.due_at,v.end_at,coalesce(v.timezone,'UTC'),coalesce(v.location,''),'private','{}','{}','[]',coalesce(v.busy,true),'standard',coalesce(v.all_day,false),v.start_date,v.end_date,cid,e->>'calendar_id',e->>'event_id',e->>'version')
  on conflict(integration_id,source_calendar_id,source_event_id) where integration_id is not null do update set title=excluded.title,description=excluded.description,due_at=excluded.due_at,end_at=excluded.end_at,timezone=excluded.timezone,location=excluded.location,busy=excluded.busy,all_day=excluded.all_day,start_date=excluded.start_date,end_date=excluded.end_date,source_version=excluded.source_version,source_deleted=false,deleted_at=case when public.items.source_hidden then public.items.deleted_at else null end
  returning id into synced_id;
  seen=array_append(seen,synced_id);
  insert into private.integration_resources values(synced_id,coalesce(e->'resource','{}')) on conflict(item_id) do update set resource=excluded.resource;
 end loop;
 if replace_snapshot then update public.items set source_deleted=true,deleted_at=coalesce(deleted_at,now()) where integration_id=cid and source_calendar_id=any(c.calendar_ids) and not(id=any(seen)) and due_at<window_end and coalesce(end_at,due_at)>=window_start;end if;
 if sync_state is not null then
  if c.provider<>'google_calendar' or not replace_snapshot or jsonb_typeof(sync_state)<>'array' or jsonb_array_length(sync_state)>20 or length(sync_state::text)>12000000 then raise exception 'Ongeldige synchronisatiestatus';end if;
  insert into private.integration_cache values(cid,window_start,window_end,sync_state) on conflict(connection_id) do update set window_start=excluded.window_start,window_end=excluded.window_end,states=excluded.states;
 else delete from private.integration_cache where connection_id=cid;end if;
 update public.integrations set last_sync=now(),status='connected',error_code=null where id=cid;
 return cardinality(seen);
end $$;
create function private.integration_due() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select i.id,i.user_id from public.integrations i join private.integration_secrets s on s.connection_id=i.id where i.enabled and i.provider<>'gmail' and cardinality(i.calendar_ids)>0 and s.next_sync<=now() and coalesce(s.lease_until,'-infinity')<now() order by s.next_sync limit 2) x
$$;
create function private.integration_reconnect(owner_id uuid,cid uuid,label text,credentials jsonb,allow_write boolean) returns void language plpgsql security definer set search_path='' as $$
declare c public.integrations;vid uuid;
begin
 select * into c from public.integrations where id=cid and user_id=owner_id and enabled for update;
 if c.id is null or lower(c.account_label)<>lower(label) then raise exception 'Gebruik hetzelfde provideraccount om opnieuw te verbinden';end if;
 select vault_id into vid from private.integration_secrets where connection_id=cid;
 if vid is null then raise exception 'Verbinding is ontkoppeld';end if;
 delete from private.integration_cache where connection_id=cid;
 perform vault.update_secret(vid,credentials::text);
 update private.integration_secrets set lease=null,lease_until=null,next_sync=now() where connection_id=cid;
 update public.integrations set status='connected',error_code=null,write_enabled=false,write_calendar_ids='{}' where id=cid;
end $$;
create function private.integration_resource(owner_id uuid,cid uuid,item_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select r.resource from private.integration_resources r join public.items i on i.id=r.item_id join public.integrations c on c.id=i.integration_id where i.id=$3 and i.owner_id=$1 and c.user_id=$1 and c.id=$2 and c.enabled
$$;
create function private.integration_deleted_event(owner_id uuid,cid uuid,claim_lease uuid,item_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform id from public.integrations where id=cid and user_id=owner_id and enabled for update;
 if not found or not exists(select 1 from private.integration_secrets where connection_id=cid and lease=claim_lease and lease_until>now()) then raise exception 'Verbinding is gewijzigd';end if;
 update public.items set source_deleted=true,deleted_at=coalesce(deleted_at,now()) where id=item_id and public.items.owner_id=integration_deleted_event.owner_id and integration_id=cid;
end $$;
-- Only server credentials can call these helpers. Nothing returns provider secrets to an authenticated client.
do $$declare signature text;name text;begin
 for signature,name in select p.oid::regprocedure::text,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like 'integration_%' loop
  execute 'revoke all on function '||signature||' from public,anon,authenticated';
  execute 'grant execute on function '||signature||' to service_role';
 end loop;
end $$;
create function public.integration_oauth_state(owner_id uuid,provider_name text,state_digest text,details jsonb) returns void language sql security invoker set search_path='' as $$select private.integration_oauth_state(owner_id,provider_name,state_digest,details)$$;
create function public.integration_take_oauth(owner_id uuid,provider_name text,state_digest text) returns jsonb language sql security invoker set search_path='' as $$select private.integration_take_oauth(owner_id,provider_name,state_digest)$$;
create function public.integration_connect(owner_id uuid,provider_name text,label text,credentials jsonb) returns uuid language sql security invoker set search_path='' as $$select private.integration_connect(owner_id,provider_name,label,credentials)$$;
create function public.integration_claim(owner_id uuid,cid uuid) returns jsonb language sql security invoker set search_path='' as $$select private.integration_claim(owner_id,cid)$$;
create function public.integration_finish(owner_id uuid,cid uuid,claim_lease uuid,credentials jsonb,result_status text,result_error text) returns void language sql security invoker set search_path='' as $$select private.integration_finish(owner_id,cid,claim_lease,credentials,result_status,result_error)$$;
create function public.integration_select(owner_id uuid,cid uuid,calendars text[],allow_write boolean,write_ids text[] default '{}',names jsonb default '{}') returns void language sql security invoker set search_path='' as $$select private.integration_select(owner_id,cid,calendars,allow_write,write_ids,names)$$;
create function public.integration_disconnect(owner_id uuid,cid uuid,remove_mirrors boolean) returns void language sql security invoker set search_path='' as $$select private.integration_disconnect(owner_id,cid,remove_mirrors)$$;
create function public.integration_sync(owner_id uuid,cid uuid,claim_lease uuid,events jsonb,window_start timestamptz,window_end timestamptz,replace_snapshot boolean default true,sync_state jsonb default null) returns integer language sql security invoker set search_path='' as $$select private.integration_sync(owner_id,cid,claim_lease,events,window_start,window_end,replace_snapshot,sync_state)$$;
create function public.integration_cache(owner_id uuid,cid uuid,window_start timestamptz,window_end timestamptz) returns jsonb language sql stable security invoker set search_path='' as $$select private.integration_cache(owner_id,cid,window_start,window_end)$$;
create function public.integration_due() returns jsonb language sql stable security invoker set search_path='' as $$select private.integration_due()$$;
create function public.integration_reconnect(owner_id uuid,cid uuid,label text,credentials jsonb,allow_write boolean) returns void language sql security invoker set search_path='' as $$select private.integration_reconnect(owner_id,cid,label,credentials,allow_write)$$;
create function public.integration_resource(owner_id uuid,cid uuid,item_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.integration_resource(owner_id,cid,item_id)$$;
create function public.integration_deleted_event(owner_id uuid,cid uuid,claim_lease uuid,item_id uuid) returns void language sql security invoker set search_path='' as $$select private.integration_deleted_event(owner_id,cid,claim_lease,item_id)$$;
create function public.integration_gate(owner_id uuid) returns boolean language sql security invoker set search_path='' as $$select private.integration_gate(owner_id)$$;
do $$declare signature text;begin
 for signature in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'integration_%' loop
  execute 'revoke all on function '||signature||' from public,anon,authenticated';execute 'grant execute on function '||signature||' to service_role';
 end loop;
end $$;

create or replace function private.complete_item(item_id uuid,done boolean) returns void language plpgsql security definer set search_path='' as $$
declare i public.items;n integer;next_due timestamptz;
begin
 select * into i from public.items where id=item_id for update;
 if i.id is null or not private.can_read_item(i) then raise exception 'Geen toegang';end if;
 if auth.uid()<>i.owner_id and not(auth.uid()=any(i.assignees)) then raise exception 'Alleen eigenaar of toegewezen persoon kan afronden';end if;
 if i.integration_id is not null or i.schedule_kind<>'none' then raise exception 'Wijzig deze afspraak via de bronagenda';end if;
 if (i.status='done')=done then return;end if;
 update public.items set status=case when done then 'done' else 'open' end where id=item_id;
 if done and i.repeat_kind<>'none' and not exists(select 1 from public.items where repeat_source=i.id) then
  select occurrence,due_at into n,next_due from private.next_repeat(i,now());
  insert into public.items(id,owner_id,household_id,kind,title,description,checklist,status,priority,category,due_at,end_at,timezone,location,visibility,assignees,selected_users,repeat_kind,repeat_anchor,repeat_index,repeat_source)
  values(gen_random_uuid(),i.owner_id,i.household_id,i.kind,i.title,i.description,coalesce((select jsonb_agg(step||'{"done":false}'::jsonb) from jsonb_array_elements(i.checklist) step),'[]'::jsonb),'open',i.priority,i.category,next_due,case when i.end_at is null then null else next_due+make_interval(secs=>extract(epoch from (i.end_at-i.due_at))) end,i.timezone,i.location,i.visibility,i.assignees,i.selected_users,i.repeat_kind,i.repeat_anchor,n,i.id)
  on conflict(repeat_source) do nothing;
 end if;
end $$;

create or replace function private.trash_item(item_id uuid,expected_updated_at timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare i public.items;
begin
 select * into i from public.items where id=item_id for update;
 if auth.uid() is null or i.id is null or i.owner_id<>auth.uid() then raise exception 'Geen toegang';end if;
 if i.deleted_at is not null then return;end if;
 if i.updated_at<>expected_updated_at then raise exception 'Item is gewijzigd. Open het opnieuw.';end if;
 update public.items set deleted_at=now(),source_hidden=(integration_id is not null) where id=i.id;
end $$;
create or replace function private.restore_item(item_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Log eerst in';end if;
 -- Restore privately: never silently regrant a previous share or assignment.
 update public.items set deleted_at=null,source_hidden=false,visibility='private',selected_users='{}',assignees='{}' where id=item_id and owner_id=auth.uid() and deleted_at is not null and not source_deleted;
 if not found then raise exception 'Item is niet beschikbaar of is verwijderd in de bronagenda';end if;
end $$;
create or replace function private.purge_item(item_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Log eerst in';end if;
 delete from public.items where id=item_id and owner_id=auth.uid() and deleted_at is not null and (integration_id is null or source_deleted);
 if not found then raise exception 'Item niet beschikbaar in je prullenbak';end if;
end $$;

create function private.cleanup_connector_secret() returns trigger language plpgsql security definer set search_path='' as $$begin delete from vault.secrets where id=old.vault_id;return old;end$$;
revoke all on function private.cleanup_connector_secret() from public,anon,authenticated;
create trigger cleanup_connector_secret before delete on private.integration_secrets for each row execute function private.cleanup_connector_secret();
create trigger cleanup_connector_oauth before delete on private.integration_oauth for each row execute function private.cleanup_connector_secret();
