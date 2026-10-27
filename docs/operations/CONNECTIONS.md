# Agenda, mail en assistenten aansluiten

App: https://todo.zsj4j2s4df.workers.dev/
MCP: https://todo.zsj4j2s4df.workers.dev/mcp

De publicatie wordt vastgelegd in ISSUE_3_PROGRESS.md. Een bereikbare server betekent niet dat persoonlijke accounts al verbonden of in beide assistenten getest zijn. Er zijn geen persoonlijke provideraccounts of uitnodigingen tijdens de automatische tests gebruikt.

## Eigen account en partner

Ieder registreert zich met een eigen e-mailadres via Todo. Privégegevens en notities horen bij die Supabase-identiteit. Een huishouden koppelen deelt niet automatisch mail, agenda of inbox. Alleen expliciete toewijzingen verschijnen in de betreffende persoonlijke inbox. Bronafspraken blijven privé; alleen Todo-items hebben de deelkeuze.

Bevestigingsmail opnieuw aanvragen en wachtwoordherstel zijn beschikbaar. Beide keren terug naar de root van de Todo-site. Controleer in Supabase Authentication de Site URL en toegestane redirect-URL `https://todo.zsj4j2s4df.workers.dev/`. SMTP/senderinstellingen zijn niet leesbaar via de aangesloten Supabase-tools. Daarom zijn verzender, domeinverificatie, eventuele productiebeperkingen en daadwerkelijke bezorging nog niet bevestigd. Test registratie en herstel bewust met je eigen adres. Gebruik voor productie een geverifieerde eigen verzender indien Supabase dat vereist; geen betaald plan of persoonlijke mailhosting is gewijzigd.

## Agenda en Gmail

Instellingen → Agenda en mail verbinden. Eerst verbinden, daarna agenda's kiezen. Schrijven vereist aanvullende providerrechten én een bewuste keuze per agenda. Wijzigingen of annuleringen kunnen deelnemers informeren; de app vraagt daarvoor bevestiging. Gmail zoekt maximaal tien geselecteerde berichten en bewaart alleen zelfgekozen berichten als privénotitie. Verwerk die in Todo als gecontroleerde taak of afspraak; er wordt geen mail verzonden, verwijderd of doorgestuurd en geen bijlage opgehaald.

- iCloud: gebruik een app-specifiek wachtwoord uit https://account.apple.com/ met tweefactorauthenticatie. Vul dit uitsluitend in Todo in. Nooit het normale Apple-wachtwoord. Het serverwachtwoord staat versleuteld in Supabase Vault.
- Google Calendar/Gmail: registreer een web-OAuth-client, activeer Calendar API en Gmail API en configureer consent/testgebruikers. Exacte redirect-URI: `https://todo.zsj4j2s4df.workers.dev/`. Bewaar `GOOGLE_CLIENT_ID` en `GOOGLE_CLIENT_SECRET` uitsluitend als Supabase Edge Function-secrets. Google-verificatie en eventueel aanvullende vereisten voor de gevoelige/beperkte Gmail-scope moeten vóór brede publieke toegang worden afgehandeld. Een eigen testronde met toegelaten testaccounts kan eerder.
- Outlook privé: registreer een Microsoft-webapp die persoonlijke Microsoft-accounts accepteert. De adapter gebruikt `/consumers`, gedelegeerde `User.Read`, `Calendars.Read`, en pas na opt-in `Calendars.ReadWrite` met `offline_access`. Dezelfde exacte redirect-URI. Secrets: `MICROSOFT_CLIENT_ID` en `MICROSOFT_CLIENT_SECRET`. Geen Microsoft 365-werkaccount vereist.

Ontbrekende Google-/Microsoft-configuratie maakt de betreffende verbindknop uitgeschakeld met uitleg. Geen sleutel in chat of Git plaatsen. De bestaande OpenAI-sleutel wordt behouden; een AI-sleutel maakt geen providerregistratie of ChatGPT-/Claude-aansluiting aan.

Synchronisatie loopt ongeveer elke vijftien minuten, zeven dagen terug tot dertig dagen vooruit. Google gebruikt binnen hetzelfde UTC-dagvenster een privé opgeslagen sync-token; verlopen cursors of een nieuw dagvenster krijgen een volledige verversing. Outlook en iCloud gebruiken complete begrensde snapshots. Maximaal twintig agenda's en duizend afspraken per verbinding; overschrijding of een onvolledige fetch bewaart de vorige complete versie en toont een fout. Bronverwijderingen verdwijnen uit de actieve agenda. Bron-ID, versie en lease voorkomen kopieën en stille overschrijvingen. Verborgen bronitems blijven verborgen na sync.

