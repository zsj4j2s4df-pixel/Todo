# Oplevering 22 oktober 2026

App: https://todo.zsj4j2s4df.workers.dev/ — Cloudflare Worker met Static Assets en beveiligde Supabase Auth/PostgreSQL. Werkbranch `codex/todo-working-mvp`, PR #2; main wordt niet automatisch gewijzigd of gemerged.

## Wat werkt

Taken, afspraken, herinneringen, privé/gedeeld/geselecteerd, nul/meerdere toewijzingen, afgeschermde huishoudens, in-app meldingen en voorkeuren, maandkalender en dagfilters, agenda-export met bevestiging, navigatielinks, snelle conceptinvoer vanuit tekst/URL/deelblad, lokale back-up/restore en een inlogpoort voor de cloudmodus. Alleen eigenaren wijzigen details; toegewezen personen kunnen afronden/heropenen via een beperkte RPC. Andere gebruikers ophalen gebeurt via Vernieuwen.

Nieuw: licht papier met koffiebruine accenten; Canva-appicoon en negen bijpassende UI-symbolen via één component. De repository bevat een verplichte icoonstijlskill en bronverantwoording. De beschikbaar gestelde Canva-bronnen zijn 200px-rasterpreviews; appformaten zijn daarvan technisch vergroot, geen vector-/hoogresolutieclaim. Een grotere Canva-export blijft wenselijk voor toekomstig groot drukwerk.

Nieuw: checklists van maximaal 50 stappen, met dezelfde itemrechten en databasevalidatie. Een dagbrief toont maximaal drie volgende stappen en signaleert echte agenda-overlap op basis van zichtbare gegevens. Deze logica gebruikt geen AI of externe accountgegevens.

Nieuw: webpush na expliciete opt-in op ieder apparaat, algemene tekst zonder privétitels, meldingen bij toewijzing/afronding, vervallen herinneringen en een optioneel ochtendseintje. Supabase Vault bewaart de serversleutels; service-role blijft uitsluitend server-side. De dispatcher controleert rechten en voorkeuren opnieuw, dedupliceert en herprobeert begrensd. Zie PUSH.md voor gedrag en beheer. Alle tien migraties zijn toegepast en hun bestandsversies zijn afgestemd op de live historie.

## Verificatie

Unit- en PostgreSQL/PGlite-tests dekken privacy, geselecteerde shares, toewijzingen, intrekken, TRUNCATE-bescherming, uitnodigingen, in-app meldingen, pushrechten, uitgeschakelde herinneringen, endpointvalidatie, deduplicatie, leases, ingetrokken toegang en verlopen abonnementen. De Supabase-only Cron/net-migratie is live gecontroleerd; de outbox wordt lokaal volledig uitgevoerd. Deno controleert de Edge-code en maakt in een protocoltest een echte VAPID/versleutelde request zonder verzending.

Live pushbeheer: Cron actief iedere minuut, drie Vault-secrets aanwezig, gewone gebruikers hebben geen dispatcherrechten. Endpoint zonder geheim geeft 401; met geldige beheersleutel 200 en nul jobs. Er zijn tijdens verificatie geen echte pushberichten of e-mails verstuurd. De oorspronkelijke live privacytest gebruikte tijdelijke fixtures die worden teruggedraaid.

Auth-callbacks wijzen nu naar de gepubliceerde URL. De beveiligingsadviseur heeft na de nieuwe migraties geen tabel-/RLS-bevindingen; er blijft een Auth-waarschuwing dat [bescherming tegen gelekte wachtwoorden](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) uitstaat. Dit is een dashboardinstelling; er is geen betaald plan of extra dienst geactiveerd. Performance heeft uitsluitend informatieve ongebruikte-indexmeldingen; relevante indexen blijven behouden.

## Open

