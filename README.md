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

1. Maak een Supabase-project en voer alle bestanden in `supabase/migrations/` eenmalig op volgorde van bestandsnaam uit in de SQL-editor. De migraties veronderstellen Supabase Auth en beperken zelf expliciet de tabel- en functierechten.
2. Kopieer `.env.example` naar `.env.local`. Vul de project-URL en de publieke publishable key (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) in. Gebruik **nooit** een service-role/secret key. Beide variabelen worden tijdens de frontendbuild verwerkt.
3. Stel in Supabase Auth de Site URL en toegestane redirect-URL in op het daadwerkelijke app-adres. Schakel e-mailbevestiging in en configureer mailbezorging voordat je accounts beschikbaar stelt.
4. Herstart de developmentserver of maak een nieuwe productiebuild. Maak een account en log in. Maak in Instellingen een huishouden aan. De eigenaar kan een eenmalige uitnodigingscode genereren (24 uur geldig); de tweede gebruiker kan met eigen account en naam aansluiten.
5. Test met twee echte accounts de aanmelding, bevestigingsmail, wachtwoordherstel en toegang voordat je de app voor privégegevens gebruikt. De live database is gecontroleerd; registratie, bevestigingsmail en wachtwoordherstel met echte personen blijven nog te verifiëren.

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

De app is gepubliceerd als Cloudflare Worker met Static Assets:

**https://todo.zsj4j2s4df.workers.dev/**

`wrangler.jsonc` is de configuratie. Op een machine met Cloudflare-CLI-toegang: `npm ci`, vul de publieke Supabase-bouwvariabelen in en voer `npm run deploy` uit. Dit bouwt de bestaande statische Next.js-app en publiceert de output uit `out/`. Het kleine Worker-script geeft verzoeken door aan de ASSETS-binding; er staan geen databasegeheimen in de Worker. De eerste publicatie is via de gekoppelde Cloudflare-app en een tijdelijke asset-uploadsessie gedaan.

De live homepage, headers, scripts, mobiele/desktop-inlogpoort en ontvangst van gedeelde concepten zijn gecontroleerd. Accountgegevens worden rechtstreeks door Supabase Auth en RLS beveiligd. Verzoeken worden met geredigeerde querystrings gelogd. De server levert veiligheidsheaders; de service worker cachet geen gebruikersdata. Volledig offline openen en offline accountsynchronisatie zijn niet geïmplementeerd. Installatiegedrag moet nog op echte iOS-/Android-apparaten worden getest.

**Nog één dashboardinstelling voor e-mailcallbacks:** in Supabase Auth → URL Configuration staat de Site URL nog op `http://localhost:3000`. Zet die op `https://todo.zsj4j2s4df.workers.dev/` voordat je bevestigings- en herstelmails gebruikt. De beschikbare Supabase-tools kunnen deze Auth-configuratie niet wijzigen. Er zijn geen echte registratie-/herstelmails verstuurd als onderdeel van de publicatie.

## Controles

```sh
npm test
npm run build
npm run typecheck
npx playwright install chromium
npm run test:e2e
```

De lokale database-integratietest voert alle SQL-migraties uit in PGlite (PostgreSQL), met een nagebootste `auth.uid()`-context. Deze test privé-, geselecteerde en gedeelde toegang, scheiding tussen huishoudens, niet-toegestane wijzigingen, toewijzing en eenmalige uitnodigingen. Daarnaast is `supabase/tests/live_privacy.sql` op de echte Supabase-database uitgevoerd; tijdelijke auth-fixtures, huishoudens en items worden binnen één transactie teruggedraaid. Het is geen test van e-mailbezorging of een live frontenddeployment.

## Grenzen

Push, native Siri-intents, terugkerende afspraken, externe agenda's, AI, MCP en auditlogs zijn nog niet aangesloten. Geen e-mail/WhatsApp-scraping. Verwijderen vraagt bevestiging; er is nog geen prullenbak. Google Fonts worden extern geladen met lokale lettertypefallbacks. Gebruik geen lokale opslag op een gedeeld apparaat voor gevoelige gegevens.

Zie [Shortcuts en delen](docs/integrations/SHORTCUTS_AND_SHARE.md) voor de webhandoff met Siri/Apple Shortcuts en de beperkingen van URL-invoer. Het manifest declareert een share-target; fysieke apparaatverificatie staat nog open.

Bij een bestaande andere installatie: pas uitsluitend nog niet toegepaste migraties toe, op volgorde. De meldingenmigratie voegt geen push of externe verzending toe; de API-rechtenmigratie is ook vereist. Het hieronder genoemde live project is al volledig gemigreerd.

Werk vindt plaats op `codex/todo-working-mvp`; main wordt niet rechtstreeks gewijzigd en een PR wordt niet automatisch gemerged.

## Aangesloten Supabase-project

Project `pyqvxwxpsngbndkrlajz` (Frankfurt, `eu-central-1`) is ingericht op 22 oktober 2026. Alle drie migraties zijn toegepast. De versies in deze repository komen overeen met de geretourneerde live migratiehistorie. Voer migraties niet nogmaals handmatig uit op dit al ingerichte project.

De lokale `.env.local` is ingevuld met uitsluitend de project-URL en een publieke publishable key; deze staat niet in Git. De gepubliceerde frontend is al met die publieke bouwvariabelen gebouwd; bij herpublicatie moeten ze opnieuw in de bouwomgeving beschikbaar zijn. De oude variabelenaam `NEXT_PUBLIC_SUPABASE_ANON_KEY` blijft als fallback ondersteund. Interne helpers staan in schema `private`; voeg dit schema niet toe aan de Data API exposed schemas.

Voor lokale-modusbrowsertests: bouw zonder publieke Supabase-variabelen (bijvoorbeeld `NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY= NEXT_PUBLIC_SUPABASE_ANON_KEY= npm run build`) en voer `npm run test:e2e` uit. Bouw daarna opnieuw met je gewone configuratie. `npm run test:cloud` controleert de inlogpoort tegen de geconfigureerde productie-export op desktop en mobiel; het maakt geen accounts aan en verstuurt geen e-mails.

Live browsercontroles: `TODO_TEST_URL=https://todo.zsj4j2s4df.workers.dev npm run test:cloud`. Dit voert de vier accountpoort-/concepttests uit tegen de gepubliceerde site zonder accounts aan te maken of e-mails te versturen.