De app kan één extern herhalingsmoment wijzigen/verwijderen. Wijzig de volledige externe reeks in de bronagenda. Outlook-herhalingen die het eigen maandultimo-/schrikkeldaggedrag niet exact ondersteunen worden vooraf geweigerd; kies Todo of stel ze in Outlook in. Bronagenda's bepalen hun eigen gedrag rond ontbrekende lokale kloktijden. Gekoppelde afspraken buiten het syncvenster zijn niet compleet beschikbaar voor UI/AI/MCP.

Ontkoppelen verwijdert de servercredential en stopt gebruik. Je kiest of ingelezen items verdwijnen of losse privé-items worden. Google-toestemming kan optioneel ook bij Google worden ingetrokken; dat kan andere Google-koppelingen van hetzelfde account in Todo verbreken. Voor Microsoft/Apple staat een expliciete instructie voor intrekken bij de provider. Bij netwerkproblemen kan alleen de lokale ontkoppeling worden bevestigd.

## ChatGPT en Claude

Eén remote MCP-server, OAuth authorization-code met S256/PKCE en dynamic client registration. Geen API-sleutel invullen in een assistent. Todo geeft beperkte opaque tokens uit, geen Supabase-JWT of providercredential. Leesrechten en voorstellen zijn afzonderlijk; intrekken werkt meteen. Tokenvernieuwing roteert tokens, accounttoegang verloopt uiterlijk na negentig dagen. Voorstellen verlopen na vijftien minuten.

1. ChatGPT: Plugins → plus → Add custom MCP server. Vul het MCP-adres hierboven in en kies OAuth. Account-/workspacebeleid kan deze optie beperken.
2. Claude: Settings → Connectors → Add → Add custom connector. Vul het MCP-adres in, kies aanmelden en **Register automatically** als OAuth-client. Deze server gebruikt DCR, niet Claude's published identity/CIMD. Menunamen en beschikbaarheid kunnen wijzigen.
3. Meld je aan met het eigen Todo-account, controleer de clientnaam/redirect en keur alleen de gewenste rechten goed. De partner volgt dezelfde stappen met een eigen account.
4. Vraag bijvoorbeeld: “Welke taken heb ik vandaag?” Een wijziging levert een link naar een concreet voorstel in Todo. Open die link, controleer de inhoud en bevestig met knop of exacte spraakopdracht. Het model kan geen voorstel zelf goedkeuren.

De server en accountisolatie zijn met protocol-/PostgreSQL-tests gecontroleerd. Echte aanmeldingen en toolaanroepen vanuit persoonlijke ChatGPT- en Claude-accounts zijn nog niet uitgevoerd; claim die pas na een bewuste proef. Deze connector is niet ingediend als officiële marketplace-plugin.

De PWA volstaat. Latere native apps gebruiken dezelfde backend/accounts/bron-ID's en MCP-URL. Bij een noodzakelijke wijziging van OAuth-client, callback of domein is begeleide herautorisatie vereist, met behoud van gegevens en rechten.

## Verwijderen, notities en back-up

Lokale Todo-items: bevestiging, twaalf seconden Ongedaan maken en prullenbak; herstel is privé. Notities hebben dezelfde bevestiging, herstel en definitief verwijderen vanuit de prullenbak. Een geannuleerd moment van een eigen reeks herstel je via “Overgeslagen momenten herstellen” in de reeks, niet als los gekopieerd item. Een externe bronverwijdering moet in de bron worden hersteld; lokale ontkoppeling kan een zelfstandige kopie behouden.

Ingesproken notities gebruiken dezelfde opname-/transcriptiecomponent als de assistent. Alleen bewaarde tekst komt in de inbox; audio wordt niet opgeslagen. Dagbriefing brengt onverwerkte notities terug. Instellingen bevat bewaarde/verwerkte notities, sjablonen en prullenbak. Geen geschatte taakduur of stille uren toegevoegd.

JSON-back-up v2 bevat zichtbare actieve items, alle persoonlijke notitiepagina's en geladen sjablonen; cloudprullenbak is geen onderdeel van deze export. Een lokale back-up bevat ook de lokale prullenbak. Herstel is alleen in de lokale versie beschikbaar en verwijdert externe koppelingen/deelrechten uit het bestand. Oude item-arrayback-ups blijven leesbaar. Providercredentials en assistenttokens worden nooit geëxporteerd.

## Bronnen, gecontroleerd 27 oktober 2026

- Google sync: https://developers.google.com/workspace/calendar/api/guides/sync
- Google list/syncToken: https://developers.google.com/workspace/calendar/api/v3/reference/events/list
- ChatGPT custom MCP: https://developers.openai.com/plugins/deploy/connect-chatgpt
- Claude custom MCP: https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
- Supabase tokenbeveiliging: https://supabase.com/docs/guides/auth/oauth-server/token-security
