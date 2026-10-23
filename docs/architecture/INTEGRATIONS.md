# Todo-koppelingen — volgorde en grenzen

Doel: minder zelf onthouden, zonder automatisch je hele mailbox of privéagenda met je huishouden te delen. Dit document beschrijft voorstellen; onderstaande externe diensten zijn nog niet gekoppeld.

| Prioriteit | Koppeling                           | Wat levert het op?                                                                                               | Techniek en eenmalige inrichting                                                                                                                                                                                                                                  |
| ---------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1          | Google Calendar en Outlook Calendar | Persoonlijk dagoverzicht, dubbele afspraken signaleren, aparte gezinsagenda                                      | OAuth per gebruiker, eerst alleen lezen; incrementele synchronisatie, webhook plus herstelpolling. Schrijven apart inschakelen.                                                                                                                                   |
| 1          | Gmail en Outlook Mail               | Selecteer/forward een schoolmail, factuur of reservering: Todo maakt een controleerbaar taak- of afspraakconcept | Begin met bewust doorsturen naar een persoonlijk adres of een mail-add-in. Volledige mailbox lezen is optioneel en vereist passende OAuth-scopes en providerverificatie.                                                                                          |
| 1          | iCloud / Apple Agenda               | Afspraken meenemen op iPhone en iPad                                                                             | Nu werkt ICS-export. Voor eenrichtingsabonnement is een herroepbare, afgeschermde feed nodig; tweerichtingssynchronisatie vereist een apart CalDAV-ontwerp en veilige credentialopslag. Geen algemene Apple Calendar OAuth beloven.                               |
| 2          | WhatsApp                            | Deel of plak een bericht als taakconcept; later een persoonlijk Todo-invoernummer                                | Delen/plakken werkt al waar browser/OS dit ondersteunt. Automatische ontvangst via officiële WhatsApp Business Cloud API, opt-in en webhookvalidatie. Geen toegang tot willekeurige privéchats; uitgaande berichten vallen onder Meta-regels en mogelijke kosten. |
| 2          | MCP voor ChatGPT en Claude          | “Wat moet ik vandaag doen?”, taken zoeken en concepten voorbereiden                                              | Eén remote MCP-server met OAuth per gebruiker. Tools: list_items, get_day_brief, prepare_item, confirm_item. Bestaande rijrechten blijven leidend; schrijven pas na expliciete bevestiging. Beschikbaarheid verschilt per client/account.                         |
| 2          | Codex en Claude Code                | Van een ontwikkeltaak naar een bewuste Todo, status terugzien                                                    | Dezelfde MCP-tools of een beperkte REST-API. Begin met aparte projectscope; geen productiesecrets, service-role key of volledige huishouddatabase in code-assistenten.                                                                                            |
| 3          | Apple Shortcuts / Siri              | “Bewaar dit in Todo”, een snel invoerscherm openen                                                               | Eerst shortcut met invoertekst naar het bestaande conceptscherm. Direct bewaren via persoonlijke token pas na tokenbeheer, rate limits en intrekken. Siri op echt apparaat testen.                                                                                |
| 3          | Home Assistant                      | Huishoudelijke routines zoals vuilnis, boodschappen en onderhoud                                                 | Optionele webhook/API-scope voor uitsluitend gedeelde routines; geen automatisch uitlezen van privétaken.                                                                                                                                                         |
| 3          | n8n / Make / Zapier                 | Eigen automatisering zonder maatwerk per dienst                                                                  | Versieerde REST-API en ondertekende webhooks: item.created, item.completed, reminder.due. Elk abonnement een eigen scope, leveringslog en retries.                                                                                                                |
| 3          | GitHub / Linear                     | Relevante projectdeadlines in je persoonlijke overzicht                                                          | Begin met import op selectie; voorkom dat zakelijke issue-inhoud naar een huishouden lekt.                                                                                                                                                                        |

## Voorbeelden die rust geven

