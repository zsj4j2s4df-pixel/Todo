-- A small shared budget and per-user limits bound server-key usage. No direct client access.
create table private.ai_budget_lock(id boolean primary key default true check(id));
insert into private.ai_budget_lock values(true);
alter table private.ai_budget_lock enable row level security;
revoke all on private.ai_budget_lock from public,anon,authenticated;
create policy ai_lock_no_client on private.ai_budget_lock for all to anon,authenticated using(false) with check(false);
create table private.ai_usage(user_id uuid not null references auth.users on delete cascade,bucket timestamptz not null,requests integer not null check(requests>0),primary key(user_id,bucket));
alter table private.ai_usage enable row level security;
revoke all on private.ai_usage from public,anon,authenticated;
create policy ai_usage_no_client on private.ai_usage for all to anon,authenticated using(false) with check(false);
create function private.reserve_ai_request() returns boolean language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();hour_start timestamptz:=date_trunc('hour',now());day_start timestamptz:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
begin
 if uid is null then raise exception 'Log eerst in';end if;
 perform id from private.ai_budget_lock for update;
 delete from private.ai_usage where bucket<now()-interval '7 days';
 if coalesce((select sum(requests) from private.ai_usage where user_id=uid and bucket=hour_start),0)>=12
 or coalesce((select sum(requests) from private.ai_usage where user_id=uid and bucket>=day_start),0)>=40
 or coalesce((select sum(requests) from private.ai_usage where bucket>=day_start),0)>=200 then return false;end if;
 insert into private.ai_usage values(uid,hour_start,1) on conflict(user_id,bucket) do update set requests=private.ai_usage.requests+1;
 return true;
end $$;
revoke all on function private.reserve_ai_request() from public,anon,authenticated;
grant execute on function private.reserve_ai_request() to authenticated;
create function public.reserve_ai_request() returns boolean language sql security invoker set search_path='' as $$select private.reserve_ai_request()$$;
revoke all on function public.reserve_ai_request() from public,anon,authenticated;
grant execute on function public.reserve_ai_request() to authenticated;
-- Invoker query: RLS is active even for the aggregate over the complete visible dataset.
create function public.ai_summary() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('total',count(*),'open_tasks',count(*) filter(where kind='task' and status='open'),'events',count(*) filter(where kind='event' and status='open'),'reminders',count(*) filter(where kind='reminder' and status='open'),'done',count(*) filter(where status='done')) from public.items
$$;
revoke all on function public.ai_summary() from public,anon,authenticated;
grant execute on function public.ai_summary() to authenticated;

-- Version check and action occur under the same row lock, preventing stale AI writes.
create function private.complete_item_if_current(item_id uuid,done boolean,expected_updated_at timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare i public.items;
begin
 select * into i from public.items where id=item_id for update;
 if i.id is null or not private.can_read_item(i) then raise exception 'Geen toegang';end if;
 if i.updated_at<>expected_updated_at then raise exception 'Item is gewijzigd. Vraag een nieuw voorstel.';end if;
 perform private.complete_item(item_id,done);
end $$;
revoke all on function private.complete_item_if_current(uuid,boolean,timestamptz) from public,anon,authenticated;
grant execute on function private.complete_item_if_current(uuid,boolean,timestamptz) to authenticated;
create function public.complete_item_if_current(item_id uuid,done boolean,expected_updated_at timestamptz) returns void language sql security invoker set search_path='' as $$select private.complete_item_if_current(item_id,done,expected_updated_at)$$;
revoke all on function public.complete_item_if_current(uuid,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.complete_item_if_current(uuid,boolean,timestamptz) to authenticated;

-- Literal parameterized full-item search; no client-supplied SQL or PostgREST filter expressions.
create function public.ai_search(query_text text,filter_kind text,filter_status text,row_offset integer) returns jsonb language sql stable security invoker set search_path='' as $$
 with matches as (
  select * from public.items i where (filter_kind='all' or i.kind=filter_kind) and (filter_status='all' or i.status=filter_status)
  and (coalesce(query_text,'')='' or position(lower(left(query_text,120)) in lower(concat_ws(' ',i.title,i.description,i.category,i.location,i.checklist::text)))>0)
 ), page as (select id,kind,title,left(description,600) as description,status,priority,category,due_at,end_at,timezone,location,visibility,checklist,updated_at,created_at from matches order by created_at desc,id limit 30 offset greatest(0,least(coalesce(row_offset,0),10000)))
 select jsonb_build_object('total',(select count(*) from matches),'items',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb))
$$;
revoke all on function public.ai_search(text,text,text,integer) from public,anon,authenticated;
grant execute on function public.ai_search(text,text,text,integer) to authenticated;
