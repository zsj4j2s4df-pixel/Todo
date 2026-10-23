-- No recordings, transcripts or API credentials are stored in this session registry.
create table private.realtime_sessions (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users on delete cascade,
 call_id text unique check(call_id ~ '^[A-Za-z0-9_-]{8,180}$'),
 state text not null default 'pending' check(state in ('pending','active','closed')),
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '2 minutes',
 cleanup_after timestamptz not null default now()+interval '2 minutes',tool_calls integer not null default 0,
 cleanup_attempts integer not null default 0
);
alter table private.realtime_sessions enable row level security;
revoke all on private.realtime_sessions from public,anon,authenticated;
create policy realtime_no_client_table_access on private.realtime_sessions for all to anon,authenticated using(false) with check(false);
create index realtime_sessions_user on private.realtime_sessions(user_id,created_at);
create index realtime_sessions_cleanup on private.realtime_sessions(cleanup_after) where state<>'closed';
create function private.reserve_realtime_session() returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();sid uuid;day_start timestamptz:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
begin
 if uid is null then raise exception 'Log eerst in';end if;
 perform id from private.ai_budget_lock for update;
 delete from private.realtime_sessions where state='closed' and created_at<now()-interval '7 days';
 if exists(select 1 from private.realtime_sessions where user_id=uid and state<>'closed' and expires_at>now()) then raise exception 'Er is al een livegesprek actief';end if;
 if (select count(*) from private.realtime_sessions where user_id=uid and created_at>=day_start)>=6 or (select count(*) from private.realtime_sessions where created_at>=day_start)>=20 then raise exception 'De daglimiet voor livegesprekken is bereikt';end if;
 insert into private.realtime_sessions(user_id) values(uid) returning id into sid;return sid;
end $$;
create function private.reserve_realtime_tool(session_id uuid) returns boolean language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null then return false;end if;
 update private.realtime_sessions set tool_calls=tool_calls+1 where id=session_id and user_id=auth.uid() and state='active' and expires_at>now() and tool_calls<12;
 return found;
end $$;
create function private.request_realtime_stop(session_id uuid) returns text language plpgsql security definer set search_path='' as $$
declare cid text;
begin
 if auth.uid() is null then raise exception 'Log eerst in';end if;
 select call_id into cid from private.realtime_sessions where id=session_id and user_id=auth.uid() for update;
 if not found then raise exception 'Geen toegang';end if;
 update private.realtime_sessions set expires_at=least(expires_at,now()),cleanup_after=now(),state=case when call_id is null then 'closed' else state end where id=session_id;
 return cid;
end $$;
-- Only the server, after creating the provider call, may attach its opaque id.
create function private.attach_realtime_call(session_id uuid,owner_id uuid,provider_call_id text) returns boolean language plpgsql security definer set search_path='' as $$
declare can_connect boolean;
begin
 select state='pending' and expires_at>now() into can_connect from private.realtime_sessions where id=session_id and user_id=owner_id and call_id is null for update;
 if not found then return false;end if;
 -- Retain even a late call id so failed hangup can be retried by Cron.
 update private.realtime_sessions set call_id=provider_call_id,state='active',cleanup_after=least(cleanup_after,expires_at) where id=session_id;
 return can_connect;
end $$;
create function private.finish_realtime_call(session_id uuid,provider_call_id text) returns void language sql security definer set search_path='' as $$
 update private.realtime_sessions set state='closed' where id=session_id and (call_id=provider_call_id or (call_id is null and provider_call_id is null))
$$;
create function private.claim_realtime_cleanup(dispatch_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare expected text;result jsonb;
begin
 select decrypted_secret into expected from vault.decrypted_secrets where name='todo_push_dispatch_key';
 if expected is null or dispatch_key is null or length(dispatch_key)<32 or dispatch_key<>expected then raise exception 'Unauthorized';end if;
 update private.realtime_sessions set state='closed' where state='pending' and expires_at<=now();
 with due as (select id from private.realtime_sessions where state='active' and cleanup_after<=now() and expires_at<=now() order by cleanup_after limit 20 for update skip locked),
 claimed as (update private.realtime_sessions s set cleanup_after=now()+interval '1 minute',cleanup_attempts=cleanup_attempts+1 from due where s.id=due.id returning s.id,s.call_id)
 select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into result from claimed;return result;
end $$;
revoke all on function private.reserve_realtime_session(),private.reserve_realtime_tool(uuid),private.request_realtime_stop(uuid),private.attach_realtime_call(uuid,uuid,text),private.finish_realtime_call(uuid,text),private.claim_realtime_cleanup(text) from public,anon,authenticated;
grant execute on function private.reserve_realtime_session(),private.reserve_realtime_tool(uuid),private.request_realtime_stop(uuid) to authenticated;
grant execute on function private.attach_realtime_call(uuid,uuid,text),private.finish_realtime_call(uuid,text),private.claim_realtime_cleanup(text) to service_role;
create function public.reserve_realtime_session() returns uuid language sql security invoker set search_path='' as $$select private.reserve_realtime_session()$$;
create function public.reserve_realtime_tool(session_id uuid) returns boolean language sql security invoker set search_path='' as $$select private.reserve_realtime_tool(session_id)$$;
create function public.request_realtime_stop(session_id uuid) returns text language sql security invoker set search_path='' as $$select private.request_realtime_stop(session_id)$$;
create function public.attach_realtime_call(session_id uuid,owner_id uuid,provider_call_id text) returns boolean language sql security invoker set search_path='' as $$select private.attach_realtime_call(session_id,owner_id,provider_call_id)$$;
create function public.finish_realtime_call(session_id uuid,provider_call_id text) returns void language sql security invoker set search_path='' as $$select private.finish_realtime_call(session_id,provider_call_id)$$;
create function public.claim_realtime_cleanup(dispatch_key text) returns jsonb language sql security invoker set search_path='' as $$select private.claim_realtime_cleanup(dispatch_key)$$;
revoke all on function public.reserve_realtime_session(),public.reserve_realtime_tool(uuid),public.request_realtime_stop(uuid),public.attach_realtime_call(uuid,uuid,text),public.finish_realtime_call(uuid,text),public.claim_realtime_cleanup(text) from public,anon,authenticated;
grant execute on function public.reserve_realtime_session(),public.reserve_realtime_tool(uuid),public.request_realtime_stop(uuid) to authenticated;
grant execute on function public.attach_realtime_call(uuid,uuid,text),public.finish_realtime_call(uuid,text),public.claim_realtime_cleanup(text) to service_role;
