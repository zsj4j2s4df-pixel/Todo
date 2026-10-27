-- Private content, recoverable deletion and shared checklist operations.
alter table public.items add column deleted_at timestamptz;
alter table public.items add column reviewed_at timestamptz;
alter table public.brief_preferences add column notes_enabled boolean not null default true,add column review_enabled boolean not null default true;
alter table public.items add column list_type text not null default 'none' check(list_type in ('none','shopping'));
create index items_trash_owner on public.items(owner_id,deleted_at desc) where deleted_at is not null;
create or replace function private.can_read_item(i public.items) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and i.deleted_at is null and (i.owner_id=auth.uid() or (private.is_member(i.household_id) and (i.visibility='shared' or (i.visibility='selected' and auth.uid()=any(i.selected_users)))))
$$;
create or replace function private.push_item_visible(i public.items,recipient uuid) returns boolean language sql stable set search_path='' as $$
 select i.deleted_at is null and (i.owner_id=recipient or (exists(select 1 from public.household_members m where m.household_id=i.household_id and m.user_id=recipient) and (i.visibility='shared' or (i.visibility='selected' and recipient=any(i.selected_users)))))
$$;
-- Only trash RPCs may change deletion state; normal writes retain existing policies.
revoke delete,update on public.items from authenticated;
grant update(id,owner_id,household_id,kind,title,description,status,priority,category,due_at,end_at,timezone,location,visibility,assignees,selected_users,created_at,updated_at,checklist,repeat_kind,repeat_anchor,repeat_index,repeat_source,import_uid,list_type,reviewed_at) on public.items to authenticated;
create function private.trash_item(item_id uuid,expected_updated_at timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare i public.items;
begin
 select * into i from public.items where id=item_id for update;
 if auth.uid() is null or i.id is null or i.owner_id<>auth.uid() then raise exception 'Geen toegang';end if;
 if i.deleted_at is not null then return;end if;
 if i.updated_at<>expected_updated_at then raise exception 'Item is gewijzigd. Open het opnieuw.';end if;
 update public.items set deleted_at=now() where id=i.id;
end $$;
create function private.restore_item(item_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Log eerst in';end if;
 -- Restore privately: never silently regrant a previous share or assignment.
 update public.items set deleted_at=null,visibility='private',selected_users='{}',assignees='{}' where id=item_id and owner_id=auth.uid() and deleted_at is not null;
 if not found then raise exception 'Item niet beschikbaar in je prullenbak';end if;
end $$;
create function private.purge_item(item_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Log eerst in';end if;
 delete from public.items where id=item_id and owner_id=auth.uid() and deleted_at is not null;
 if not found then raise exception 'Item niet beschikbaar in je prullenbak';end if;
end $$;
create function private.trash_page(row_offset integer) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) from (select * from public.items where owner_id=auth.uid() and deleted_at is not null order by deleted_at desc,id limit 50 offset greatest(0,least(coalesce(row_offset,0),100000))) p
$$;
create function public.trash_item(item_id uuid,expected_updated_at timestamptz) returns void language sql security invoker set search_path='' as $$select private.trash_item(item_id,expected_updated_at)$$;
create function public.restore_item(item_id uuid) returns void language sql security invoker set search_path='' as $$select private.restore_item(item_id)$$;
create function public.purge_item(item_id uuid) returns void language sql security invoker set search_path='' as $$select private.purge_item(item_id)$$;
create function public.trash_page(row_offset integer default 0) returns jsonb language sql stable security invoker set search_path='' as $$select private.trash_page(row_offset)$$;
revoke all on function private.trash_item(uuid,timestamptz),private.restore_item(uuid),private.purge_item(uuid),private.trash_page(integer),public.trash_item(uuid,timestamptz),public.restore_item(uuid),public.purge_item(uuid),public.trash_page(integer) from public,anon,authenticated;
grant execute on function private.trash_item(uuid,timestamptz),private.restore_item(uuid),private.purge_item(uuid),private.trash_page(integer),public.trash_item(uuid,timestamptz),public.restore_item(uuid),public.purge_item(uuid),public.trash_page(integer) to authenticated;

create table public.inbox_notes(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users on delete cascade,
 body text not null check(length(trim(body)) between 1 and 5000),
 source_type text not null default 'text' check(source_type in ('text','voice','gmail')),
 source_key text check(length(source_key)<=300),source_url text check(length(source_url)<=1000),
 state text not null default 'inbox' check(state in ('inbox','kept','converted','trash')),
 converted_item_id uuid references public.items on delete set null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(user_id,source_type,source_key)
);
create index inbox_notes_user_state on public.inbox_notes(user_id,state,created_at desc);
alter table public.inbox_notes enable row level security;
revoke all on public.inbox_notes from public,anon,authenticated;
grant select,insert,delete on public.inbox_notes to authenticated;
grant update(body,state) on public.inbox_notes to authenticated;
create policy note_purge on public.inbox_notes for delete to authenticated using(user_id=(select auth.uid()) and state='trash');
create policy note_read on public.inbox_notes for select to authenticated using(user_id=(select auth.uid()));
create policy note_insert on public.inbox_notes for insert to authenticated with check(user_id=(select auth.uid()) and state='inbox' and converted_item_id is null);
create policy note_update on public.inbox_notes for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create function private.note_stamp() returns trigger language plpgsql set search_path='' as $$begin new.updated_at=now();return new;end$$;
revoke all on function private.note_stamp() from public,anon,authenticated;
create trigger note_stamp before update on public.inbox_notes for each row execute function private.note_stamp();
create table public.item_inbox_state(user_id uuid not null references auth.users on delete cascade,item_id uuid not null references public.items on delete cascade,handled boolean not null default false,primary key(user_id,item_id));
create index item_inbox_item on public.item_inbox_state(item_id);
alter table public.item_inbox_state enable row level security;
revoke all on public.item_inbox_state from public,anon,authenticated;
grant select,insert,update,delete on public.item_inbox_state to authenticated;
create policy item_inbox_access on public.item_inbox_state for all to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.items i where i.id=item_id and user_id=any(i.assignees))) with check(user_id=(select auth.uid()) and exists(select 1 from public.items i where i.id=item_id and user_id=any(i.assignees)));
create function private.reset_item_inbox() returns trigger language plpgsql security definer set search_path='' as $$begin
 delete from public.item_inbox_state where item_id=new.id and (new.deleted_at is not null or not(user_id=any(new.assignees)) or (user_id=any(new.assignees) and not(user_id=any(old.assignees))));
 return new;end$$;
