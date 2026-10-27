alter table public.items drop constraint items_repeat_kind_check;
alter table public.items add constraint items_repeat_kind_check check(repeat_kind in ('none','hourly','daily','weekly','fortnightly','monthly','yearly'));
alter table public.items add column event_type text not null default 'standard' check(event_type in ('standard','birthday','vacation')),
 add column busy boolean not null default true, add column all_day boolean not null default false,add column start_date date,add column end_date date,
 add column schedule_kind text not null default 'none' check(schedule_kind in ('none','hourly','daily','weekly','fortnightly','monthly','yearly')),
 add column schedule_until date,add column schedule_count integer check(schedule_count between 1 and 1000000),
 add column schedule_exceptions jsonb not null default '[]' check(jsonb_typeof(schedule_exceptions)='array' and jsonb_array_length(schedule_exceptions)<=200);
grant update(busy,event_type,all_day,start_date,end_date,schedule_kind,schedule_until,schedule_count) on public.items to authenticated;
create function private.validate_schedule() returns trigger language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then raise exception 'Kies een geldige tijdzone';end if;
 if new.kind<>'event' and (new.all_day or new.schedule_kind<>'none' or new.event_type<>'standard') then raise exception 'Dit hoort bij een agenda-afspraak';end if;
 if new.kind='event' then
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then raise exception 'Kies een geldige tijdzone';end if;
  if new.all_day then
   if new.start_date is null or new.end_date is null or new.end_date<=new.start_date or new.schedule_kind='hourly' then raise exception 'Kies een geldige hele dag of periode';end if;
   new.due_at=new.start_date::timestamp at time zone new.timezone;
   new.end_at=new.end_date::timestamp at time zone new.timezone;
  else new.start_date=null;new.end_date=null;end if;
 end if;
 if new.schedule_until is not null and new.schedule_count is not null then raise exception 'Kies een einddatum of een aantal herhalingen';end if;
 if new.schedule_until is not null and new.due_at is not null and new.schedule_until<(new.due_at at time zone new.timezone)::date then raise exception 'Einde herhaling ligt voor de begindatum';end if;
 -- Exception writes are restricted to the separately authorized, versioned RPC.
 if TG_OP='INSERT' and new.schedule_exceptions<>'[]'::jsonb then raise exception 'Gebruik de herhalingsactie voor uitzonderingen';end if;
 return new;
end $$;
revoke all on function private.validate_schedule() from public,anon,authenticated;
-- Run before repeat validation; calendar dates become canonical timestamps first.
create trigger a_validate_schedule before insert or update on public.items for each row execute function private.validate_schedule();
create or replace function private.repeat_at(anchor timestamptz,zone text,frequency text,occurrence integer) returns timestamptz language sql stable set search_path='' as $$
 select case when frequency='hourly' then anchor+make_interval(hours=>occurrence) else ((anchor at time zone zone)+case frequency when 'daily' then make_interval(days=>occurrence) when 'weekly' then make_interval(days=>occurrence*7) when 'fortnightly' then make_interval(days=>occurrence*14) when 'monthly' then make_interval(months=>occurrence) when 'yearly' then make_interval(years=>occurrence) else interval '0' end) at time zone zone end
$$;
create or replace function private.next_repeat(i public.items,after_time timestamptz) returns table(occurrence integer,due_at timestamptz) language plpgsql stable set search_path='' as $$
declare root timestamp:=coalesce(i.repeat_anchor,i.due_at) at time zone i.timezone;local_now timestamp:=after_time at time zone i.timezone;n integer;candidate timestamptz;
begin
 if i.repeat_kind='none' then return;end if;
 n:=greatest(i.repeat_index+1,case i.repeat_kind when 'hourly' then floor(extract(epoch from (after_time-coalesce(i.repeat_anchor,i.due_at)))/3600)::int when 'monthly' then (extract(year from local_now)::int-extract(year from root)::int)*12+extract(month from local_now)::int-extract(month from root)::int when 'yearly' then extract(year from local_now)::int-extract(year from root)::int when 'weekly' then (local_now::date-root::date)/7 when 'fortnightly' then (local_now::date-root::date)/14 else local_now::date-root::date end,1);
 if n>1000000 then raise exception 'Herhalingslimiet bereikt. Kies een nieuwe begindatum.';end if;
 candidate:=private.repeat_at(coalesce(i.repeat_anchor,i.due_at),i.timezone,i.repeat_kind,n);
 while candidate<=after_time loop n=n+1;if n>1000000 then raise exception 'Herhalingslimiet bereikt';end if;candidate=private.repeat_at(coalesce(i.repeat_anchor,i.due_at),i.timezone,i.repeat_kind,n);end loop;
 return query select n,candidate;
