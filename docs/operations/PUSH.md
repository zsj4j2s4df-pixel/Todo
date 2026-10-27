# Webpush

## Gebruik

Log in, open Instellingen en kies Push inschakelen op ieder gewenst apparaat. Geef de browser toestemming. iPhone/iPad: iOS/iPadOS 16.4+, voeg de app eerst aan het beginscherm toe en open haar daar. Android/Windows: gebruik een recente browser met Push API. Platform-/Focusinstellingen en netwerk bepalen de uiteindelijke levering. Dit is geen exacte wekker.

Een apparaat ontvangt nieuwe toewijzingen/afrondingen volgens accountvoorkeuren en geplande herinneringen volgens de apparaatvoorkeur. Een optioneel ochtendseintje op je ingestelde tijd opent het dagoverzicht. Op het vergrendelscherm staan geen taaknamen, beschrijvingen of afspraaktitels. Uitloggen meldt dit browserapparaat af; andere apparaten blijven afzonderlijk gekoppeld. Browsertoestemming intrekken kan ook via de apparaatinstellingen.

## Architectuur

- Frontend: `PushSettings`, uitsluitend expliciete browser-opt-in. `push_subscriptions` heeft eigen-gebruiker-RLS, minimale tabelrechten, endpoint-allowlist, formaat- en tijdzonevalidatie. Geen privé-VAPID-key in frontend.
- Service worker cachet geen accountdata en verwerkt push/notificationclick. De klik opent uitsluitend de eigen oorsprong. Payloadteksten komen uit een vaste lijst.
- Supabase Cron controleert iedere minuut, maar maakt geen HTTP-aanroep zonder abonnementen. De vast ingestelde Edge Function wordt via pg_net met een Vault-token aangeroepen. `net` is niet toegankelijk voor anonieme of gewone accountrollen.
- `push-dispatch`: eigen dispatch-key-authenticatie; daarom staat gateway JWT-controle uit. De functie gebruikt de ingebouwde server-side service_role om een uitsluitend daarvoor toegestane RPC aan te roepen. De RPC controleert ook het gedeelde geheim; gewone gebruikers kunnen haar niet aanroepen.
- Sleutels in Supabase Vault: `todo_push_dispatch_key`, `todo_push_vapid_public`, `todo_push_vapid_private`. De frontendbuild gebruikt alleen de overeenkomstige `NEXT_PUBLIC_WEB_PUSH_VAPID_KEY`. Sleutelwaarden staan niet in Git, migraties of rapporten. Bij herinstallatie moeten een beheerder of beveiligd deploymentscript de Vault-waarden vooraf aanmaken; roteer VAPID niet zonder bestaande browsers opnieuw aan te melden.
- Private outbox: deduplicatie per abonnement/gebeurtenis, maximaal vijf pogingen, claimlease vijf minuten, begrensde batches en retentie zeven dagen. Bij iedere claim worden zichtbaarheid, actuele toewijzingen en voorkeuren opnieuw getoetst. Ingetrokken shares en verplaatste/afgeronde herinneringen worden verworpen. Een veranderde herinnering krijgt een nieuwe sleutel.
- Alleen nieuwe gebeurtenissen na abonnement worden aangeboden; herinneringen maximaal 24 uur te laat. Een briefingseintje wordt alleen in het uur na de gekozen accounttijd aangeboden en per dag gededupliceerd.
- Push-endpoints moeten HTTPS en een ondersteunde provider zijn; geen redirects of willekeurige hosts. HTTP 404/410 verwijdert een vervallen abonnement, 429/5xx krijgt een retry. Provideracceptatie betekent nog geen fysiek getoonde melding. Een verloren ontvangstbevestiging kan tot een herhaling leiden; de notificatietag voorkomt meerdere losse kaarten waar het platform dit ondersteunt.

## Beheer en verificatie

De deploy op 22 oktober 2026 is ingericht met bestaande Supabase-resources, Vault, pg_cron en pg_net. Er is geen nieuw betaald project of plan geactiveerd. Dienstgebruik valt onder de bestaande providerquota en eventuele verbruikskosten.

- SQL-migraties worden lokaal in PGlite getest, behalve de Supabase-specifieke Cron/net-installatie. De outbox zelf en de rechten worden volledig uitgevoerd.
- Tests: eigen abonnementen, geen toegang tot andere gebruikers, vervalste eigenaar, ongeldige provider, dispatchrechten, ongeldig token, uitgeschakelde herinneringen, deduplicatie, claims, ingetrokken shares en verlopen abonnementen.
- Deno-protocoltest genereert een echte versleutelde Web Push-request en VAPID-header zonder netwerkverzending: `npx deno test --allow-env=ECE_KEYLOG --no-lock --node-modules-dir=none supabase/functions/push-dispatch/protocol_test.ts`.
- Live: ontbrekende toegangssleutel geeft 401, geldige beheersleutel geeft 200 met nul jobs; Cron is actief en Vault heeft de drie vereiste secrets. Geen echte push naar een apparaat verstuurd tijdens deze controles.
- Nog fysiek te testen: opt-in, gesloten app, vergrendeld scherm, Focus, tijdzone, uitzetten, uitloggen en herinstalleren op iPhone/iPad en Android/Windows.

Stoppen kan veilig door Cron-job `todo-push-every-minute` te pauzeren. Verwijder geen gebruikersabonnementen voor een tijdelijke pauze. Nieuwe ontvangers, uitgaande mail of WhatsApp staan los van deze implementatie en worden hierdoor niet geactiveerd.

Briefingvoorkeuren staan in `brief_preferences` met eigen-gebruiker-RLS: tijd, tijdzone, getoonde onderdelen, optionele weerplaats en twee weermomenten. Het weer staat standaard uit. Na opt-in haalt Open-Meteo de gekozen plaats op; bij een briefingpush kan de dispatcher dezelfde uurverwachtingen meesturen. Het seintje bevat geen taak-/afspraaktitels. Uitgeschakelde of oudere dagjobs worden bij claim opnieuw verworpen. Tijd wijzigen veroorzaakt geen tweede seintje als er die lokale dag al één is aangeboden.
