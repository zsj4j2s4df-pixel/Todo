# Todo — samen waar gewenst, privé waar nodig

Nederlandse taken-, agenda- en herinneringenapp voor jezelf en je huishouden. Licht papier, koffiebruine accenten en één handgetekende Canva-huisstijl. Nieuwe items zijn privé totdat je ze bewust deelt.

**App:** https://todo.zsj4j2s4df.workers.dev/

**MCP voor ChatGPT/Claude:** https://todo.zsj4j2s4df.workers.dev/mcp

[Actuele oplevering en testgrenzen](docs/operations/IMPLEMENTATION_STATUS.md) · [Agenda/mail/MCP aansluiten](docs/operations/CONNECTIONS.md) · [Uitvoering issue #3](docs/operations/ISSUE_3_PROGRESS.md)

## Functies

Taken/checklists, privé/gedeeld/geselecteerd, expliciete toewijzingen en persoonlijke inboxen; getypte/ingesproken notities; boodschappenlijsten, sjablonen, prullenbak en herstel; kalenderplusje, verjaardag/vakantie, hele dagen, herhaalde afspraken en vrije blokken. Dagbriefing met zelfgekozen tijd/weerplaats en een subtiele opruimronde. Geen tijdschattingen of stille uren.

De OpenAI-assistent zoekt met accountrechten en maakt bevestigbare voorstellen via typen, opname/transcriptie en een kort Realtime-gesprek. Hetzelfde geldt voor de remote MCP-connector. Provideradapters voor iCloud, persoonlijk Outlook, Google Calendar en geselecteerde Gmail werken na inrichting en persoonlijke toestemming. Geen volledige mailboxkopie, mailverzending of WhatsApp-scraping.

Web Push vraagt opt-in per apparaat. Echte spraak, bezorging, registratie/herstelmail en persoonlijke provider-/assistentaanmeldingen moeten op eigen apparaten worden getest. Een gepubliceerde adapter betekent niet dat je account al verbonden is. [Activeren en beperkingen](docs/operations/CONNECTIONS.md).

## Ontwikkelen

Node.js 22+ en npm:

```sh
npm ci
npm run dev
```

Zonder publieke Supabase-configuratie werkt de app uitsluitend lokaal in deze browser. Dat is geen accountbeveiliging of gegarandeerd offline openen. Iedereen met toegang tot hetzelfde browserprofiel kan de lokale inhoud lezen. Gegevens worden niet automatisch naar een account geüpload. Back-ups terugzetten kan alleen in lokale modus.

Kopieer `.env.example` naar een genegeerd `.env.local` en configureer de publieke Supabase-URL/publishable key en publieke VAPID-key voor cloudgebruik. Gebruik nooit een service-rolekey of OpenAI/providersecret in `NEXT_PUBLIC_*`.

Voor een eigen Supabase-installatie: pas de migraties in `supabase/migrations` op volgorde toe en volg [push/Vault-inrichting](docs/operations/PUSH.md), [AI-inrichting](docs/operations/AI.md) en [provider/MCP-inrichting](docs/operations/CONNECTIONS.md). Het live project `pyqvxwxpsngbndkrlajz` heeft alle negentien migraties al; voer deze daar niet opnieuw handmatig uit. Schema `private` blijft buiten de Data API.

Ieder gebruikt een eigen account. In Instellingen kan een huishouden worden aangemaakt en met een eenmalige uitnodigingscode worden gekoppeld. De eigenaar beheert details, expliciet toegewezen gebruikers kunnen zichtbare taken afronden. Alleen huishoudenlid zijn geeft geen toegang tot privégegevens of bronaccounts. Vernieuwen haalt veranderingen van andere gebruikers op; geen offline cloudschrijfqueue.

## Controles

```sh
npm test
npm run build
npm run typecheck
npx playwright install chromium
npm run test:cloud
```

Voor lokale browserflows: bouw met lege `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` en `NEXT_PUBLIC_SUPABASE_ANON_KEY`, voer `npm run test:e2e` uit en bouw daarna weer met de normale configuratie. `TODO_TEST_URL=https://todo.zsj4j2s4df.workers.dev npm run test:cloud` controleert de publieke site; provider-/AI-verzoeken worden in die tests met synthetische fixtures onderschept. Er worden geen echte mails, uitnodigingen of betaalde modelcalls verzonden.

Core-validatie en datumlogica voor Deno worden mechanisch uit `lib/` gegenereerd via `npm run sync:contracts`; geen tweede contract handmatig aanpassen. Deno-protocoltests staan naast de Edge Functions en hebben geen netwerkpermissie nodig:

```sh
npm exec --yes --package=deno@2.5.7 -- deno test --node-modules-dir=none --allow-env supabase/functions/todo-connect/protocol_test.ts supabase/functions/todo-mcp/protocol_test.ts supabase/functions/push-dispatch/protocol_test.ts
```

## Publiceren en stijl

Next.js exporteert naar `out/`; Cloudflare Worker `todo` serveert Static Assets en proxyt de vaste MCP/OAuth-routes naar Supabase Edge Functions. `wrangler.jsonc` bevat geen secrets. De service worker cachet geen privégegevens en Cloudflare redigeert querystrings in logs. Cloudfrontend-keys moeten tijdens iedere build beschikbaar zijn.

`npm run deploy` bouwt en publiceert met de beschikbare Cloudflare-CLI-identiteit. De gekoppelde Cloudflare-app kan ook rechtstreeks de assets en Worker publiceren. Merge/publicatie vraagt de gebruikersautorisatie uit de sessie; de gebruiker heeft die voor deze oplevering expliciet gegeven.

Lees [AGENTS.md](AGENTS.md) en de [verplichte icoonstijlskill](.agents/skills/todo-icon-style/SKILL.md). Artwork/provenance staat in `assets/icon-masters`; `scripts/build-icons.py` levert alleen mechanische rastertransformaties. Geen stock-iconen of tweede tekenstijl. Toekomstige native apps behouden dezelfde backend/accounts en MCP-URL of krijgen veilige begeleide herautorisatie.