end $$;
create function private.calendar_exception(item_id uuid,occurrence integer,change jsonb,expected_updated_at timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare i public.items;entries jsonb;candidate public.items;
begin
 select * into i from public.items where id=item_id for update;
 if auth.uid() is null or i.id is null or i.owner_id<>auth.uid() or not private.can_read_item(i) or i.kind<>'event' or i.schedule_kind='none' then raise exception 'Geen toegang tot deze reeks';end if;
 if i.updated_at<>expected_updated_at then raise exception 'Reeks is gewijzigd. Open deze opnieuw.';end if;
 if occurrence is null or occurrence not between 0 and 1000000 or (i.schedule_count is not null and occurrence>=i.schedule_count) then raise exception 'Ongeldig herhalingsmoment';end if;
 if change is not null then
  if jsonb_typeof(change)<>'object' or jsonb_typeof(change->'cancelled') is distinct from 'boolean' then raise exception 'Ongeldige uitzondering';end if;
  if change ? 'patch' then
   if jsonb_typeof(change->'patch')<>'object' or exists(select 1 from jsonb_object_keys(change->'patch') k where k not in ('title','description','location','due_at','end_at','all_day','start_date','end_date','timezone','busy')) then raise exception 'Ongeldige wijziging';end if;
   candidate=jsonb_populate_record(i,change->'patch');
   if candidate.title is null or length(trim(candidate.title)) not between 1 and 200 or length(candidate.description)>5000 or length(candidate.location)>500 or candidate.due_at is null or candidate.end_at<candidate.due_at or not exists(select 1 from pg_catalog.pg_timezone_names where name=candidate.timezone) then raise exception 'Ongeldige afspraak';end if;
   if candidate.all_day and (candidate.start_date is null or candidate.end_date<=candidate.start_date) then raise exception 'Ongeldige hele dag';end if;
  end if;
 end if;
 select coalesce(jsonb_agg(e),'[]') into entries from jsonb_array_elements(i.schedule_exceptions) e where (e->>'index')::int<>occurrence;
 if change is not null then entries=entries||jsonb_build_array(jsonb_build_object('index',occurrence)||change);end if;
 if jsonb_array_length(entries)>200 then raise exception 'Maximaal 200 uitzonderingen per reeks';end if;
 update public.items set schedule_exceptions=entries where id=i.id;
end $$;
create function public.calendar_exception(item_id uuid,occurrence integer,change jsonb,expected_updated_at timestamptz) returns void language sql security invoker set search_path='' as $$select private.calendar_exception(item_id,occurrence,change,expected_updated_at)$$;
revoke all on function private.calendar_exception(uuid,integer,jsonb,timestamptz),public.calendar_exception(uuid,integer,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function private.calendar_exception(uuid,integer,jsonb,timestamptz),public.calendar_exception(uuid,integer,jsonb,timestamptz) to authenticated;

create or replace function private.convert_note(note_id uuid,new_item jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare n public.inbox_notes;v public.items;made uuid;
begin
 select * into n from public.inbox_notes where id=note_id for update;
 if auth.uid() is null or n.id is null or n.user_id<>auth.uid() or n.state='trash' then raise exception 'Geen toegang';end if;
 if n.converted_item_id is not null then return n.converted_item_id;end if;
 new_item=new_item||jsonb_build_object('due_at',nullif(new_item->>'due_at',''),'end_at',nullif(new_item->>'end_at',''),'start_date',nullif(new_item->>'start_date',''),'end_date',nullif(new_item->>'end_date',''),'schedule_until',nullif(new_item->>'schedule_until','')); 
 v=jsonb_populate_record(null::public.items,new_item);
 made=coalesce(v.id,gen_random_uuid());
 insert into public.items(id,owner_id,household_id,kind,title,description,status,priority,category,due_at,end_at,timezone,location,visibility,assignees,selected_users,checklist,busy,event_type,all_day,start_date,end_date,schedule_kind,schedule_until,schedule_count,repeat_kind)
 values(made,auth.uid(),null,v.kind,v.title,coalesce(v.description,''),'open',coalesce(v.priority,'normal'),coalesce(v.category,''),v.due_at,v.end_at,coalesce(v.timezone,'Europe/Amsterdam'),coalesce(v.location,''),'private','{}','{}',coalesce(v.checklist,'[]'),coalesce(v.busy,true),coalesce(v.event_type,'standard'),coalesce(v.all_day,false),v.start_date,v.end_date,coalesce(v.schedule_kind,'none'),v.schedule_until,v.schedule_count,coalesce(v.repeat_kind,'none'));
 update public.inbox_notes set converted_item_id=made,state='converted' where id=n.id;
 return made;
end $$;
