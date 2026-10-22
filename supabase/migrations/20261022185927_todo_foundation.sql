-- Apply once in Supabase SQL editor. No service-role key belongs in the browser.
create table public.households(id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 80), owner_id uuid not null references auth.users);
create table public.household_members(household_id uuid references public.households on delete cascade,user_id uuid references auth.users on delete cascade,display_name text not null check(length(display_name) between 1 and 80),primary key(household_id,user_id),unique(user_id));
create table public.household_invites(code uuid primary key default gen_random_uuid(),household_id uuid not null references public.households on delete cascade,expires_at timestamptz not null default now()+interval '1 day');
create table public.items(id uuid primary key,owner_id uuid not null references auth.users,household_id uuid references public.households,kind text not null check(kind in ('task','event','reminder')),title text not null check(length(trim(title)) between 1 and 200),description text not null default '' check(length(description)<=5000),status text not null default 'open' check(status in ('open','done')),priority text not null check(priority in ('low','normal','high')),category text not null default '' check(length(category)<=80),due_at timestamptz,end_at timestamptz,timezone text not null,location text not null default '' check(length(location)<=500),visibility text not null default 'private' check(visibility in ('private','shared','selected')),assignees uuid[] not null default '{}',selected_users uuid[] not null default '{}',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(kind='task' or due_at is not null),check(end_at is null or (due_at is not null and end_at>=due_at)),check(visibility='private' or household_id is not null),check(visibility<>'selected' or cardinality(selected_users)>0));
create index items_household on public.items(household_id);create index items_owner on public.items(owner_id);create index items_due on public.items(due_at);
create function public.is_member(h uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from household_members where household_id=h and user_id=auth.uid()) $$;
create function public.can_read_item(i public.items) returns boolean language sql stable security definer set search_path=public as $$ select auth.uid() is not null and (i.owner_id=auth.uid() or (public.is_member(i.household_id) and (i.visibility='shared' or (i.visibility='selected' and auth.uid()=any(i.selected_users))))) $$;
alter table public.households enable row level security;alter table public.household_members enable row level security;alter table public.household_invites enable row level security;alter table public.items enable row level security;
create policy household_read on public.households for select to authenticated using(public.is_member(id));
create policy member_read on public.household_members for select to authenticated using(public.is_member(household_id));
create policy item_read on public.items for select to authenticated using(public.can_read_item(items));
create policy item_insert on public.items for insert to authenticated with check(owner_id=auth.uid() and (household_id is null or public.is_member(household_id)));
create policy item_update on public.items for update to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid() and (household_id is null or public.is_member(household_id)));
create policy item_delete on public.items for delete to authenticated using(owner_id=auth.uid());
create function public.validate_item() returns trigger language plpgsql security definer set search_path=public as $$ declare person uuid; begin
 if TG_OP='UPDATE' then if new.owner_id<>old.owner_id then raise exception 'Eigenaar kan niet veranderen';end if;new.created_at=old.created_at;end if;
 foreach person in array new.assignees||new.selected_users loop
 if new.household_id is null then if person<>new.owner_id then raise exception 'Ongeldige persoon';end if;
 elsif not exists(select 1 from household_members where household_id=new.household_id and user_id=person) then raise exception 'Persoon is geen lid';end if;end loop;
 if new.visibility='private' and exists(select 1 from unnest(new.assignees) a where a<>new.owner_id) then raise exception 'Privétaak kan alleen aan eigenaar worden toegewezen';end if;
 if new.visibility='selected' and exists(select 1 from unnest(new.assignees) a where a<>new.owner_id and not(a=any(new.selected_users))) then raise exception 'Toegewezen persoon heeft geen toegang';end if;
 new.updated_at=now();return new;end $$;
create trigger validate_item before insert or update on public.items for each row execute function public.validate_item();
create function public.create_household(household_name text,member_name text) returns uuid language plpgsql security definer set search_path=public as $$ declare h uuid;begin
 if auth.uid() is null then raise exception 'Log eerst in';end if;
 insert into households(name,owner_id) values(trim(household_name),auth.uid()) returning id into h;
 insert into household_members values(h,auth.uid(),trim(member_name));return h;end $$;
create function public.create_invite() returns uuid language plpgsql security definer set search_path=public as $$ declare h uuid;c uuid;begin
 select id into h from households where owner_id=auth.uid();if h is null then raise exception 'Alleen de eigenaar kan uitnodigen';end if;
 delete from household_invites where household_id=h;
 insert into household_invites(household_id) values(h) returning code into c;return c;end $$;
create function public.join_household(invite_code uuid,member_name text) returns void language plpgsql security definer set search_path=public as $$ declare h uuid;begin
 if auth.uid() is null then raise exception 'Log eerst in';end if;
 delete from household_invites where code=invite_code and expires_at>now() returning household_id into h;
 if h is null then raise exception 'Uitnodiging ongeldig of verlopen';end if;
 insert into household_members values(h,auth.uid(),trim(member_name));end $$;
create function public.complete_item(item_id uuid,done boolean) returns void language plpgsql security definer set search_path=public as $$ declare i items;begin
 select * into i from items where id=item_id for update;
 if i.id is null or not public.can_read_item(i) then raise exception 'Geen toegang';end if;
 if auth.uid()<>i.owner_id and not(auth.uid()=any(i.assignees)) then raise exception 'Alleen eigenaar of toegewezen persoon kan afronden';end if;
 update items set status=case when done then 'done' else 'open' end where id=item_id;end $$;
revoke all on function public.is_member(uuid),public.can_read_item(public.items),public.create_household(text,text),public.create_invite(),public.join_household(uuid,text),public.complete_item(uuid,boolean) from public,anon;
grant execute on function public.is_member(uuid),public.can_read_item(public.items),public.create_household(text,text),public.create_invite(),public.join_household(uuid,text),public.complete_item(uuid,boolean) to authenticated;
