-- One next task/reminder is materialized on completion; no hidden infinite agenda expansion.
alter table public.items add column repeat_kind text not null default 'none' check(repeat_kind in ('none','daily','weekly','monthly')),
 add column repeat_anchor timestamptz,add column repeat_index integer not null default 0 check(repeat_index between 0 and 1000000),
 add column repeat_source uuid unique references public.items(id) on delete set null,
 add constraint repeat_requires_date check(repeat_kind='none' or (kind<>'event' and due_at is not null and repeat_anchor is not null));
create function private.repeat_at(anchor timestamptz,zone text,frequency text,occurrence integer) returns timestamptz language sql stable set search_path='' as $$
 select ((anchor at time zone zone) + case frequency when 'daily' then make_interval(days=>occurrence) when 'weekly' then make_interval(days=>occurrence*7) when 'monthly' then make_interval(months=>occurrence) else interval '0' end) at time zone zone
$$;
create function private.next_repeat(i public.items,after_time timestamptz) returns table(occurrence integer,due_at timestamptz) language plpgsql stable set search_path='' as $$
declare root timestamp:=coalesce(i.repeat_anchor,i.due_at) at time zone i.timezone;local_now timestamp:=after_time at time zone i.timezone;n integer;candidate timestamptz;
begin
 if i.repeat_kind='none' then return;end if;
 n:=greatest(i.repeat_index+1,case i.repeat_kind when 'monthly' then (extract(year from local_now)::int-extract(year from root)::int)*12+extract(month from local_now)::int-extract(month from root)::int when 'weekly' then (local_now::date-root::date)/7 else local_now::date-root::date end,1);
 if n>1000000 then raise exception 'Herhalingslimiet bereikt. Kies een nieuwe begindatum.';end if;
 candidate:=private.repeat_at(coalesce(i.repeat_anchor,i.due_at),i.timezone,i.repeat_kind,n);
 while candidate<=after_time loop n:=n+1;candidate:=private.repeat_at(coalesce(i.repeat_anchor,i.due_at),i.timezone,i.repeat_kind,n);end loop;
 return query select n,candidate;
end $$;
create function private.validate_repeat() returns trigger language plpgsql security definer set search_path='' as $$
declare parent public.items;
begin
 if TG_OP='UPDATE' and new.repeat_source is distinct from old.repeat_source and (new.repeat_source is not null or exists(select 1 from public.items where id=old.repeat_source)) then raise exception 'Herkomst van herhaling kan niet veranderen';end if;
 if TG_OP='INSERT' and new.repeat_source is not null then
  select * into parent from public.items where id=new.repeat_source and owner_id=new.owner_id;
  if parent.id is null or parent.repeat_kind='none' or parent.repeat_kind<>new.repeat_kind then raise exception 'Ongeldige herhaling';end if;
 end if;
 if new.repeat_kind='none' then new.repeat_anchor=null;new.repeat_index=0;return new;end if;
 if new.kind='event' or new.due_at is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then raise exception 'Herhaling vereist een taak/herinnering met geldige datum en tijdzone';end if;
 if TG_OP='INSERT' then
  if new.repeat_source is null then new.repeat_anchor=new.due_at;new.repeat_index=0;
  else
   if parent.id is null or parent.repeat_kind<>new.repeat_kind or new.repeat_index<=parent.repeat_index or new.due_at<>private.repeat_at(coalesce(parent.repeat_anchor,parent.due_at),parent.timezone,parent.repeat_kind,new.repeat_index) or new.timezone<>parent.timezone then raise exception 'Ongeldige herhaling';end if;
   new.repeat_anchor=coalesce(parent.repeat_anchor,parent.due_at);
  end if;
 elsif new.due_at is distinct from old.due_at or new.repeat_kind<>old.repeat_kind or new.timezone<>old.timezone then new.repeat_anchor=new.due_at;new.repeat_index=0;
 else new.repeat_anchor=old.repeat_anchor;new.repeat_index=old.repeat_index;
 end if;
 return new;
end $$;
revoke all on function private.repeat_at(timestamptz,text,text,integer),private.next_repeat(public.items,timestamptz),private.validate_repeat() from public,anon,authenticated;
create trigger validate_repeat before insert or update on public.items for each row execute function private.validate_repeat();
create or replace function private.complete_item(item_id uuid,done boolean) returns void language plpgsql security definer set search_path='' as $$
declare i public.items;n integer;next_due timestamptz;
begin
 select * into i from public.items where id=item_id for update;
 if i.id is null or not private.can_read_item(i) then raise exception 'Geen toegang';end if;
 if auth.uid()<>i.owner_id and not(auth.uid()=any(i.assignees)) then raise exception 'Alleen eigenaar of toegewezen persoon kan afronden';end if;
 if (i.status='done')=done then return;end if;
 update public.items set status=case when done then 'done' else 'open' end where id=item_id;
 if done and i.repeat_kind<>'none' and not exists(select 1 from public.items where repeat_source=i.id) then
  select occurrence,due_at into n,next_due from private.next_repeat(i,now());
  insert into public.items(id,owner_id,household_id,kind,title,description,checklist,status,priority,category,due_at,end_at,timezone,location,visibility,assignees,selected_users,repeat_kind,repeat_anchor,repeat_index,repeat_source)
  values(gen_random_uuid(),i.owner_id,i.household_id,i.kind,i.title,i.description,coalesce((select jsonb_agg(step||'{"done":false}'::jsonb) from jsonb_array_elements(i.checklist) step),'[]'::jsonb),'open',i.priority,i.category,next_due,case when i.end_at is null then null else next_due+make_interval(secs=>extract(epoch from (i.end_at-i.due_at))) end,i.timezone,i.location,i.visibility,i.assignees,i.selected_users,i.repeat_kind,i.repeat_anchor,n,i.id)
  on conflict(repeat_source) do nothing;
 end if;
end $$;
-- Expose recurrence frequency to authorized AI queries, retaining literal search and RLS.
create or replace function public.ai_search(query_text text,filter_kind text,filter_status text,row_offset integer) returns jsonb language sql stable security invoker set search_path='' as $$
 with matches as (
  select * from public.items i where (filter_kind='all' or i.kind=filter_kind) and (filter_status='all' or i.status=filter_status)
  and (coalesce(query_text,'')='' or position(lower(left(query_text,120)) in lower(concat_ws(' ',i.title,i.description,i.category,i.location,i.checklist::text)))>0)
 ), page as (select id,kind,title,left(description,600) as description,status,priority,category,due_at,end_at,timezone,location,visibility,checklist,repeat_kind,updated_at,created_at from matches order by created_at desc,id limit 30 offset greatest(0,least(coalesce(row_offset,0),10000)))
 select jsonb_build_object('total',(select count(*) from matches),'items',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb))
$$;
