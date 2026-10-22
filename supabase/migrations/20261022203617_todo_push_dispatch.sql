-- Edge Function uses its built-in service-role credential, never a browser key.
-- Secrets are provisioned separately into Vault; never persist their values here.
grant usage on schema private to service_role;
create function private.claim_push_jobs(dispatch_key text) returns jsonb language plpgsql security definer set search_path='' as $$
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
 select s.id,'morning:'||s.user_id||':'||(now() at time zone s.timezone)::date,'morning' from public.push_subscriptions s
 where s.morning_enabled and (now() at time zone s.timezone)::time>='08:00'::time and (now() at time zone s.timezone)::time<'09:00'::time
 on conflict(subscription_id,event_key) do nothing;
 -- Recheck privacy and preferences at every claim, including retries.
 update private.push_jobs j set state='discarded' from public.push_subscriptions s
 where s.id=j.subscription_id and j.state='pending' and (
 (j.kind='morning' and not s.morning_enabled) or (j.kind='reminder' and not s.reminders_enabled)
 or (j.item_id is not null and not exists(select 1 from public.items i where i.id=j.item_id and private.push_item_visible(i,s.user_id)
 and (j.kind<>'reminder' or (i.status='open' and i.kind='reminder' and (i.owner_id=s.user_id or s.user_id=any(i.assignees)) and j.event_key='reminder:'||i.id||':'||i.due_at))))
 or (j.kind='assignment' and exists(select 1 from public.notification_preferences p where p.user_id=s.user_id and not p.assignment_enabled))
 or (j.kind='completion' and exists(select 1 from public.notification_preferences p where p.user_id=s.user_id and not p.completion_enabled))
 );
 with due as (select id from private.push_jobs where state='pending' and attempts<5 and retry_at<=now() order by retry_at,id limit 50 for update skip locked),
 claimed as (update private.push_jobs j set lease=gen_random_uuid(),attempts=attempts+1,retry_at=now()+interval '5 minutes' from due where j.id=due.id returning j.*)
 select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'lease',j.lease,'kind',j.kind,'tag',j.event_key,'subscription',jsonb_build_object('endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth)))),'[]'::jsonb) into jobs
 from claimed j join public.push_subscriptions s on s.id=j.subscription_id;
 return jsonb_build_object('publicKey',vapid_public,'privateKey',vapid_private,'jobs',jobs);
end $$;
create function private.finish_push_job(job_id uuid,claim_lease uuid,http_status integer) returns void language plpgsql security definer set search_path='' as $$
declare job private.push_jobs;
begin
 select * into job from private.push_jobs where id=job_id and lease=claim_lease and state='pending' for update;
 if job.id is null then return;end if;
 if http_status in (404,410) then delete from public.push_subscriptions where id=job.subscription_id;
 else update private.push_jobs set state=case when http_status between 200 and 299 then 'accepted' when attempts>=5 or (http_status between 400 and 499 and http_status<>429) then 'discarded' else 'pending' end,
 retry_at=now()+least(attempts*attempts,60)*interval '1 minute',lease=null where id=job.id;end if;
end $$;
revoke all on function private.claim_push_jobs(text),private.finish_push_job(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function private.claim_push_jobs(text),private.finish_push_job(uuid,uuid,integer) to service_role;
create function public.claim_push_jobs(dispatch_key text) returns jsonb language sql security invoker set search_path='' as $$ select private.claim_push_jobs(dispatch_key) $$;
create function public.finish_push_job(job_id uuid,claim_lease uuid,http_status integer) returns void language sql security invoker set search_path='' as $$ select private.finish_push_job(job_id,claim_lease,http_status) $$;
revoke all on function public.claim_push_jobs(text),public.finish_push_job(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.claim_push_jobs(text),public.finish_push_job(uuid,uuid,integer) to service_role;
