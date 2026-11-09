# Todo

## Wat het is
Nederlandse taken-, agenda- en herinneringenapp voor Jesse en zijn huishouden. Principe: samen waar gewenst, privé waar nodig. Nieuwe items zijn privé tot ze bewust gedeeld worden.

## Gebruikers en situatie
Privégebruik: Jesse en huisgenoten, ieder met een eigen account. Vooral op de iPhone, als app op het beginscherm (PWA). Geen werkplaatsgebruik.

## Live
- Productie: https://todo.jesseboontje.workers.dev/ (MCP-connector: `/mcp`). Verhuisd op 2026-11-09 van todo.zsj4j2s4df.workers.dev; die oude Worker blijft draaien tot Jesse zegt dat hij weg mag.
- Cloudflare: Worker `todo` op het account jesseboontje@hotmail.com, zie `wrangler.jsonc`. Dit is een Worker, geen Cloudflare Pages. Previews: elke branch krijgt een proeflink `<branch>-todo.jesseboontje.workers.dev` via Workers Builds. Een push start nog niet vanzelf een build; die wordt met de hand of via de Cloudflare-API gestart.
- Webadres: staat alleen in `lib/site.ts`. Een verhuizing is die regel aanpassen plus een nieuwe migratie voor `private.mcp_resource()`. Oude migraties nooit aanpassen.
- Backend: Supabase-project `pyqvxwxpsngbndkrlajz` (migraties staan live, niet opnieuw handmatig uitvoeren)
- GitHub: zsj4j2s4df-pixel/Todo

## Waar staat wat
Lees deze documenten in plaats van hier te herhalen:
- `README.md`: functies, ontwikkelen, controles, publiceren.
- `docs/operations/IMPLEMENTATION_STATUS.md`: wat gebouwd, getest en nog niet geactiveerd is.
- `AGENTS.md` en `.agents/skills/todo-icon-style/SKILL.md`: verplichte icoonstijl.
- `docs/product/`, `docs/architecture/`, `docs/design/`: product, opbouw, rechten en stijl.
- `docs/operations/`: AI, koppelingen/MCP, push, routines en werkregels.

De korte `.md`-bestanden in de hoofdmap (AI, API, ARCHITECTURE, DATABASE, DESIGN_SYSTEM, INTEGRATIONS, MCP, PRIVACY, PRODUCT_SPEC, PWA, ROADMAP, SECURITY) zijn oude stubs. Bij twijfel gaat `docs/` voor.

## Vaste regels
- Nooit direct op main. Volg de skill functie-bouwen.
- Geen geheime sleutels in de repo.
- Rekenwerk altijd narekenen met een voorbeeld uit de praktijk.
- Privacy is een functie: privé/gedeeld/geselecteerd nooit verzwakken; AI en MCP gaan via dezelfde rechten.

## Beslissingen
- 2026-11-08: CLAUDE.md toegevoegd als korte wegwijzer naar de bestaande documenten.
- 2026-11-09: verhuisd naar todo.jesseboontje.workers.dev; adres centraal in `lib/site.ts`, MCP-adres in `private.mcp_resource()`. Valkuil: zonder de drie `NEXT_PUBLIC_…`-build-variabelen in Workers Builds werkt inloggen niet.