revoke all on function private.reset_item_inbox() from public,anon,authenticated;
create trigger reset_item_inbox after update on public.items for each row execute function private.reset_item_inbox();

create table public.item_templates(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users on delete cascade,name text not null check(length(trim(name)) between 1 and 200),description text not null default '' check(length(description)<=5000),checklist jsonb not null default '[]' check(jsonb_typeof(checklist)='array' and jsonb_array_length(checklist)<=50),list_type text not null default 'none' check(list_type in ('none','shopping')),created_at timestamptz not null default now());
create trigger validate_template_checklist before insert or update on public.item_templates for each row execute function private.validate_checklist();
create index item_templates_owner on public.item_templates(user_id);
alter table public.item_templates enable row level security;
revoke all on public.item_templates from public,anon,authenticated;
grant select,insert,update,delete on public.item_templates to authenticated;
create policy template_access on public.item_templates for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

-- Atomic mutations prevent two shoppers overwriting one another's list.
create function private.shopping_step(item_id uuid,step_id uuid,step_text text,checked boolean) returns void language plpgsql security definer set search_path='' as $$
declare i public.items;
begin
 select * into i from public.items where id=item_id for update;
 if i.id is null or not private.can_read_item(i) or i.list_type<>'shopping' or step_id is null then raise exception 'Geen toegang tot deze boodschappenlijst';end if;
 if exists(select 1 from jsonb_array_elements(i.checklist) s where s->>'id'=step_id::text) then
  if checked is null then return;end if;
  update public.items set checklist=(select jsonb_agg(case when s->>'id'=step_id::text then s||jsonb_build_object('done',checked) else s end) from jsonb_array_elements(i.checklist) s) where id=i.id;
 else
  if step_text is null or length(trim(step_text)) not between 1 and 200 or jsonb_array_length(i.checklist)>=50 then raise exception 'Vul maximaal 50 boodschappen van 200 tekens in';end if;
  update public.items set checklist=i.checklist||jsonb_build_array(jsonb_build_object('id',step_id,'text',trim(step_text),'done',false)) where id=i.id;
 end if;
