-- Steps inherit the item's existing owner write and visibility policies.
alter table public.items add column checklist jsonb not null default '[]'::jsonb check(jsonb_typeof(checklist)='array' and jsonb_array_length(checklist)<=50);
create function private.validate_checklist() returns trigger language plpgsql set search_path='' as $$
declare step jsonb;
begin
 if jsonb_typeof(new.checklist)<>'array' or jsonb_array_length(new.checklist)>50 then raise exception 'Ongeldige checklist';end if;
 for step in select value from jsonb_array_elements(new.checklist) loop
  if jsonb_typeof(step)<>'object' or jsonb_typeof(step->'text') is distinct from 'string' or length(trim(step->>'text')) not between 1 and 200 or jsonb_typeof(step->'done') is distinct from 'boolean' or jsonb_typeof(step->'id') is distinct from 'string' or (step->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Ongeldige checkliststap';end if;
 end loop;
 if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(new.checklist)) then raise exception 'Dubbele checkliststap';end if;
 return new;
end $$;
revoke all on function private.validate_checklist() from public,anon,authenticated;
create trigger validate_checklist before insert or update on public.items for each row execute function private.validate_checklist();