- Een schoolmail wordt een concept “formulier inleveren vrijdag”, met bronverwijzing en voorgestelde checklist. Jij controleert de datum.
- Een ochtendbrief kiest maximaal drie volgende stappen, benoemt overlappende afspraken en laat de rest in de inbox staan.
- Een afspraak krijgt een checklist “meenemen / voorbereiden / vertrek”; geen verzonnen reistijd zonder routeprovider.
- Terugkerende routines voor was, medicijnen, administratie en vuilnis. Medicijnen alleen ondersteunend; de app mag geen zorggarantie afgeven.
- Een wekelijkse opruimronde stelt uitgestelde taken opnieuw ter beoordeling voor. Verwijderen of verplaatsen gebeurt niet stilzwijgend.
- Huishoudgeheugen voor praktische feiten, met expliciete privé/gedeeld/geselecteerd-rechten. Bewaar wachtwoorden in een wachtwoordmanager.

## Contract voor alle connectoren

Tokens versleuteld server-side; nooit in publieke build of AI-prompts. OAuth state/PKCE en geverifieerde callbacks. Eigen account, huishouden en geselecteerde personen server-side toetsen. Externe tekst is data, geen instructie: geen acties door opdrachten in een mail. Concepten krijgen herkomst, tijdzone, onzekerheden en een bevestigingsstap. Gebruik provider-ID plus idempotency key tegen duplicaten. Ontkoppelen stopt sync, trekt tokens in en biedt verwijderen van geïmporteerde data. Agenda-conflicten tonen standaard alleen bezet/vrij, niet andermans privétitel.

API-v1: GET /items en /day-brief met paginering; POST /drafts; POST /drafts/:id/confirm; PATCH /items/:id met versiecontrole. Tokens krijgen scopes items:read, drafts:write en optioneel items:write; geen service-role token uitdelen. MCP roept dezelfde autorisatielaag aan. OpenAPI, auditevents, rate limits, tokenbeheer en autorisatietests zijn voorwaarden voor publicatie.

## Acceptatie vóór aansluiten

1. Gebruiker A kan via API/MCP/connector niets van privégebruiker B lezen of wijzigen.
2. Een intrekking van toegang geldt ook voor eerder geïmporteerde agenda-/mailreferenties en webhookjobs.
3. Tijdzones, zomertijd, gewijzigde afspraken, verwijderingen en dubbele webhooklevering zijn getest.
4. Ontkoppelen en token intrekken werken; ongeldige webhookhandtekeningen worden geweigerd.
5. Er gaat geen mail/WhatsApp-bericht uit zonder bewuste toestemming; kosten en scopes staan vooraf bij de betreffende koppeling.

Aanbevolen eerste providers: jouw primaire agenda en mailbox. Koppel dezelfde provider waar mogelijk, zodat er éénmalig inloggen nodig is. AI-providers blijven verwisselbaar; geen betaalde AI-dienst activeren zonder keuze en credentialinrichting.

## Weer en OpenAI nu aangesloten

De dagbrief toont na opt-in een algemene dagverwachting en twee instelbare weermomenten voor een handmatig gekozen plaats via Open-Meteo. AI kan die data ophalen. Buienradar is een externe radarlink; [de gratis data-voorwaarden](https://www.buienradar.nl/overbuienradar/gratis-weerdata) vereisen aparte toestemming voor mobiele toepassingen. Daarom wordt Buienradar-data niet zonder licentie ingebouwd.

Volgende weerstap: een bewuste weerplaats per afspraak/buitenactiviteit, vertrekvenster en waarschuwing bij gewijzigde verwachting. Koppel weer niet blind aan een afspraak op een andere plaats. CalDAV/Google/Outlook-import moeten eerst bron, tijdzone en deelrechten correct leveren.

OpenAI Responses en transcriptie zijn aangesloten als server-adapter, met bevestigde beheeracties via tekst of spraak. Zie ../operations/AI.md voor gedrag en open apparaattests. Remote MCP, provider-OAuth en doorlopend Realtime-gesprek blijven aparte vervolgfases. ChatGPT/Codex/Claude-workspaceconnectors zijn niet automatisch onderdeel van een API-abonnement of deze app.
