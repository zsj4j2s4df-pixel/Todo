# Architecture

Next.js/React PWA -> application services -> authorization -> Supabase/PostgreSQL/RLS.

AI and MCP never access the database directly:
AI/MCP -> Application Service -> Authorization -> RLS -> Database.
