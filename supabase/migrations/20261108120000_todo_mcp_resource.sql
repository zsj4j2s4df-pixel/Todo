-- Verhuizing naar todo.jesseboontje.workers.dev.
-- Het MCP-adres staat voortaan op één plek: private.mcp_resource().
-- Bij een volgende verhuizing is alleen een nieuwe versie van die functie nodig.
create or replace function private.mcp_resource() returns text language sql immutable set search_path='' as $$select 'https://todo.jesseboontje.workers.dev/mcp'::text$$;
revoke all on function private.mcp_resource() from public,anon,authenticated;
grant execute on function private.mcp_resource() to service_role;

-- private.mcp_api had het oude adres vier keer letterlijk staan. Vervang die
-- door een aanroep van private.mcp_resource(), zonder de rest te wijzigen.
do $$
declare
  old_resource constant text := '''https://todo.zsj4j2s4df.workers.dev/mcp''';
  def text := pg_get_functiondef('private.mcp_api(text,jsonb)'::regprocedure);
  hits int;
begin
  hits := (length(def) - length(replace(def, old_resource, ''))) / length(old_resource);
  if hits <> 4 then
    raise exception 'private.mcp_api bevat het oude MCP-adres % keer, verwacht 4', hits;
  end if;
  execute replace(def, old_resource, 'private.mcp_resource()');
end $$;