- Echte apparaatverificatie van PWA-installatie en push op iPhone/iPad/Android/Windows, inclusief vergrendeling, Focus en afmelden. Serveracceptatie is geen bewijs van fysieke bezorging.
- Persoonlijke registratie, bevestigingsmail, herstelmail en een tweepersoons-loginflow; geen testmails naar echte personen sturen.
- Terugkerende taken/afspraken, huisgenotenbeheer, prullenbak, auditlog en volledige offline/realtime-synchronisatie.
- Mail-/agenda-OAuth, WhatsApp Business, remote MCP en een externe connector-API. Zie INTEGRATIONS.md voor prioriteit, scope en acceptatie. De bestaande ICS-export en conceptinvoer zijn geen automatische providerkoppeling.

Er staan geen secrets, service-rolekeys of gebruikersgegevens in Git. Externe berichten blijven onbetrouwbare conceptinvoer; de app slaat ze niet automatisch op. Google Fonts gebruikt externe downloads met lokale fallbacks. Clouddata wordt niet door de service worker gecachet.

## Aanvulling: kronkelige huisstijl, weer en OpenAI

Alle negen UI-iconen, het appicoon en de penkaders zijn opnieuw met Canva gemaakt met duidelijk kronkelige lijnen zonder liniaal. AGENTS.md en de stijlskill gelden ook voor kaders en scheidingslijnen. De bronbestanden, media-ID’s, hashes en technische omzetting staan in Git. Native browserbediening en zichtbare toetsenbordfocus blijven toegankelijk.

Briefingvoorkeuren zijn persistent per account: eigen tijd, inhoud, weerplaats en twee algemene weermomenten. Open-Meteo levert dagtemperaturen, regenkans en wind. Push kan de gekozen verwachtingen meesturen; geen privétitels. Er is geen automatische weerplaats per afspraak gekoppeld.

OpenAI-assistent en transcriptie zijn als Edge Function gepubliceerd. Typen, inspreken, apparaatstem en bevestigde beheeracties zijn gebouwd. De AI zoekt via RLS in alle zichtbare iteminhoud en maakt bewerkbare voorstellen. De bestaande sleutel is door de gebruiker als geactiveerd gemeld; er is geen sleutel uitgelezen of gepubliceerd en geen betaald modelverzoek door de tests gedaan. Zie AI.md voor de precieze testgrens en de nog niet gebouwde OpenAI Realtime-modus.

Laatste lokale controle: 29 unit-/PostgreSQL-tests en 18 lokale browsertests slagen. Cloudcontroles testen aanvullend een AI-voorstel met volledig onderschepte synthetische API-fixtures; ze testen geen echte modelrespons of microfoon.

Publicatieverificatie: broncommit `d5ee65e` staat live met Cloudflare deployment `e6db5b1b23d54a01a20c1ff117485264`. De zes cloudbrowsertests slagen ook tegen de publieke URL op desktop en mobiel. Microfoontoestemming voor de eigen oorsprong en de twee weer-API-origins staan in de live securityheaders. De extra Deno-Web-Push-protocoltest slaagt zonder verzending. PR #2 is bijgewerkt; main is niet gemerged.

## Vervolg 23 oktober 2026

Gebouwd: kort OpenAI Realtime-gesprek met RLS-toolbrug, gesproken bevestiging, stop-/uitlog-/navigatie-opruiming en server-cleanup; herhaling van taken/herinneringen na afronden met behoud van lokaal tijdanker; bevestigde, gededupliceerde privé-import van losse .ics-afspraken. Zie LIVE_AND_ROUTINES.md. De eerdere opmerking dat doorlopend Realtime nog niet gebouwd was, is hiermee vervallen; de echte provider-/apparaatproef blijft open.

Nog te regelen buiten de beschikbare sessie: persoonlijke microfoon/WebRTC/push-tests, providerkeuze en OAuth/CalDAV-gegevens voor automatische mail-/agendasynchronisatie, Meta-inrichting voor WhatsApp Business en OAuth-inrichting voor publieke MCP-clientkoppelingen. Er is geen extra provideraccount of betaald plan geactiveerd en main blijft ongemerged.
