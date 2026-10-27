# Uitvoering issue 3

Bron: https://github.com/zsj4j2s4df-pixel/Todo/issues/3, vastgelegd 26 oktober 2026. Volledige opdracht: ISSUE_3_SPEC.md.

Werkbranch: codex/todo-working-mvp; PR #2. Main niet wijzigen of mergen.

## Bouwvolgorde

1. Databasis: soft delete/herstel, notities en persoonlijke inbox, sjablonen en boodschappen, gedeelde autorisatie. Acceptatie: echte PostgreSQL-rechtentests voor twee accounts.
2. Agenda/invoer: één contextuele toevoegflow, hele dagen/verjaardag/vakantie, geplande reeksen en extra routinefrequenties, vrije tijdblokken. Acceptatie: datum-/zomertijdtests en mobiele/desktopflows.
3. Overzicht: inbox/dagbriefing, wekelijkse opruimronde, labels/Canva-icoontjes, uitstellen en instellingenstatus. Acceptatie: persistentie, accountwissel en rechten.
4. Providers: Google Calendar/Gmail, Microsoft Graph, iCloud CalDAV; OAuth, beveiligde credentials, sync en bewuste terugschrijfkeuze. Acceptatie: begrensde protocoltests zonder echte externe verzending; persoonlijke autorisatie als livegrens.
5. MCP: één OAuth-beveiligde remote server, dezelfde lees-/voorstel-/bevestigingsservices, installatie-instructies. Acceptatie: protocol, account/scopetests, intrekking en replay.
6. Auth/mail: callbacks, herstelflow, verificatiemail opnieuw aanvragen, actuele configuratie en eventuele SMTP-activering. Echte mails alleen tijdens een bewuste persoonlijke proef.
7. Testen/publicatie: typecheck, productiebuild, relevante tests, actuele documentatie en PR. Gebouwd, gesimuleerd getest en werkelijk verbonden afzonderlijk rapporteren.

## Activeringsgrenzen

Nog geen providerautorisaties of SMTP-instellingen in deze taak opgegeven. Werk alle onafhankelijke onderdelen af vóór vragen hierover. Geen credentials in chat of Git. Native apps zijn een latere compatibiliteitseis, geen onderdeel van deze bouwopdracht.

## Voortgang

- Bouwspecificatie opgehaald en vastgelegd; de bestaande app is behouden op dezelfde featurebranch.
- Gebouwd in code: soft delete met privéherstel, persoonlijke notities/inbox, expliciete toewijzingslabels, sjablonen, vergrendelde boodschappenmutaties, kalenderplusje, hele dagen, verjaardag/vakantie, uitgebreide routines en agendareeksen met uitzonderingen, vrije blokken, wekelijkse opruimronde en apparaatstatus.
- Canva-bron voor ontvangers: MAHZIu0YWMs, 200px rasterpreview; mechanische crops via build-icons.py. Geen vectorclaim.
- Gebouwd in code: OAuth/PKCE voor Google/Microsoft, CalDAV/iCloud, Vault-opslag en leases, begrensde volledige kalendersnapshots, Gmail-selectie naar privénotities en bronversiechecks voor terugschrijven. Nieuwe providerregistraties nog niet aanwezig/geactiveerd.
- Verificatie tot nu: 10 bestaande accountbrowsertests slagen op de productiebuild met onderschepte API-fixtures. Acht nieuwe Deno-providerprotocoltests slagen zonder netwerktoegang. Uitgebreide unit-/databasetests draaien; nieuwe UI-flows moeten nog volledig in de browser worden gecontroleerd.
- Nog niet gepubliceerd: de huidige bronwijzigingen en migraties. De vorige gepubliceerde versie blijft live.
- Volgende stap: MCP/OAuth-server en bevestiging in de app, met opaque scoped tokens (geen Supabase-JWT uitdelen aan assistentclients), vervolgens integrale tests en live inrichting/publicatie.
- Architectuurkeuze MCP: Supabase OAuth-JWTs geven zonder extra RLS/hookconfiguratie dezelfde Data API-mogelijkheden als appgebruikers; zie Supabase token-security. Daarom krijgt de custom MCP-server aparte beperkte opaque tokens en een eigen consentflow bovenop de bestaande Supabase-login. Schrijven vereist een geauthenticeerde bevestiging in de app. Core Item-validatie, datumlogica en briefing worden mechanisch uit lib/ gegenereerd voor de Deno-runtime; geen tweede handgeschreven contract.
- Bekende werkpunten voor afronding: note-to-provider conversie atomair/idempotent afhandelen, providerherroepen waar ondersteund, paginering voor oudere notities/prullenbak, regressie bij mailbox-/agenda-ID's, externe metadata niet bewerkbaar tonen, alle nieuwe flows testen.

