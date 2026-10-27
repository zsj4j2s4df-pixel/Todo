-- Scoped opaque OAuth tokens, deliberately separate from Supabase Data API JWTs.
create table private.mcp_clients(id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 1 and 100),redirect_uris text[] not null check(cardinality(redirect_uris) between 1 and 10),auth_method text not null check(auth_method in ('none','client_secret_post','client_secret_basic')),secret_hash text,created_at timestamptz not null default now());
create table private.mcp_grants(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users on delete cascade,client_id uuid not null references private.mcp_clients on delete cascade,scopes text[] not null,revoked_at timestamptz,expires_at timestamptz not null default now()+interval '90 days',unique(user_id,client_id));
create index mcp_grants_client on private.mcp_grants(client_id);
create table private.mcp_requests(id uuid primary key default gen_random_uuid(),client_id uuid not null references private.mcp_clients on delete cascade,redirect_uri text not null,state text not null,challenge text not null,scopes text[] not null,resource text not null,expires_at timestamptz not null default now()+interval '10 minutes',code_hash text unique,grant_id uuid references private.mcp_grants on delete cascade,consumed_at timestamptz,created_at timestamptz not null default now());
create index mcp_requests_client on private.mcp_requests(client_id);
create index mcp_requests_grant on private.mcp_requests(grant_id);
create table private.mcp_tokens(access_hash text primary key,refresh_hash text unique not null,grant_id uuid not null references private.mcp_grants on delete cascade,scopes text[] not null,audience text not null,expires_at timestamptz not null,refresh_until timestamptz not null);
create index mcp_tokens_grant on private.mcp_tokens(grant_id);
create table private.mcp_proposals(id uuid primary key default gen_random_uuid(),grant_id uuid not null references private.mcp_grants on delete cascade,user_id uuid not null references auth.users on delete cascade,action text not null check(action in ('create','update','complete','delete','note')),payload jsonb not null check(length(payload::text)<=32000),expected_updated_at timestamptz,state text not null default 'pending' check(state in ('pending','processing','done','cancelled','uncertain')),expires_at timestamptz not null default now()+interval '15 minutes',claim_lease uuid,claim_until timestamptz,result jsonb,created_at timestamptz not null default now());
create index mcp_proposals_user on private.mcp_proposals(user_id,created_at desc);
create index mcp_proposals_grant on private.mcp_proposals(grant_id);
create table private.mcp_usage(grant_id uuid not null references private.mcp_grants on delete cascade,bucket timestamptz not null,requests integer not null,primary key(grant_id,bucket));
create table private.mcp_registration_lock(id boolean primary key default true check(id));
insert into private.mcp_registration_lock values(true);
do $$declare name text;begin
 foreach name in array array['mcp_clients','mcp_grants','mcp_requests','mcp_tokens','mcp_proposals','mcp_usage','mcp_registration_lock'] loop
  execute format('alter table private.%I enable row level security',name);
  execute format('revoke all on private.%I from public,anon,authenticated',name);
  execute format('create policy %I on private.%I for all to anon,authenticated using(false) with check(false)',name||'_no_client',name);
 end loop;
