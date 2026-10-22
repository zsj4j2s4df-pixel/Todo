# Todo — samen waar gewenst, privé waar nodig

Responsive Nederlandse Next.js/React-app in de papier-en-inktstijl van Let's Brew, Kasboek en PanKlaar. Nieuwe items zijn standaard privé; er wordt geen demo-inhoud aangemaakt.

## Starten

Node.js 22+ en npm:

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Zonder configuratie werkt de app uitsluitend lokaal in deze browser. Taken, afspraken en herinneringen worden in localStorage opgeslagen. Dit is geen accountbeveiliging of synchronisatie: iedereen met toegang tot hetzelfde browserprofiel kan deze gegevens bekijken. JSON-export en gecontroleerd terugzetten staan in Instellingen. Lokale gegevens worden nooit automatisch naar een account geüpload.

## Accounts en delen inschakelen

1. Maak een Supabase-project en voer alle bestanden in `supabase/migrations/` eenmalig op volgorde van bestandsnaam uit in de SQL-editor. De migraties veronderstellen Supabase Auth en diens standaard tabelrechten voor de authenticated-rol.
2. Kopieer `.env.example` naar `.env.local`. Vul de project-URL en de publieke anon/publishable key in. Gebruik **nooit** een service-role/secret key. Beide variabelen worden tijdens de frontendbuild verwerkt.
3. Stel in Supabase Auth de Site URL en toegestane redirect-URL in op het daadwerkelijke app-adres. Schakel e-mailbevestiging in en configureer mailbezorging voordat je accounts beschikbaar stelt.
4. Herstart de developmentserver of maak een nieuwe productiebuild. Maak een account en log in. Maak in Instellingen een huishouden aan. De eigenaar kan een eenmalige uitnodigingscode genereren (24 uur geldig); de tweede gebruiker kan met eigen account en naam aansluiten.
5. Test met twee echte accounts de aanmelding, bevestigingsmail, wachtwoordherstel en toegang voordat je de app voor privégegevens gebruikt. Dit externe traject kon zonder projectconfiguratie niet worden uitgevoerd.

Eén account hoort bij maximaal één huishouden. De eigenaar beheert items; toegewezen personen kunnen een zichtbaar item afronden/heropenen. Huishoudleden krijgen nooit automatisch toegang tot privé-items. Geselecteerde toegang en toewijzingen worden in PostgreSQL gecontroleerd, ook bij directe API-aanroepen. Een persoon kan geen uitnodigingen of huishoudleden rechtstreeks aanpassen. Veranderingen van andere gebruikers worden opgehaald via de vernieuwknop; geen realtime-synchronisatieclaim.

## Werkende functies

- Taken aanmaken, wijzigen, verwijderen, afronden en heropenen; notities, categorie, prioriteit, streefdatum en optionele nul/meerdere toewijzingen.
- Vandaag-overzicht, zoeken en filters voor open/afgerond/alles.
- Agenda met maandkalender, dagselectie en chronologische afsprakenlijst; begin/eindtijd, tijdzone en locatie. Meerdaagse afspraken worden over de betrokken dagen getoond; eindtijd om middernacht telt niet mee voor de volgende dag.
- Herinneringen met een signaal in de geopende app (controle elke 30 seconden en bij terugkeer naar het tabblad), 10 minuten uitstellen en tijdelijk verbergen. Signalen zijn per browser uit te zetten; geen achtergrondalarm.
- Meldingen binnen de app bij toewijzing/afronding, met accountvoorkeuren. Er worden alleen gerechtigde ontvangers geregistreerd; RLS verbergt meldingen zodra toegang tot het item vervalt. Gebruik Vernieuwen om nieuwe meldingen op te halen.
- Snelle plak-, URL- en deelinvoer met bewerkbaar concept. Alleen een volledige geldige `dd-mm-jjjj`-datum plus `uu:mm` wordt voorgesteld. Onvolledige of meerdere datums/tijden vereisen handmatige keuze. Niets wordt automatisch opgeslagen.
- Apple Maps, Google Maps en Waze via gecodeerde links.
- Agenda-export als `.ics` voor Apple/Google/Outlook, uitsluitend na bevestiging vanwege mogelijk privé-inhoud. Dit is een bestandsexport, geen automatische synchronisatie.
- Lokale JSON-back-ups, toetsenbordfocus en responsieve mobiele navigatie.

## Cloudflare

De bestaande Next.js-stack is behouden. Er zijn geen serverroutes nodig: Supabase verzorgt Auth en de door RLS beveiligde database. `output: 'export'` maakt statische bestanden in `out/`.

Cloudflare Pages: buildcommando `npm ci && npm run build`, outputmap `out`, Node 22+. Stel voor accountmodus de twee publieke Supabase-variabelen in bij de build. Geen Worker-adapter of databasecredential nodig. Bron: https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/.

Er is in deze oplevering geen Cloudflare-project aangemaakt of gepubliceerd. De manifest- en service-workerbestanden staan onder `public/`. De service worker cachet geen gebruikersgegevens of API-verzoeken en verwijdert de oude brede Todo-caches. Volledig offline openen en offline accountsynchronisatie zijn niet geïmplementeerd. Installatiegedrag moet nog op echte iOS-/Android-apparaten worden getest.

## Controles

```sh
npm test
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

De database-integratietest voert de echte SQL-migratie uit in PGlite (PostgreSQL), met een nagebootste `auth.uid()`-context. Deze test privé-, geselecteerde en gedeelde toegang, scheiding tussen huishoudens, niet-toegestane wijzigingen, toewijzing en eenmalige uitnodigingen. Het is geen test van Supabase Auth, e-mail of een live deployment.

## Grenzen

Push, native Siri-intents, terugkerende afspraken, externe agenda's, AI, MCP en auditlogs zijn nog niet aangesloten. Geen e-mail/WhatsApp-scraping. Verwijderen vraagt bevestiging; er is nog geen prullenbak. Google Fonts worden extern geladen met lokale lettertypefallbacks. Gebruik geen lokale opslag op een gedeeld apparaat voor gevoelige gegevens.

Zie [Shortcuts en delen](docs/integrations/SHORTCUTS_AND_SHARE.md) voor de webhandoff met Siri/Apple Shortcuts en de beperkingen van URL-invoer. Het manifest declareert een share-target; fysieke apparaatverificatie staat nog open.

Bestaande Supabase-installaties moeten ook `202610220002_notifications.sql` toepassen voordat de bijgewerkte accountmodus gebruikt wordt. Deze voegt alleen meldingen binnen de app toe; geen push of externe verzending.

Werk vindt plaats op `codex/todo-working-mvp`; main wordt niet rechtstreeks gewijzigd en een PR wordt niet automatisch gemerged.
