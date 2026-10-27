# Oplevering 27 oktober 2026

App: https://todo.zsj4j2s4df.workers.dev/
Connector: https://todo.zsj4j2s4df.workers.dev/mcp

De bestaande taken, privacy, agenda, herinneringen, weerbriefing, push en tekst-/spraak-AI zijn uitgebreid met de bouwopdracht uit issue #3. De gebruiker heeft toestemming gegeven voor publicatie en samenvoegen via PR #2. De actuele publicatie-/mergecontrole staat in ISSUE_3_PROGRESS.md.

## Nieuw gebouwd en gepubliceerd

- Persoonlijke inbox per account: getypte/ingesproken notities, zelf geselecteerde Gmail-berichten en expliciet toegewezen taken. Delen verleent geen impliciete toegang tot de inbox of bronaccounts van een partner.
- Dagelijkse terugkeer van onverwerkte notities, subtiele wekelijkse opruimronde, boodschappenlijsten met gedeelde rechten, lijstsjablonen, uitstellen naar gekozen datum en Canva-ontvangericoontjes.
- Verwijderbevestiging, tijdelijk Ongedaan maken, prullenbak en privéherstel. Notes kunnen definitief uit de prullenbak worden verwijderd. Geannuleerde reeksinstanties zijn herstelbaar vanuit de reeks.
- Eén agenda-editor via het kalenderplusje met geselecteerde dag. Verjaardag/vakantie, hele dagen met exclusieve einddatum, zes herhaalfrequenties, reeksen/uitzonderingen en vrije blokken in de bestaande agenda. Vrij gemarkeerde bronafspraken en verjaardagen blokkeren geen tijd.
- iCloud/CalDAV, persoonlijk Outlook/Graph, Google Calendar en Gmail: echte provideradapters, OAuth/PKCE waar passend, account-/agendaselectie, versleutelde Vault-credentials, status, herautorisatie en ontkoppelen. Schrijven per agenda na expliciete opt-in en bronversiecontrole. Google sync-token/fallback; overige providers volledige snapshots.
- Remote MCP met eigen accounttoestemming, scopes, tokenrotatie, intrekking en concrete wijzigingsvoorstellen. Alleen een ingelogde gebruiker kan een voorstel uitvoeren. Het model krijgt geen Supabase-JWT, service key of providercredentials.
- Bestaande AI kan nu ook persoonlijke notities zoeken en een notitie voorstellen. Getypeerde en gesproken bevestiging blijven verplicht. Dezelfde accountrechten gelden voor app, AI, MCP en providerjobs.
- Instellingenstatus voor koppelingen/apparaat; bevestigingsmail opnieuw aanvragen en terugkeerlinks voor registratie/herstel. JSON-back-up v2 voor items, notities en sjablonen; lokaal privéherstel en compatibiliteit met oudere item-back-ups.

## Publicatie en verificatie

Broncode: `18a4962`; Cloudflare deployment `f8e39d298b4d4a6ca6a51574300f2536`. Negentien migraties zijn toegepast. Actieve Edge Functions: `todo-connect` v2, `todo-mcp` v2, `todo-ai` v3 en `push-dispatch` v6. De migratiebestandsversies zijn gelijkgetrokken met de live historie.

54 unit-/PostgreSQL-tests, 19 Deno-protocoltests, 28 lokale browsertests en 14 accountbrowsertests slagen. De 14 accounttests slagen ook tegen de publieke site met synthetische, onderschepte backend-/modelaanroepen. Typecheck, productiebuild en Canva-provenancecontrole slagen. Mobiele/desktopagenda's zijn visueel gecontroleerd. npm audit productie: nul kwetsbaarheden.

De aanvullende live transactietest `supabase/tests/live_workspace_privacy.sql` slaagt met tijdelijke fixtures en volledige rollback, inclusief echte Vault-opslag, notitieconversie/herstel en providerisolatie. Homepage-buildhash, ontvangericoon, OAuth/MCP-discovery en 401 zonder aanmelding zijn publiek gecontroleerd.

Live databasecontrole bevestigt RLS op de nieuwe tabellen en service-only toegang tot MCP-/providerhelpers. De Supabase-securityadviseur heeft geen nieuwe tabel-/RLS-bevindingen. De al bestaande Auth-waarschuwing blijft: [bescherming tegen gelekte wachtwoorden staat uit](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Geen betaald plan of persoonlijke mailhosting is gewijzigd.

## Nog persoonlijk activeren of verifiëren

Google-/Microsoft-OAuth-appregistraties en eventuele providerverificatie, eigen providerautorisatie/agenda's, registratie-/herstelmail en echte spraak-/WebRTC-/pushbezorging op eigen apparaten. SMTP/senderconfiguratie is niet uitleesbaar via de beschikbare Supabase-tools. Er is geen echte mail, uitnodiging of betaalde AI-inferentie tijdens de automatische tests verstuurd.

MCP-serverprotocol en accountisolatie zijn getest; persoonlijke ChatGPT- en Claude-aanmeldingen zijn nog niet uitgevoerd. Een bestaande OpenAI-API-sleutel activeert deze custom connectors niet automatisch. Zie [aansluitinstructies en begrenzingen](CONNECTIONS.md).

De sync toont zeven dagen terug tot dertig dagen vooruit, maximaal duizend bronafspraken per verbinding. Hele externe reeksen wijzigen gebeurt in de bronagenda; Todo bewerkt één moment. Notities worden eerst naar een privé-Todo-item geconverteerd. Voor afwijkende herhalingssemantiek wordt geen stilzwijgende vertaling naar Outlook gedaan.

Native apps/storepublicatie, WhatsApp Business, volledige offline cloudschrijfqueue en automatische live updates tussen apparaten vallen buiten deze oplevering. Vernieuwen haalt veranderingen van andere appgebruikers op. De MCP-/providerbackend is onafhankelijk van een latere native frontend; accounts en rechten worden hergebruikt.