end $$;
create function private.mcp_api(operation text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.mcp_clients;r private.mcp_requests;g private.mcp_grants;t private.mcp_tokens;proposal private.mcp_proposals;i public.items;v public.items;
 uid uuid;scopes text[];new_id uuid;out jsonb;n integer;external boolean;cal_id text;claim uuid;
begin
 if p is null or length(p::text)>40000 then raise exception 'invalid_request';end if;
 if operation='register' then
  perform id from private.mcp_registration_lock for update;
  delete from private.mcp_requests where expires_at<now()-interval '1 day';
  delete from private.mcp_proposals where expires_at<now()-interval '1 day';
  delete from private.mcp_usage where bucket<now()-interval '2 days';
  delete from private.mcp_tokens where refresh_until<now();
  if (select count(*) from private.mcp_clients where created_at>now()-interval '1 day')>=1000 then raise exception 'registration_limit';end if;
  insert into private.mcp_clients(name,redirect_uris,auth_method,secret_hash) values(left(p->>'name',100),array(select jsonb_array_elements_text(p->'redirect_uris')),p->>'auth_method',p->>'secret_hash') returning id into new_id;
  return jsonb_build_object('client_id',new_id);
 end if;
 if operation='authorize' then
  select * into c from private.mcp_clients where id=(p->>'client_id')::uuid;
  scopes=array(select jsonb_array_elements_text(p->'scopes'));
  if c.id is null or not((p->>'redirect_uri')=any(c.redirect_uris)) or p->>'resource'<>'https://todo.zsj4j2s4df.workers.dev/mcp' or not(scopes<@array['todo:read','todo:prepare']) or not('todo:read'=any(scopes)) or (p->>'challenge') !~ '^[A-Za-z0-9_-]{43}$' or length(p->>'state') not between 1 and 2000 then raise exception 'invalid_request';end if;
  perform id from private.mcp_registration_lock for update;
  if (select count(*) from private.mcp_requests where created_at>now()-interval '1 hour')>=2000 then raise exception 'authorization_limit';end if;
  delete from private.mcp_requests where expires_at<now()-interval '1 day';
  insert into private.mcp_requests(client_id,redirect_uri,state,challenge,scopes,resource) values(c.id,p->>'redirect_uri',p->>'state',p->>'challenge',scopes,p->>'resource') returning id into new_id;
  return jsonb_build_object('request_id',new_id);
 end if;
 if operation in ('consent_info','consent','deny') then
  uid=(p->>'user_id')::uuid;
  if uid is null then raise exception 'unauthorized';end if;
  select * into r from private.mcp_requests where id=(p->>'request_id')::uuid and expires_at>now() and consumed_at is null and code_hash is null for update;
  if r.id is null then raise exception 'authorization_expired';end if;
  select * into c from private.mcp_clients where id=r.client_id;
  if operation='consent_info' then return jsonb_build_object('id',r.id,'client_id',c.id,'client_name',c.name,'redirect_uri',r.redirect_uri,'scopes',r.scopes);end if;
  if operation='deny' then update private.mcp_requests set consumed_at=now() where id=r.id;return jsonb_build_object('redirect_uri',r.redirect_uri,'state',r.state);end if;
  scopes=array(select jsonb_array_elements_text(p->'scopes'));
  if not(scopes<@r.scopes) or not('todo:read'=any(scopes)) or (p->>'code_hash') !~ '^[0-9a-f]{64}$' then raise exception 'invalid_scope';end if;
  insert into private.mcp_grants(user_id,client_id,scopes) values(uid,c.id,scopes) on conflict(user_id,client_id) do update set scopes=excluded.scopes,revoked_at=null,expires_at=now()+interval '90 days' returning * into g;
  delete from private.mcp_tokens where grant_id=g.id;
  update private.mcp_requests set code_hash=p->>'code_hash',grant_id=g.id,expires_at=now()+interval '5 minutes' where id=r.id;
  return jsonb_build_object('redirect_uri',r.redirect_uri,'state',r.state);
 end if;
 if operation in ('token','refresh') then
  select * into c from private.mcp_clients where id=(p->>'client_id')::uuid;
  if c.id is null or (c.auth_method<>'none' and c.secret_hash is distinct from p->>'secret_hash') then raise exception 'invalid_client';end if;
  if p->>'resource' is not null and p->>'resource'<>'https://todo.zsj4j2s4df.workers.dev/mcp' then raise exception 'invalid_target';end if;
  if operation='token' then
   select * into r from private.mcp_requests where client_id=c.id and code_hash=p->>'code_hash' and expires_at>now() and consumed_at is null for update;
   if r.id is null or r.redirect_uri is distinct from p->>'redirect_uri' or r.challenge is distinct from p->>'verifier_challenge' then raise exception 'invalid_grant';end if;
   select * into g from private.mcp_grants where id=r.grant_id and revoked_at is null and expires_at>now() for share;
   scopes=g.scopes;
   update private.mcp_requests set consumed_at=now() where id=r.id;
  else
   select t0.* into t from private.mcp_tokens t0 join private.mcp_grants g0 on g0.id=t0.grant_id where t0.refresh_hash=p->>'refresh_hash' and g0.client_id=c.id and t0.refresh_until>now() and g0.revoked_at is null and g0.expires_at>now() for update of t0;
   if t.access_hash is null then raise exception 'invalid_grant';end if;
   select * into g from private.mcp_grants where id=t.grant_id for share;
   scopes=t.scopes;
   if p ? 'requested_scopes' and p->'requested_scopes'<>'null'::jsonb then scopes=array(select jsonb_array_elements_text(p->'requested_scopes'));if not(scopes<@t.scopes) or not('todo:read'=any(scopes)) then raise exception 'invalid_scope';end if;end if;
   delete from private.mcp_tokens where access_hash=t.access_hash;
  end if;
  if g.id is null or scopes is null then raise exception 'invalid_grant';end if;
  if (p->>'access_hash') !~ '^[0-9a-f]{64}$' or (p->>'refresh_hash_new') !~ '^[0-9a-f]{64}$' then raise exception 'invalid_request';end if;
  insert into private.mcp_tokens values(p->>'access_hash',p->>'refresh_hash_new',g.id,scopes,'https://todo.zsj4j2s4df.workers.dev/mcp',least(now()+interval '1 hour',g.expires_at),least(now()+interval '30 days',g.expires_at));
  return jsonb_build_object('scope',array_to_string(scopes,' '),'expires_in',greatest(1,least(3600,floor(extract(epoch from (g.expires_at-now())))::int)));
 end if;
 if operation='revoke_token' then
  select * into c from private.mcp_clients where id=(p->>'client_id')::uuid;
  if c.id is null or (c.auth_method<>'none' and c.secret_hash is distinct from p->>'secret_hash') then raise exception 'invalid_client';end if;
  select g0.* into g from private.mcp_grants g0 join private.mcp_tokens t0 on t0.grant_id=g0.id where g0.client_id=c.id and (t0.access_hash=p->>'token_hash' or t0.refresh_hash=p->>'token_hash') limit 1 for update of g0;
  if g.id is not null then update private.mcp_grants set revoked_at=now() where id=g.id;delete from private.mcp_tokens where grant_id=g.id;end if;
  return '{}'::jsonb;
 end if;
 if operation in ('validate','read','prepare') then
  select * into t from private.mcp_tokens where access_hash=p->>'token_hash' and expires_at>now() and audience='https://todo.zsj4j2s4df.workers.dev/mcp';
  if t.access_hash is null then raise exception 'invalid_token';end if;
  select * into g from private.mcp_grants where id=t.grant_id and revoked_at is null and expires_at>now() for share;
  if g.id is null or not('todo:read'=any(t.scopes)) or not(t.scopes<@g.scopes) then raise exception 'invalid_token';end if;
  insert into private.mcp_usage values(g.id,date_trunc('hour',now()),1) on conflict(grant_id,bucket) do update set requests=private.mcp_usage.requests+1 returning requests into n;
  if n>120 then raise exception 'rate_limit';end if;
  uid=g.user_id;perform set_config('request.jwt.claim.sub',uid::text,true);
  if operation='validate' then return jsonb_build_object('user_id',uid,'scopes',t.scopes,'grant_id',g.id);end if;
  if operation='read' then
   if p->>'kind'='one' then select to_jsonb(x) into out from public.items x where x.id=(p->>'id')::uuid and private.can_read_item(x);return out;
   elsif p->>'kind'='notes' then select coalesce(jsonb_agg(to_jsonb(x)),'[]') into out from (select id,body,state,source_type,source_url,created_at,updated_at from public.inbox_notes where user_id=uid and state<>'trash' and (coalesce(p->>'query','')='' or position(lower(left(p->>'query',120)) in lower(body))>0) order by created_at desc,id limit 30 offset greatest(0,least(coalesce((p->>'offset')::int,0),10000))) x;return out;
   elsif p->>'kind'='connections' then select coalesce(jsonb_agg(to_jsonb(x)),'[]') into out from (select id,provider,account_label,calendar_ids,calendar_names,write_calendar_ids,write_enabled,status,last_sync from public.integrations where user_id=uid and enabled) x;return out;
   elsif p->>'kind'='members' then select coalesce(jsonb_agg(to_jsonb(x)),'[]') into out from (select household_id,user_id,display_name from public.household_members where private.is_member(household_id)) x;return out;
   elsif p->>'kind'='items' then
    select coalesce(jsonb_agg(to_jsonb(x)),'[]') into out from (select * from public.items x where private.can_read_item(x) and (coalesce(p->>'query','')='' or position(lower(left(p->>'query',120)) in lower(concat_ws(' ',x.title,x.description,x.category,x.location,x.checklist::text)))>0) and (coalesce(p->>'status','all')='all' or x.status=p->>'status') and (coalesce(p->>'item_kind','all')='all' or x.kind=p->>'item_kind') order by x.created_at desc,x.id limit 30 offset greatest(0,least(coalesce((p->>'offset')::int,0),10000))) x;return out;
   end if;
   raise exception 'invalid_request';
  end if;
  if not('todo:prepare'=any(t.scopes)) then raise exception 'insufficient_scope';end if;
  if p->>'action' not in ('create','update','complete','delete','note') then raise exception 'invalid_request';end if;
  if p->>'action'='create' and p->'payload'->>'connection_id' is not null and not exists(select 1 from public.integrations x where x.id=(p->'payload'->>'connection_id')::uuid and x.user_id=uid and x.enabled and x.write_enabled and (p->'payload'->>'calendar_id')=any(x.write_calendar_ids)) then raise exception 'forbidden';end if;
  if p->>'action' in ('update','complete','delete') then
   select * into i from public.items where id=(p->'payload'->>'id')::uuid for share;
   if i.id is null or not private.can_read_item(i) or (p->>'action' in ('update','delete') and i.owner_id<>uid) or (p->>'action'='complete' and i.owner_id<>uid and not(uid=any(i.assignees))) then raise exception 'forbidden';end if;
   if i.updated_at is distinct from (p->>'expected_updated_at')::timestamptz then raise exception 'stale_item';end if;
  end if;
  delete from private.mcp_proposals where expires_at<now()-interval '1 day';
  if (select count(*) from private.mcp_proposals where user_id=uid and created_at>now()-interval '1 day')>=100 then raise exception 'proposal_limit';end if;
  insert into private.mcp_proposals(grant_id,user_id,action,payload,expected_updated_at) values(g.id,uid,p->>'action',p->'payload',i.updated_at) returning id into new_id;
  return jsonb_build_object('proposal_id',new_id,'confirmation_required',true);
 end if;
 uid=(p->>'user_id')::uuid;
 if uid is null then raise exception 'unauthorized';end if;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 if operation='grants' then select coalesce(jsonb_agg(to_jsonb(x)),'[]') into out from (select g0.id,c0.name client_name,g0.scopes,g0.expires_at,g0.revoked_at from private.mcp_grants g0 join private.mcp_clients c0 on c0.id=g0.client_id where g0.user_id=uid order by g0.expires_at desc) x;return out;end if;
 if operation='revoke' then
  update private.mcp_grants set revoked_at=now() where id=(p->>'grant_id')::uuid and user_id=uid returning * into g;
  if g.id is null then raise exception 'forbidden';end if;
  delete from private.mcp_tokens where grant_id=g.id;
  update private.mcp_proposals set state='cancelled' where grant_id=g.id and state='pending';
  return jsonb_build_object('revoked',true);
 end if;
 if operation not in ('proposal_info','proposal_execute','proposal_reject','proposal_finish') then raise exception 'invalid_request';end if;
 select * into proposal from private.mcp_proposals where id=(p->>'proposal_id')::uuid and user_id=uid for update;
 if proposal.id is null then raise exception 'forbidden';end if;
 select * into g from private.mcp_grants where id=proposal.grant_id and revoked_at is null and expires_at>now() for share;
 if g.id is null or not('todo:prepare'=any(g.scopes)) then raise exception 'forbidden';end if;
 if operation='proposal_finish' then
  if proposal.state<>'processing' or proposal.claim_lease is distinct from (p->>'claim_lease')::uuid then raise exception 'invalid_claim';end if;
  update private.mcp_proposals set state=case when (p->>'success')::boolean then 'done' else 'cancelled' end,result=p->'result',claim_lease=null where id=proposal.id;
  return p->'result';
 end if;
 if proposal.action in ('update','complete','delete') then
  select * into i from public.items where id=(proposal.payload->>'id')::uuid for update;
  if i.id is null or not private.can_read_item(i) then raise exception 'forbidden';end if;
 end if;
 if operation='proposal_info' then select name into c.name from private.mcp_clients where id=g.client_id;return jsonb_build_object('id',proposal.id,'action',proposal.action,'payload',proposal.payload,'client_name',c.name,'state',proposal.state,'expires_at',proposal.expires_at,'expected_updated_at',proposal.expected_updated_at,'external',(i.integration_id is not null or proposal.payload->>'connection_id' is not null));end if;
 if operation='proposal_reject' then
  if proposal.state='pending' then update private.mcp_proposals set state='cancelled' where id=proposal.id;end if;
  return jsonb_build_object('cancelled',true);
 end if;
 if proposal.state='done' then return proposal.result;end if;
 if proposal.state='processing' then raise exception 'processing_or_uncertain';end if;
 if proposal.state<>'pending' or proposal.expires_at<now() then raise exception 'proposal_expired';end if;
 if i.id is not null and i.updated_at is distinct from proposal.expected_updated_at then raise exception 'stale_item';end if;
 external=(i.integration_id is not null) or (proposal.action='create' and proposal.payload->>'connection_id' is not null);
 if external then
  if (p->>'confirmed_external_effects')::boolean is distinct from true then raise exception 'external_confirmation_required';end if;
  claim=gen_random_uuid();update private.mcp_proposals set state='processing',claim_lease=claim,claim_until=now()+interval '2 minutes' where id=proposal.id;
  return jsonb_build_object('external',true,'claim_lease',claim,'action',proposal.action,'payload',proposal.payload,'expected_updated_at',proposal.expected_updated_at,'connection_id',coalesce(i.integration_id,(proposal.payload->>'connection_id')::uuid),'calendar_id',coalesce(i.source_calendar_id,proposal.payload->>'calendar_id'));
 end if;
 if proposal.action='create' then
  v=jsonb_populate_record(null::public.items,proposal.payload->'item');new_id=v.id;
  insert into public.items(id,owner_id,kind,title,description,status,priority,category,due_at,end_at,timezone,location,visibility,assignees,selected_users,checklist,busy,event_type,all_day,start_date,end_date,schedule_kind,schedule_until,schedule_count,repeat_kind)
  values(new_id,uid,v.kind,v.title,v.description,'open',v.priority,v.category,v.due_at,v.end_at,v.timezone,v.location,'private','{}','{}',v.checklist,coalesce(v.busy,true),v.event_type,v.all_day,v.start_date,v.end_date,v.schedule_kind,v.schedule_until,v.schedule_count,v.repeat_kind);
 elsif proposal.action='note' then
  insert into public.inbox_notes(user_id,body,source_type) values(uid,proposal.payload->>'body','text') returning id into new_id;
 elsif proposal.action='update' then
  if i.owner_id<>uid then raise exception 'forbidden';end if;
  v=jsonb_populate_record(i,proposal.payload->'item');
  update public.items set household_id=v.household_id,title=v.title,description=v.description,kind=v.kind,priority=v.priority,category=v.category,due_at=v.due_at,end_at=v.end_at,timezone=v.timezone,location=v.location,visibility=v.visibility,assignees=v.assignees,selected_users=v.selected_users,checklist=v.checklist,event_type=v.event_type,busy=coalesce(v.busy,true),all_day=v.all_day,start_date=v.start_date,end_date=v.end_date,schedule_kind=v.schedule_kind,schedule_until=v.schedule_until,schedule_count=v.schedule_count,repeat_kind=v.repeat_kind where id=i.id;
  new_id=i.id;
 elsif proposal.action='complete' then perform private.complete_item_if_current(i.id,(proposal.payload->>'done')::boolean,proposal.expected_updated_at);new_id=i.id;
 elsif proposal.action='delete' then perform private.trash_item(i.id,proposal.expected_updated_at);new_id=i.id;
 end if;
 out=jsonb_build_object('done',true,'id',new_id);
 update private.mcp_proposals set state='done',result=out where id=proposal.id;
 return out;
end $$;
revoke all on function private.mcp_api(text,jsonb) from public,anon,authenticated;
grant execute on function private.mcp_api(text,jsonb) to service_role;
create function public.mcp_api(operation text,p jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.mcp_api(operation,p)$$;
revoke all on function public.mcp_api(text,jsonb) from public,anon,authenticated;
grant execute on function public.mcp_api(text,jsonb) to service_role;
