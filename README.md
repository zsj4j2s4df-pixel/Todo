# Shared Todo

Private household task, calendar and reminder app for partners.

**Product principle:** Samen waar gewenst. Privé waar nodig.

## Foundation stack
- Next.js + React + TypeScript
- Tailwind CSS
- Zod
- Supabase (planned: Auth, PostgreSQL, Realtime)
- Vercel (planned hosting)
- Web PWA foundation
- Vitest + Playwright
- OpenAI through a server-side AI Gateway
- Claude as an optional provider adapter
- MCP as a separately authorized integration

## Current package
This v0.1 package provides the repository foundation, product/architecture documentation and a minimal responsive app shell. Backend integrations are deliberately not faked: they are documented and prepared for the next build phase.

## Security
Never commit API keys, OAuth tokens, database passwords, or service-role credentials. Use environment variables/secrets.
