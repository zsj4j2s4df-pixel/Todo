-- Synthetic accounts/data only, rolled back. No provider/model/mail requests.
begin;
do $$declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();begin
 insert into auth.users(id) values(a),(b);
 perform set_config('todo_test.owner',a::text,true);perform set_config('todo_test.partner',b::text,true);
 perform set_config('todo_test.note',gen_random_uuid()::text,true);
end$$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('todo_test.owner'),true);
insert into public.inbox_notes(id,user_id,body) values(current_setting('todo_test.note')::uuid,auth.uid(),'Synthetic private thought');
select set_config('todo_test.item',public.convert_note(current_setting('todo_test.note')::uuid,jsonb_build_object('id',gen_random_uuid(),'kind','task','title','Synthetic task','timezone','Europe/Amsterdam'))::text,true);
do $$declare again uuid;begin
 again=public.convert_note(current_setting('todo_test.note')::uuid,'{}');
 if again::text<>current_setting('todo_test.item') then raise exception 'Non-idempotent conversion';end if;
end$$;
select set_config('request.jwt.claim.sub',current_setting('todo_test.partner'),true);
do $$begin
 if exists(select 1 from public.inbox_notes) then raise exception 'Partner can read notes';end if;
 if (public.ai_search_notes('Synthetic',0)->>'total')::int<>0 then raise exception 'AI bypasses note isolation';end if;
 if exists(select 1 from public.items where id=current_setting('todo_test.item')::uuid) then raise exception 'Partner can read converted item';end if;
 if has_function_privilege('authenticated','public.mcp_api(text,jsonb)','execute') or has_function_privilege('authenticated','public.integration_claim(uuid,uuid)','execute') then raise exception 'Client has server privileges';end if;
end$$;
select set_config('request.jwt.claim.sub',current_setting('todo_test.owner'),true);
select public.trash_item(current_setting('todo_test.item')::uuid,(select updated_at from public.items where id=current_setting('todo_test.item')::uuid));
do $$begin
 if exists(select 1 from public.items where id=current_setting('todo_test.item')::uuid) then raise exception 'Deleted item remains visible';end if;
end$$;
select public.restore_item(current_setting('todo_test.item')::uuid);
do $$begin
 if not exists(select 1 from public.items where id=current_setting('todo_test.item')::uuid and visibility='private' and cardinality(assignees)=0) then raise exception 'Restore is not private';end if;
end$$;
reset role;
do $$declare cid uuid;claim jsonb;events jsonb;n integer;begin
 cid=public.integration_connect(current_setting('todo_test.owner')::uuid,'google_calendar','fixture@example.test','{"access_token":"fixture-only-not-usable"}');
 perform public.integration_select(current_setting('todo_test.owner')::uuid,cid,array['primary'],false);
 claim=public.integration_claim(current_setting('todo_test.owner')::uuid,cid);
 if claim->'credentials'->>'access_token'<>'fixture-only-not-usable' then raise exception 'Vault storage/claim failed';end if;
 events=jsonb_build_array(jsonb_build_object('calendar_id','primary','event_id','fixture','version','1','item',jsonb_build_object('title','Synthetic source event','due_at','2026-10-27T10:00:00Z','end_at','2026-10-27T11:00:00Z','timezone','Europe/Amsterdam')));
 n=public.integration_sync(current_setting('todo_test.owner')::uuid,cid,(claim->>'lease')::uuid,events,'2026-10-20','2026-11-20',true,jsonb_build_array(jsonb_build_object('calendar_id','primary','cursor','fixture-cursor','events',events)));
 if n<>1 or public.integration_cache(current_setting('todo_test.partner')::uuid,cid,'2026-10-20','2026-11-20') is not null then raise exception 'Provider isolation/sync failed';end if;
 perform public.integration_disconnect(current_setting('todo_test.owner')::uuid,cid,true);
 if exists(select 1 from private.integration_secrets where connection_id=cid) or exists(select 1 from private.integration_cache where connection_id=cid) then raise exception 'Disconnect did not clean up';end if;
end$$;
rollback;
select 'PASS: live notes/conversion, private restore, AI/provider isolation, actual Vault storage, sync and disconnect; fixtures rolled back' as result;
