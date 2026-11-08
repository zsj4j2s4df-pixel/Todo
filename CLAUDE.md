# Todo

## Wat het is
Nederlandse taken-, agenda- en herinneringenapp voor Jesse en zijn huishouden. Principe: samen waar gewenst, privé waar nodig. Nieuwe items zijn privé tot ze bewust gedeeld worden.

## Gebruikers en situatie
Privégebruik: Jesse en huisgenoten, ieder met een eigen account. Vooral op de iPhone, als app op het beginscherm (PWA). Geen werkplaatsgebruik.

## Live
- Productie: https://todo.zsj4j2s4df.workers.dev/ (MCP-connector: `/mcp`)
- Cloudflare: Worker `todo` (privéaccount), zie `wrangler.jsonc`. Let op: dit is een Worker, geen Cloudflare Pages. Er zijn nog geen automatische preview-links per branch.
- Backend: Supabase-project `pyqvxwxpsngbndkrlajz` (migraties staan live, niet opnieuw handmatig uitvoeren)
- GitHub: zsj4j2s4df-pixel/Todo

## Waar staat wat
Lees deze documenten in plaats van hier te herhalen:
- `README.md`: functies, ontwikkelen, controles, publiceren.
- `docs/operations/IMPLEMENTATION_STATUS.md`: wat gebouwd, getest en nog niet geactiveerd is.
- `AGENTS.md` en `.agents/skills/todo-icon-style/SKILL.md`: verplichte icoonstijl.
- `docs/product/`, `docs/architecture/`, `docs/design/`: product, opbouw, rechten en stijl.
- `docs/operations/`: AI, koppelingen/MCP, push, PWA, routines en werkregels.

## Vaste regels
- Nooit direct op main. Volg de skill functie-bouwen.
- Geen geheime sleutels in de repo.
- Rekenwerk altijd narekenen met een voorbeeld uit de praktijk.
- Privacy is een functie: privé/gedeeld/geselecteerd nooit verzwakken; AI en MCP gaan via dezelfde rechten.

## Beslissingen
- 2026-11-08: CLAUDE.md toegevoegd als korte wegwijzer naar de bestaande documenten.
- 2026-11-08: twaalf oude Engelse kladjes uit de hoofdmap verwijderd; `docs/` is de enige bron. PWA.md verhuisd naar `docs/operations/`.
