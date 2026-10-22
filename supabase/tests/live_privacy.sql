-- Temporary synthetic fixtures only; the entire test is rolled back.
begin;
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();c uuid:=gen_random_uuid();
begin
 insert into auth.users(id) values(a),(b),(c);
 perform set_config('todo_test.owner',a::text,true);
 perform set_config('todo_test.partner',b::text,true);
 perform set_config('todo_test.outsider',c::text,true);
 perform set_config('todo_test.private',gen_random_uuid()::text,true);
 perform set_config('todo_test.shared',gen_random_uuid()::text,true);
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('todo_test.owner'),true);
select set_config('todo_test.household',public.create_household('Todo tijdelijke beveiligingstest','Test eigenaar')::text,true);
select set_config('todo_test.invite',public.create_invite()::text,true);
select set_config('request.jwt.claim.sub',current_setting('todo_test.partner'),true);
select public.join_household(current_setting('todo_test.invite')::uuid,'Test huisgenoot');
select set_config('request.jwt.claim.sub',current_setting('todo_test.owner'),true);
insert into public.items(id,owner_id,household_id,kind,title,priority,timezone,visibility,assignees)
 values(current_setting('todo_test.private')::uuid,auth.uid(),current_setting('todo_test.household')::uuid,'task','Privé test','normal','Europe/Amsterdam','private','{}'),
 (current_setting('todo_test.shared')::uuid,auth.uid(),current_setting('todo_test.household')::uuid,'task','Gedeelde test','normal','Europe/Amsterdam','shared',array[current_setting('todo_test.partner')::uuid]);
select set_config('request.jwt.claim.sub',current_setting('todo_test.partner'),true);
do $$ declare n integer;begin
 select count(*) into n from public.items;if n<>1 then raise exception 'Partner sees private data';end if;
 select count(*) into n from public.notifications;if n<>1 then raise exception 'Assignment notification missing';end if;
 update public.items set title='Unauthorized' where id=current_setting('todo_test.shared')::uuid;
 get diagnostics n=row_count;if n<>0 then raise exception 'Partner edited owner data';end if;
 begin execute 'truncate public.items cascade';raise exception 'Unexpected truncate privilege';exception when insufficient_privilege then null;end;
end $$;
select public.complete_item(current_setting('todo_test.shared')::uuid,true);
select set_config('request.jwt.claim.sub',current_setting('todo_test.outsider'),true);
do $$ declare n integer;begin
 select count(*) into n from public.items;if n<>0 then raise exception 'Outsider sees household';end if;
 select count(*) into n from public.notifications;if n<>0 then raise exception 'Outsider sees notifications';end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('todo_test.owner'),true);
do $$ declare n integer;begin
 select count(*) into n from public.notifications where kind='completion';if n<>1 then raise exception 'Completion notification missing';end if;
end $$;
update public.items set visibility='private',assignees='{}' where id=current_setting('todo_test.shared')::uuid;
select set_config('request.jwt.claim.sub',current_setting('todo_test.partner'),true);
do $$ declare n integer;begin
 select count(*) into n from public.items;if n<>0 then raise exception 'Revoked access still readable';end if;
 select count(*) into n from public.notifications;if n<>0 then raise exception 'Revoked notification still readable';end if;
end $$;
reset role;
rollback;
select 'PASS: household privacy, assignment, completion, revocation and TRUNCATE protection; fixtures rolled back' as result;