end $$;
create function public.shopping_step(item_id uuid,step_id uuid,step_text text default null,checked boolean default null) returns void language sql security invoker set search_path='' as $$select private.shopping_step(item_id,step_id,step_text,checked)$$;
revoke all on function private.shopping_step(uuid,uuid,text,boolean),public.shopping_step(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function private.shopping_step(uuid,uuid,text,boolean),public.shopping_step(uuid,uuid,text,boolean) to authenticated;

-- Convert an owned note and mark it processed in one transaction; retry is idempotent.
create function private.convert_note(note_id uuid,new_item jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare n public.inbox_notes;v public.items;made uuid;
begin
 select * into n from public.inbox_notes where id=note_id for update;
 if auth.uid() is null or n.id is null or n.user_id<>auth.uid() or n.state='trash' then raise exception 'Geen toegang';end if;
 if n.converted_item_id is not null then return n.converted_item_id;end if;
 new_item=new_item||jsonb_build_object('due_at',nullif(new_item->>'due_at',''),'end_at',nullif(new_item->>'end_at',''),'start_date',nullif(new_item->>'start_date',''),'end_date',nullif(new_item->>'end_date',''),'schedule_until',nullif(new_item->>'schedule_until','')); 
 v=jsonb_populate_record(null::public.items,new_item);
 made=coalesce(v.id,gen_random_uuid());
 insert into public.items(id,owner_id,household_id,kind,title,description,status,priority,category,due_at,end_at,timezone,location,visibility,assignees,selected_users,checklist)
 values(made,auth.uid(),null,v.kind,v.title,coalesce(v.description,''),'open',coalesce(v.priority,'normal'),coalesce(v.category,''),v.due_at,v.end_at,coalesce(v.timezone,'Europe/Amsterdam'),coalesce(v.location,''),'private','{}','{}',coalesce(v.checklist,'[]'));
 update public.inbox_notes set converted_item_id=made,state='converted' where id=n.id;
 return made;
end $$;
create function public.convert_note(note_id uuid,new_item jsonb) returns uuid language sql security invoker set search_path='' as $$select private.convert_note(note_id,new_item)$$;
revoke all on function private.convert_note(uuid,jsonb),public.convert_note(uuid,jsonb) from public,anon,authenticated;
grant execute on function private.convert_note(uuid,jsonb),public.convert_note(uuid,jsonb) to authenticated;

create function public.note_page(row_offset integer default 0,note_state text default 'all') returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('total',(select count(*) from public.inbox_notes where note_state='all' or state=note_state),'pending',(select count(*) from public.inbox_notes where state='inbox'),'items',coalesce((select jsonb_agg(to_jsonb(p)) from (select * from public.inbox_notes where note_state='all' or state=note_state order by case when state='inbox' then 0 else 1 end,created_at,id limit 100 offset greatest(0,least(row_offset,100000))) p),'[]'))
$$;
revoke all on function public.note_page(integer,text) from public,anon,authenticated;
grant execute on function public.note_page(integer,text) to authenticated;

create function public.ai_search_notes(query_text text default '',row_offset integer default 0) returns jsonb language sql stable security invoker set search_path='' as $$
 with matched as(select id,body,source_type,state,created_at from public.inbox_notes where user_id=auth.uid() and state<>'trash' and position(lower(left(coalesce(query_text,''),120)) in lower(body))>0), page as(select * from matched order by created_at desc,id limit 30 offset least(10000,greatest(0,coalesce(row_offset,0))))
 select jsonb_build_object('total',(select count(*) from matched),'notes',coalesce((select jsonb_agg(page) from page),'[]'::jsonb));
$$;
revoke all on function public.ai_search_notes(text,integer) from public,anon,authenticated;
grant execute on function public.ai_search_notes(text,integer) to authenticated;