## Voorbereiding publicatie, 27 oktober 2026

- De hierboven genoemde volgende stappen zijn inmiddels geïmplementeerd. MCP bevat eigen consent, scoped opaque tokens, intrekking en bevestiging via dezelfde editor; getypeerde en gesproken notities zijn ook via de bestaande AI beschikbaar.
- Google gebruikt nu incrementele sync binnen een vast UTC-dagvenster, met complete fallback bij verlopen cursor en een nieuw dagvenster. Cursor/snapshot en itemwijzigingen worden onder dezelfde lease atomair opgeslagen. Microsoft/iCloud gebruiken complete snapshots.
- Notities/prullenbak hebben paginering; directe accountwisseling wist privéconcepten. JSON-back-up v2 en privé lokaal herstel toegevoegd. Bij conversie van notities wordt eerst een private Todo-afspraak gemaakt; de externe doelkeuze wordt daar niet aangeboden.
- Verificatie: 54 unit-/PostgreSQL-tests, 18 Deno-protocoltests, 28 lokale en 14 accountbrowsertests geslaagd. De twee aangescherpte PostgreSQL-tests voor cache-isolatie/rollback en smallere OAuth-refreshscopes slagen ook. Typecheck/productiebuild slagen; npm-productieaudit: nul kwetsbaarheden. Mobiele en desktopagenda visueel bekeken; Canva-provenance/hash/registratie gecontroleerd.
- Geen echte mails, uitnodigingen, pushproef of betaalde AI-inferentie verstuurd. OAuth in persoonlijke clients en volledige spraak-/pushproef op eigen apparaten blijven persoonlijke acceptatie.
- Gebruiker heeft in deze sessie expliciet toestemming gegeven voor publicatie én samenvoegen naar main. Werk blijft via PR #2 lopen.
- Zie CONNECTIONS.md voor activering, huidige provider-/exportgrenzen en native compatibiliteit. SMTP-configuratie is niet uitleesbaar via de beschikbare connector; verzending niet als gecontroleerd presenteren.
- Volgende handeling: vijf geteste migraties toepassen, vier Edge Functions publiceren, Cloudflare-assets/Worker publiceren, live metadata/auth-afwijzing controleren en PR samenvoegen na geslaagde checks.

## Publicatie voltooid, 27 oktober 2026

- Cloudflare deployment `f8e39d298b4d4a6ca6a51574300f2536`; frontendbuild uit `18a4962`, ontvangerassets uit de vastgelegde Canva-bron. App https://todo.zsj4j2s4df.workers.dev/ en MCP https://todo.zsj4j2s4df.workers.dev/mcp zijn publiek bereikbaar.
- Alle vijf nieuwe migraties toegepast; negentien in totaal. Lokale versies zijn gelijk aan de live migratiehistorie.
- Actief: todo-connect v2, todo-mcp v2, todo-ai v3 en push-dispatch v6. De extra CalDAV-regressietest voorkomt dubbele uitzonderingen bij UTC versus lokale recurrence-ID's; daarmee slagen negentien Deno-protocoltests.
- De veertien accountbrowsertests slagen ook op de publieke URL met onderschepte synthetische API's. Homepage is bytegelijk aan de gecontroleerde productiebuild. Ontvangericoon/discovery leveren 200; MCP, provider-, AI- en dispatchendpoint geven zonder aanmelding 401.
- `live_workspace_privacy.sql` slaagt op echte Supabase: accountisolatie, notitieconversie/idempotentie, soft delete/privéherstel, service-only helpers, daadwerkelijke Vault-opslag, snapshot/cache en opruimen bij ontkoppelen. Synthetische accounts/data volledig teruggedraaid, geen externe verzoeken.
- Supabase-advisor: geen nieuwe tabel-/RLS-bevindingen; bestaande waarschuwing gelekte-wachtwoordbescherming blijft gedocumenteerd. Er zijn geen persoonlijke providerverbindingen door de tests aangemaakt.
- Samenvoegen gebeurt via de expliciet goedgekeurde PR #2; de uiteindelijke merge-SHA en status zijn te volgen in GitHub. Persoonlijke aanmelding, providerregistratie/verificatie en echte mail-/spraak-/pushproeven blijven activeringsgrenzen, geen gesimuleerde succesclaims.
