# Oplevering 22 oktober 2026

De oorspronkelijke rootbestanden zijn op de juiste Next.js-locaties gezet. Tailwind was niet geïnstalleerd; de nieuwe interface gebruikt gewone CSS met centrale papier/inkt/geel-tokens, Caveat en Patrick Hand. Bronnen: Let's Brew house-style SKILL.md, PanKlaar index.html en Kasboek index.html; oudere Kasboek-brief wijkt af van de huidige broncode. Het koffie-specifieke gedrag en Engelstalige UI uit de referenties zijn niet overgenomen.

Fase 1 is gebouwd met lokale persistentie. Fasen 2–4 hebben clientfunctionaliteit plus een Supabase-migratie voor accounts, huishoudens en RLS; de live database is inmiddels ingericht en getest; daadwerkelijke aanmelding en e-mailbezorging vragen nog verificatie met echte accounts. Agenda heeft een maandkalender, dagselectie en chronologische lijst. Herinneringen tonen in de geopende app een vervallen-signaal met 10 minuten uitstellen; geen achtergrondmeldingen. Snelle invoer en navigatielinks werken zonder AI. Fase 5 heeft meldingen binnen de app en accountvoorkeuren, zonder pushbezorging. Fase 7 is niet geïmplementeerd. Een Shortcuts-webhandoff en GET-share-target zijn gebouwd en gedocumenteerd; apparaatverificatie staat nog open.

De architectuur is de al voorgestelde PostgreSQL/Supabase-richting met statische Next.js-export voor Cloudflare Pages. Geselecteerde shares en toewijzingen zijn UUID-arrays op items in plaats van losse tabellen. RLS bepaalt leesrechten; een databasetrigger valideert dat alle personen huishoudenlid zijn en toegewezen personen toegang hebben. Alleen de eigenaar kan details wijzigen/verwijderen. Toegewezen gebruikers kunnen afronden via een begrensde RPC. Er wordt geen database-RLS door clientlogica vervangen.

Buiten bereik: auditlog, lid verwijderen/huishouden verlaten, realtime abonnementen, pushbezorging, herhaling, providerkoppelingen en live hosting. Geen secrets of service-rolecredentials toegevoegd. Zie README voor configuratie en beperkingen.

## Verificatie

- `npm run build`: statische productie-export slaagt.
- `npm run typecheck`: slaagt.
- `npm test`: 22 tests slagen, inclusief uitvoering van de echte RLS-migratie in PostgreSQL/PGlite.
- `npm run test:e2e`: 14 tests slagen op desktop (1440 px) en mobiel (390 px), ook tegen de productie-export.
- `npm audit --omit=dev`: 0 kwetsbaarheden na expliciete PostCSS 8.5.31 / Sharp 0.35.5 overrides; overrides opnieuw beoordelen bij een Next.js-upgrade.
- Desktop- en mobiele screenshots visueel gecontroleerd; CI voert de functionele controles opnieuw uit bij een PR.
- Niet geverifieerd: daadwerkelijke Supabase-aanmelding/e-mailbezorging, echte gedeelde browsersessies, Cloudflare-deployment, fysieke iPhone/iPad/Android-installatie en platformmeldingen.

Aanvulling: `.ics`-export met bevestiging, UTC-tijden, stabiele identifiers en ontsnapte/gevouwen tekstvelden. Asynchrone accountverzoeken kunnen na uitloggen of accountwissel geen oude gegevens terugplaatsen; dit is apart getest, ook bij terugkeer naar hetzelfde account.

Nieuwe migratie: `20261022185936_todo_notifications.sql` voegt ontvangergebonden meldingen en voorkeuren toe. Triggers registreren nieuwe toewijzingen en afrondingen, respecteren voorkeuren en slaan geen titel/privédetails op. RLS vereist ook bij lezen en als gelezen markeren nog actuele toegang tot het item. De PostgreSQL-test controleert afgeschermde meldingen, ingetrokken rechten, voorkeuren, vervalsing van meldingen en kolomrechten. Deze migratie is inmiddels toegepast op het hieronder genoemde live project.

## Live Supabase-aansluiting

Project `pyqvxwxpsngbndkrlajz` was leeg en is ingericht met de migraties `20261022185927_todo_foundation`, `20261022185936_todo_notifications` en `20261022190135_todo_api_permissions`. Bestandsversies zijn afgestemd op de door Supabase geretourneerde migratiehistorie. De laatste migratie beperkt expliciet tabelrechten (waaronder geen TRUNCATE), plaatst interne functies in het niet-publieke schema private en biedt beperkte invoker-RPC-wrappers voor de app. Indexen en RLS-initplans zijn verbeterd.

De live beveiligingsadviseur meldt geen bevindingen. De performanceadviseur meldt alleen nog ongebruikte indexen op dit nieuwe lege project; die blijven bewust behouden. De live privacytest slaagt voor afscherming, toewijzing, afronding, meldingen, intrekken van toegang en TRUNCATE-bescherming. Alle fixtures zijn teruggedraaid; er zijn geen gebruikersaccounts of testitems achtergebleven. De app is lokaal geconfigureerd met een publieke publishable key, zonder service-rolekey. Hosting, e-mailbezorging en een daadwerkelijke tweepersoons-loginflow blijven nog open.

De publieke Auth-settings bevestigen dat e-mailaanmelding beschikbaar is en bevestiging vereist. De Data API weigert anonieme taaktoegang met HTTP 401. De frontend-inlogpoort wordt gecontroleerd op mobiel en desktop; er zijn geen bevestigingsmails verzonden.

## Publicatie

Gepubliceerd op **https://todo.zsj4j2s4df.workers.dev/** als Worker `todo` in het bestaande Cloudflare-account. De statische Next.js-export is via een korte asset-uploadsessie geladen. De Worker gebruikt alleen de ASSETS-binding; account-/databaseverkeer gaat naar Supabase. `wrangler.jsonc`, het kleine doorgeefscript, headers en een herhaalbaar deploycommando staan in Git. De eerste live versie is gebaseerd op commit `db4e20f`; de daaropvolgende commit werkt alleen documentatie en de live-testconfiguratie bij.

HTTP 200 en de securityheaders zijn live geverifieerd. Alle vier accountmodus-browsertests slagen ook tegen de publieke URL op mobiel en desktop. Productiebuild, typecheck, Wrangler dry-run en npm audit voor productiedependencies slagen.

De live Supabase-verificatie-endpoint bevestigt dat een e-mailcallback nog naar `http://localhost:3000` terugvalt. Site URL moet in Supabase Auth → URL Configuration op de gepubliceerde URL worden gezet. Dit specifieke configuratie-endpoint ontbreekt in de gekoppelde Supabase-tools. Er zijn geen e-mails verstuurd, geen private gebruikersgegevens gepubliceerd en geen wijzigingen naar main gemerged. Push, AI/MCP, externe agenda's en fysieke apparaattests zijn nog niet toegevoegd aan deze publicatie.
