## Startopdracht voor Codex — in één keer uitvoeren

Lees CODEX_START_HERE.md, AGENTS.md, de product-/architectuurdocumentatie en dit volledige issue. Inspecteer eerst de actuele code en open PR #2; behoud wat al werkt en bouw voort op de bestaande implementatie, zonder main rechtstreeks te wijzigen.

Voer daarna deze complete opdracht uit: maak Todo het centrale overzicht door iCloud-agenda, Outlook Calendar voor een persoonlijk Microsoft-account, Google Calendar en Gmail aan te sluiten en de hieronder expliciet gekozen uitbreidingen te bouwen volgens de eisen en fasen in dit issue. Werk zelfstandig door alle bouwfasen heen, los gevonden fouten op en voer de relevante tests en productiebuild uit. Stop niet na alleen een plan, één provider of knoppen zonder backend. Neem ook de goedgekeurde uitbreidingen uit de keuzeronde onderaan mee; behoud de expliciet afgewezen functies buiten scope.

Maak de veilige aansluitflow en alle testbare onderdelen concreet vóór je ontbrekende providerinstellingen vraagt. Persoonlijke toestemming, appregistraties en eventuele providerverificatie zijn activeringsvoorwaarden; verzin die niet en vraag nooit credentials in chat. Rond intussen het onafhankelijke werk af. Lever code, migraties, tests, documentatie en een bijgewerkte PR op; merge niet zonder toestemming. Rapporteer apart wat gebouwd, getest en echt verbonden is, en welke handeling van de gebruiker nog nodig is.

**Korte opdracht om straks aan Codex te geven:** “Voer bouwopdracht #3 in zsj4j2s4df-pixel/Todo volledig uit volgens de startinstructie en acceptatiecriteria in dat issue.”

---

## Doel en opdracht

Bouw Todo als centraal punt voor de bestaande agenda's en voor het omzetten van relevante mail naar taken of afspraken. De gebruiker heeft op 26 oktober 2026 gevraagd deze opdracht in GitHub vast te leggen. Dit issue is de bouwopdracht; de automatische koppelingen zijn nog niet gerealiseerd of geactiveerd.

Gevraagde koppelingen:
- [ ] iCloud-agenda (zichtbaar via Apple Agenda / Apple Calendar).
- [ ] Outlook Calendar met een **persoonlijk Microsoft-account**.
- [ ] Google Calendar.
- [ ] Gmail.

Apple Agenda is een client die meerdere bronnen kan tonen. Controleer bij aansluiten dat de gekozen agenda werkelijk bij iCloud staat. Het huidige gebruik van iCloud is door de gebruiker als waarschijnlijk aangegeven. Ondersteun meerdere geselecteerde agenda's naast elkaar; houd de provideradapters verwisselbaar.

## Gewenst gedrag

### Agenda's
- Eén overzicht in Todo met lokale Todo-afspraken en geselecteerde externe agenda's, voorzien van herkenbare bron en laatste synchronisatietijd.
- Na expliciet aansluiten en selecteren afspraken automatisch ophalen en wijzigingen en verwijderingen verwerken. Een eenmalige ICS-import is geen vervanging voor deze koppelingen.
- Eerst alleen lezen opleveren; daarna tweerichtingssynchronisatie per agenda apart en bewust inschakelen. Het einddoel omvat vanuit Todo aanmaken en wijzigen in de gekozen bronagenda.
- Bij een nieuwe afspraak kiest de gebruiker de doelagenda; een wijziging aan een bestaande afspraak gaat naar de oorspronkelijke bron. Voorkom dat dezelfde afspraak tussen providers blijft rondkopiëren.
- Ondersteun hele dagen, tijdzones, zomer-/wintertijd, terugkerende reeksen en uitzonderingen. Toon conflicten bij gelijktijdige wijzigingen; overschrijf niets stilzwijgend.
- Bij een annulering of verwijdering in de bron mag geen verouderde afspraak actief blijven in Todo.
- Dubbele leveringen/retries en meerdere weergaven van dezelfde kalender mogen geen nieuwe kopieën opleveren. Gebruik stabiele bron-ID's, instance-ID's en versiecontrole.
- Toon verbindingsfouten en verouderde gegevens duidelijk, met opnieuw verbinden en handmatig vernieuwen.
- Uitnodigingen of wijzigingen die andere deelnemers berichten kunnen sturen vragen vooraf duidelijke bevestiging.

### Gmail
- De gebruiker kiest bewust welke mail Todo mag raadplegen; begin met gericht zoeken/selecteren en minimale rechten.
- Geselecteerde mail kan een bewerkbaar taak-/afspraakvoorstel worden met bronverwijzing, datum/tijd en eventuele onzekerheden.
- Opslaan gebeurt pas na bevestiging via de bestaande tekst-/spraakflow. Geen automatisch uitvoerbare instructies uit mail.
- Geen volledige mailbox stilzwijgend kopiëren en geen mail verzenden, verwijderen of doorsturen als onderdeel van de eerste fase.
- De bestaande AI mag uitsluitend gekoppelde gegevens gebruiken waarvoor deze gebruiker daadwerkelijk toegang heeft.

## Technische randvoorwaarden

- Behoud Next.js/PWA, Cloudflare en Supabase, bestaande functionaliteit en de verplichte kronkelige koffiebruine Canva-huisstijl. Lees CODEX_START_HERE.md, AGENTS.md en docs/ vóór implementatie.
- Google: officiële OAuth-flow, aparte minimale scopes voor Gmail en Calendar; incrementele sync waar ondersteund, herstel bij verlopen cursors en begrensde retries. Beoordeel Google-verificatievereisten voor gekozen Gmail-scopes vóór publieke release.
- Outlook: Microsoft Graph met gedelegeerde toestemming voor persoonlijke accounts; geen zakelijke Microsoft 365-/Entra-tenant bij de gebruiker verplicht stellen. Gebruik productie-API's en controleer benodigde appregistratie.
- iCloud: onderzoek actuele ondersteunde Apple-autorisatie. Gebruik CalDAV met veilige serveropslag van een herroepbaar app-specifiek wachtwoord als dat voor Todo nodig is. Een openbare agenda-/ICS-link is geen veilige vervanging voor private tweerichtingssynchronisatie.
- OAuth state, PKCE waar ondersteund, exacte callback-allowlist, server-side tokenrefresh, versleutelde secrets en veilige ontkoppeling. Geen credentials in browseropslag, Git, logs, AI-prompts of chat.
- Aansluitingen en brondata zijn standaard privé per gebruiker, beschermd met RLS. Lidmaatschap van een huishouden verleent geen impliciete toegang tot mail of externe agenda's.
- Ontkoppelen stopt jobs en schrijftoegang, ruimt servercredentials op en biedt een duidelijke keuze voor reeds ingelezen gegevens. Trek providerrechten in waar ondersteund.
- Bouw rate limits, leases/idempotentie, herstartbare syncjobs en een controleerbaar status-/foutenoverzicht.
- De ChatGPT-/Claude-connectoren zijn aparte producten; een koppeling daar activeert geen koppeling in Todo en omgekeerd.
- Geen betaald plan activeren, accounts migreren of echte mails/uitnodigingen versturen zonder passende toestemming. De gebruiker voert eenmalige providerautorisatie zelf uit via de beveiligde flow.

## Bouwfasen en acceptatie

1. **Inspectie en ontwerp**: huidige code/dataflow onderzoeken; connector-/bron-/eventmodel, rechten, syncvenster en conflictstrategie vastleggen. Hergebruik de bestaande ICS-, tijdzone-, AI-bevestigings- en accountcomponenten waar passend.
2. **Verbinden en alleen lezen**: alle vier aansluitflows, account-/agendaselectie, veilige opslag, status en ontkoppelen; ingelezen agenda's zichtbaar in Todo.
3. **Synchronisatie**: wijzigingen, verwijderingen, herhalingen/uitzonderingen, deduplicatie, tokenverloop, foutafhandeling en periodiek herstel.
4. **Gmail naar concepten**: gerichte selectie, bronverwijzing en bevestigde taak-/afspraakinvoer, ook via spraak.
5. **Terugschrijven**: per agenda opt-in; expliciete bestemming, providerrechten en versiecontrole; conflict- en deelnemerswaarschuwingen.
6. **Validatie en oplevering**: tests en productiebuild uitvoeren; PR bijwerken; ontbrekende providerconfiguratie en werkelijke apparaattests expliciet rapporteren. Werk op een feature branch; wijzig of merge main niet zonder toestemming.

Afgerond wanneer:
- [ ] Gebruiker A kan niets van de aansluitingen, credentials of privémail/-agenda van B lezen of wijzigen.
- [ ] Alle drie agendaproviders kunnen naast elkaar zichtbaar zijn; Gmail levert bevestigbare concepten.
- [ ] Nieuwe, gewijzigde en verwijderde afspraken komen na sync correct aan; retries maken geen duplicaten.
- [ ] Zomertijd, hele dagen, reeksen en uitzonderingen zijn betekenisvol getest.
- [ ] Herautorisatie, beperkte providerrechten, quota, netwerkuitval en ontkoppelen zijn getest.
- [ ] Terugschrijven werkt naar de juiste bron en blokkeert ongeautoriseerde of conflicterende wijzigingen.
- [ ] Geen echte externe verzending als onbedoeld gevolg van tests; echte accountproeven apart onderscheiden van mocks.
- [ ] Typecheck, relevante unit-/database-/browsertests en productiebuild slagen; testgrenzen staan in de oplevering.

## Bestaande basis en vervolgstappen

Zie PR #2, docs/architecture/INTEGRATIONS.md, docs/operations/LIVE_AND_ROUTINES.md en docs/operations/AI.md. Eenmalige privé-ICS-import, AI-beheervoorstellen en gesproken bevestiging bestaan al; volledige providerkoppelingen nog niet.

Voor live aansluiting zijn providerregistraties/callbacks en persoonlijke autorisatie nodig. Vraag ontbrekende instellingen pas wanneer de concrete aansluitflow gereed is; vraag nooit wachtwoorden of tokens in chat.

**Apart te beoordelen:** de gebruiker overweegt Proton Mail voor belangrijke mail. Er is geen migratie besloten. Houd dit gescheiden van de bevestigde Gmail-opdracht en claim geen native Proton-koppeling met Claude, ChatGPT of Todo zonder verificatie.

## Officiële vertrekpunten

- Apple: https://support.apple.com/en-us/121539 en https://support.apple.com/en-us/102654
- Microsoft Graph-rechten: https://learn.microsoft.com/en-us/graph/permissions-reference
- Graph kalenderwijzigingen: https://learn.microsoft.com/en-us/graph/delta-query-events


## Goedgekeurde uitbreidingen uit de gesproken keuzeronde — 26 oktober 2026

Deze keuzes horen bij dezelfde algemene bouwopdracht. Dit zijn gewenste uitbreidingen, geen claim dat ze al gebouwd zijn. De gebruiker wil zo veel mogelijk in bestaande onderdelen en in de bestaande Canva-huisstijl.

| Onderdeel | Besluit en gewenst gedrag |
| --- | --- |
| Prullenbak | **Ja.** Verwijderde taken en afspraken terug kunnen halen. Gebruik soft delete; sluit ze uit van normale overzichten, briefing, AI-zoekresultaten en meldingen. Laat geen synchronisatiejob ze ongemerkt opnieuw activeren. Geen automatische definitieve verwijdertermijn verzinnen. |
| Verwijderbevestiging | **Ja, consequent.** Voor verwijderen duidelijk vragen: “Weet je zeker dat je dit wilt verwijderen?” Toon welk item en welke gevolgen, ook via spraak/AI en bij externe bronitems. Herstel mag geen ongemerkte uitnodiging of provideractie versturen. Een normale itemverwijdering heeft al een eenvoudige bevestiging; behoud die en maak alle relevante routes consistent. |
| Vrije tijdblokken | **Ja, binnen het bestaande agendaoverzicht.** Geen los weekoverzicht of extra navigatieonderdeel. Toon alleen vrije ruimte op basis van werkelijk beschikbare agenda-informatie en een duidelijk tijdvenster. Geen gegarandeerde beschikbaarheid claimen bij ontbrekende/verouderde bronnen. |
| Gedeelde boodschappenlijst | **Ja.** Huisgenoten kunnen toevoegen en afvinken; rechten expliciet toetsen. Gebruik waar passend de bestaande lijst-/checklistbouwstenen. Realtime of verversen eerlijk aangeven en gelijktijdig afvinken zonder verloren wijzigingen verwerken. |
| Taak uitstellen | **Ja, naar een zelfgekozen datum.** Bewaar overige itemgegevens en respecteer eigenaar-/bronrechten, tijdzone en herhalingsanker. Een vaste knop “morgen” is niet als eis gekozen. |
| Herbruikbare sjablonen | **Ja.** Bewaar vaste lijstjes, bijvoorbeeld vakantie, schoonmaak of administratie, en maak er nieuwe onafhankelijke exemplaren van. Kopieer geen oude voltooiingsstatus of oude deelrechten zonder bewuste keuze. |
| Wekelijkse opruimronde | **Ja, subtiel in een bestaand onderdeel.** Toon oude openstaande taken met bewaren, uitstellen of verwijderen. Geen automatische massale wijzigingen of extra apart scherm als uitgangspunt. Verwijderen gebruikt bevestiging en prullenbak. |
| Losse gesproken notities | **Ja.** Een gedachte kunnen inspreken en als notitie bewaren zonder meteen een taak, afspraak of datum te vereisen. Gebruik bestaande transcriptie waar passend; geen ruwe audio automatisch langdurig bewaren. |
| Dagelijks notitiemoment | **Ja, in de bestaande instelbare dagbriefing.** Breng onverwerkte notities consequent terug totdat de gebruiker ze omzet/verwerkt, bewust bewaart/archiveert of verwijdert. Alleen openen of lezen is geen afhandeling. Expliciet bewaarde notities blijven vindbaar maar hoeven niet iedere dag opnieuw opgedrongen te worden. Geen ongevraagde extra pushkanalen of extra briefingmomenten. |

### Expliciet niet bouwen in deze opdracht
- Geen geschatte tijdsduur per taak en geen dagcapaciteitsberekening op basis van taakduur.
- Geen aparte instelling voor stille uren. Bestaande notificatievoorkeuren en OS-instellingen blijven gelden.
- Geen apart onderdeel voor vrije tijdblokken of de wekelijkse opruimronde.
- Geen activiteiten-/wijzigingslog als gebruikerswens aannemen: daarop is geen eenduidig antwoord gegeven. Technische logging blijft beperkt tot wat de beveiligde werking vereist.

### Ontwerp, privacy en aanvullende acceptatie

Volg verplicht .agents/skills/todo-icon-style/SKILL.md: licht papier, koffiebruine accenten, zichtbaar kronkelige penlijnen zonder liniaal. De gebruiker heeft Canva expliciet gevraagd voor de vormgeving; nieuwe benodigde iconen/illustraties komen uit de bestaande Canva-familie. Hergebruik AppIcon en bestaande kaders; voeg geen tweede stijl of onnodige losse tegels toe.

- [ ] Prullenbak, herstel en definitief verwijderen hebben betekenisvolle rechten-/databasetests. De AI kan niet via een alternatieve route de bevestiging of soft delete omzeilen.
- [ ] Gedeelde boodschappenlijsten en privénotities lekken niet naar andere accounts of onbevoegde huisgenoten.
- [ ] Uitstellen en vrije tijdblokken zijn getest met tijdzones, zomertijd en gewijzigde externe afspraken.
- [ ] Sjabloongebruik maakt een onafhankelijk exemplaar en laat de bron ongewijzigd.
- [ ] De wekelijkse opruimronde voert niets ongevraagd uit en blijft in een bestaand onderdeel.
- [ ] Na herladen/uitloggen/inloggen blijven gesproken notities en hun verwerkingsstatus behouden. Onverwerkte notities keren dagelijks terug; bewust afgehandelde notities niet.
- [ ] Dagbriefing respecteert de gekozen tijd/inhoud en bestaande notificatie-opt-in.
- [ ] Nieuwe UI blijft bruikbaar op mobiel en met toetsenbord; Canva-bronnen, typecheck en productiebuild worden gecontroleerd.

Werk het actuele implementatieoverzicht bij met afzonderlijk **bestaand**, **nieuw gebouwd**, **getest** en **nog te activeren**. Het korte startcommando voor issue #3 blijft voldoende voor zowel de vier koppelingen als deze uitbreidingen.


## Aanvulling keuzeronde: agendatype, hele dagen en meer herhaling

Expliciet door de gebruiker gevraagd als uitbreiding van dezelfde bouwopdracht:

- [ ] Voeg **verjaardag** en **vakantie** toe aan de bestaande keuze voor het soort item. Werk dit logisch uit naast taak, afspraak en herinnering; behoud bestaande itemdata en voorkom een onnodig apart scherm.
- [ ] Ondersteun **hele dag** als echte, bewerkbare eigenschap. Bij verjaardag en vakantie staat dit standaard aan. Bij gewone afspraken kan de gebruiker het zelf kiezen. Maak de standaard zichtbaar en laat de gebruiker deze aanpassen.
- [ ] Een verjaardag kan één kalenderdatum beslaan; een vakantie kan meerdere hele dagen beslaan. Toon en bewerk begin- en einddatum duidelijk.
- [ ] Breid de herhaalkeuze uit met **elk uur, elke dag, elke week, elke twee weken, elke maand en elk jaar**, naast niet herhalen. Bepaal per itemtype welke keuzes betekenisvol zijn; presenteer geen uurlijkse hele-dagverjaardagen als geldig schema.

### Vereist gedrag en techniek
- Leg hele dagen vast als kalenderdatums met een exclusieve einddatum, volgens iCalendar/providerconventies. Reken ze niet als willekeurige UTC-middernachttijden. De UI mag de laatste inbegrepen vakantiedag tonen maar moet die correct vertalen naar de exclusieve einddatum.
- Behoud de juiste lokale datum in andere tijdzones en over zomer-/wintertijd. Verplaats verjaardagen niet door omzetting naar UTC of een andere apparaatlocatie.
- Kalenderreeksen zijn gepland op hun eigen herhaalschema en hangen niet af van het afvinken van een vorige afspraak. Dit verschilt van de huidige taken/herinneringen die pas na afronden een vervolg krijgen. Bewaar dat bestaande gedrag en maak de betekenis begrijpelijk.
- Voor agendareeksen: wijziging/verwijdering van één voorkomen of de reeks moet een duidelijke, passende keuze bieden; verwerking blijft gekoppeld aan stabiele bron-/reeks-/instance-ID's. Verwijderen gebruikt de afgesproken bevestiging en prullenbak.
- Ondersteun herhaling bij aangesloten providers alleen voor zover hun API dat daadwerkelijk ondersteunt. Toon een beperking of bewaak de actie als een schema niet teruggeschreven kan worden; versimpel een schema niet stilzwijgend.
- Houd de oorspronkelijke lokale datum/tijd als anker. Voorkom maandultimo-drift en leg expliciet vast wat er met 29 februari en ontbrekende/dubbele lokale tijden gebeurt. Een maandelijkse reeks vanaf de 31e moet na een korte maand weer kunnen terugkeren naar de 31e.
- Ondersteun een begrensde einddatum of aantal herhalingen en een veilige, gepagineerde weergave van doorlopende reeksen. Geen onbeperkte expansie of onbegrensde aanmaak van uurlijkse items.
- Verjaardag kan een voorstel voor jaarlijkse herhaling krijgen, maar de herhaalinstelling moet zichtbaar en wijzigbaar zijn. Vakantie mag niet ongevraagd jaarlijks terugkeren.
- Geef een aparte verjaardag/vakantie geen extra gegevensrechten: dezelfde privé-/gedeeld-/geselecteerd-regels blijven gelden. Nieuwe symbolen komen uitsluitend uit de verplichte Canva-familie.

### Aanvullende acceptatie
- [ ] Bestaande taken, afspraken en herinneringen blijven geldig na migratie; bestaande herhalende routines blijven werken.
- [ ] Verjaardag, meerdaagse vakantie en handmatig gekozen hele-dagafspraken worden correct opgeslagen, herladen, getoond en naar ondersteunde providers gesynchroniseerd.
- [ ] Alle zes gevraagde herhaalopties hebben zinvolle positieve en negatieve tests; ongeldige combinaties worden begrijpelijk geweigerd.
- [ ] Tests dekken maandeinde, 29 februari, jaarovergang, tweewekelijkse herhaling, zomer-/wintertijd, hele dagen en meerdere tijdzones.
- [ ] Tests dekken reeks versus los voorkomen, annulering/uitzondering en synchronisatie zonder duplicaten.
- [ ] UI voor type, hele dag en herhaling zit in het bestaande invoer-/bewerkonderdeel en volgt de bestaande kronkelige Canva-huisstijl.

Dit hoort bij het bestaande startcommando: **“Voer issue 3 van mijn Todo-repository volledig uit.”** Geen aparte opdracht nodig.


## Aanvulling: één duidelijke bediening en direct toevoegen vanuit de agenda

De gebruiker vraagt Codex expliciet te onderzoeken of de app dubbele interpretaties, overlappende functies of onduidelijke invoerroutes bevat, en deze te verduidelijken en waar zinvol samen te voegen. Concreet voorbeeld: een afspraak hoort direct vanuit de kalender toegevoegd te kunnen worden, zonder daarnaast nog een los toevoegblok.

### Onderzoek en samenvoegen
- Inventariseer dubbele knoppen, formulieren, termen en acties in de bestaande app, waaronder item toevoegen, datums/tijd, herhalen, agenda-import/sync en AI-conceptinvoer.
- Rapporteer kort wat werkelijk dubbel of verwarrend is en consolideer dat binnen dezelfde bouwopdracht. Gebruik één gedeelde invoer-/bewerkflow en één gevalideerde opslag-/bevestigingsroute waar de betekenis gelijk is.
- Maak keuzes duidelijk met consistente Nederlandse benamingen. Houd inhoudelijk verschillende zaken wel herkenbaar: taak versus afspraak, eenmalige import versus automatische sync, hele dag versus datum/tijd, agenda-reeks versus routine na afronden.
- Meerdere contextuele ingangen mogen hetzelfde formulier openen, maar bouw geen concurrerende formulieren, duplicerende tegels of tweede implementatie van dezelfde actie. Bestaande opties en gegevens mogen bij opschonen niet verloren gaan.

### Agenda: gewenste interactie
- [ ] Een dag in de kalender is aanklikbaar. De gekozen dag wordt de context voor bekijken en toevoegen.
- [ ] Plaats een klein, duidelijk plusje in de hoek van het bestaande agendablok. Het opent het gedeelde afspraakformulier voor de geselecteerde dag; die datum staat alvast ingevuld.
- [ ] Bied toevoegen ook logisch vanuit de geselecteerde dag/dagweergave aan, met dezelfde flow. Een datum aanklikken mag niet vanzelf een afspraak opslaan.
- [ ] Zonder geselecteerde dag is de gebruikte standaarddatum duidelijk zichtbaar, bijvoorbeeld vandaag. Een andere maand kiezen of een dag buiten de huidige maand selecteren mag de invoer niet ongemerkt naar vandaag laten springen.
- [ ] Het formulier laat type (inclusief verjaardag/vakantie), hele dag, datum/tijd, herhaling en doelagenda kiezen/bewerken volgens de eerdere eisen. De gebruiker kan vooraf ingevulde of uit mail herkende waarden aanpassen.
- [ ] Verwijder het losse **toevoegblok onder de kalender** zodra de nieuwe route dezelfde functie volledig overneemt. Behoud de afsprakenlijst en nuttige details onder de kalender; verwijder niet het dagoverzicht.
- [ ] Kijk ook of een bestaande algemene toevoegknop in de agenda door het plusje overbodig wordt. Voorkom twee concurrerende toevoegacties binnen hetzelfde scherm; behoud bruikbare algemene invoer in andere contexten.
- [ ] Gebruik het bestaande Canva-plusicoon via AppIcon. Visueel klein mag niet betekenen dat het aanraakdoel te klein is: behoud een ruim aanraakvlak, een toegankelijke naam zoals “Afspraak toevoegen”, zichtbare toetsenbordfocus en consistente penkaders.
- [ ] Annuleren bewaart niets en houdt de geselecteerde dag vast. Opslaan doet één schrijfactie, toont de afspraak bij de juiste dag en geeft een duidelijke bevestiging.

### Acceptatie voor deze opschoning
- Desktop- en mobiele browsertests: dag selecteren → plusje → datum vooraf ingevuld → aanpassen → opslaan → afspraak op juiste dag.
- Test ook maand-/jaargrens, andere tijdzone, hele-dagitem, geen dagselectie, annuleren, dubbel tikken en mislukte opslag zonder onbedoelde dubbele afspraak.
- Toetsenbordbediening en screenreaderlabels blijven werken.
- Het losse toevoegblok is verwijderd; er is één gedeelde, herbruikbare bewerkflow voor dezelfde handeling.
- Geen regressie in dagfilters, afsprakenlijst, gedeelde/privacyrechten of nieuwe providerkoppelingen.
- Leg in de oplevering uit welke duplicaties zijn gevonden en wat is samengevoegd, met duidelijk onderscheid tussen echte gedragswijzigingen en alleen tekstuele verduidelijking.

Deze aanvulling valt onder dezelfde algemene Codex-startopdracht voor issue #3.


## Goedgekeurde aanvulling: één inbox binnen een bestaand onderdeel

De gebruiker heeft **ja** gezegd tegen één gezamenlijke inbox voor nieuwe notities, geselecteerde mails en losse ideeën die nog verwerkt moeten worden.

- [ ] Integreer deze verwerkbak in een bestaand onderdeel; geen extra los navigatieonderdeel of concurrerende notitie-/mailinbox toevoegen.
- [ ] Laat een item omzetten naar taak/afspraak, bewust bewaren/archive­ren of verwijderen. Alleen openen/lezen telt niet als verwerkt. Hergebruik het gedeelde invoer-/bevestigingsformulier en de afgesproken verwijderbevestiging/prullenbak.
- [ ] Werk de eerder gekozen gesproken notities en dagelijkse notitieverwerking hierin uit als één samenhangende flow; geen dubbele opslag, dubbele kaarten of twee verwerkingsstatussen voor dezelfde invoer.
- [ ] Neem uit Gmail alleen bewust geselecteerde mail over, met bronverwijzing. “Gezamenlijk” betekent samengevoegde bronnen voor de gebruiker, **niet** automatisch gedeeld met het huishouden. Standaard privé en dezelfde RLS-/AI-rechten.
- [ ] De dagbriefing brengt onverwerkte inboxnotities dagelijks terug volgens de eerder gekozen tijd/inhoud. Bewust bewaarde of afgehandelde items blijven vindbaar en stoppen met dagelijks terugkomen.
- [ ] Test opslag en verwerkingsstatus na herladen/inloggen, accountisolatie, deduplicatie van mail, omzetting zonder dubbele taak/afspraak en de bestaande bevestigings-/herstelroutes.
- [ ] Volg de bestaande kronkelige Canva-huisstijl en houd het overzicht rustig op mobiel.

De eenvoudige instellingencheck en “Ongedaan maken” zijn inmiddels beide goedgekeurd; zie de uitwerking hieronder.


## Goedgekeurd: Ongedaan maken en persoonlijke inboxen

- [ ] Toon na bevestigde verwijdering tijdelijk **Ongedaan maken**, naast de blijvende mogelijkheid om vanuit de prullenbak te herstellen. Herstel hetzelfde item met zijn identiteit, inhoud en geldige rechten; maak geen nieuwe kopie. Meld een mislukte verwijdering of herstelactie eerlijk en voorkom dubbele acties door herhaald tikken.
- [ ] Een herstelactie mag geen inmiddels ingetrokken deelrechten herstellen of providerwijzigingen van anderen overschrijven. Providerverwijderingen/uitnodigingen kunnen externe gevolgen hebben: leg uit wat herstel werkelijk kan herstellen en verstuur niets stilzwijgend opnieuw.
- [ ] Test ongedaan maken op mobiel, met toetsenbord, na netwerkfouten en bij dubbele verzoeken. Als de tijdelijke knop verdwenen is, blijft de prullenbak bereikbaar.
- [ ] **Iedere gebruiker heeft een eigen persoonlijke inbox.** De gebruiker heeft dit expliciet verduidelijkt. Bundeling betreft bronnen voor die persoon, geen gezamenlijke huishoudmailbox. Toon alleen eigen of rechtmatig zichtbare invoer.
- [ ] Gebruik de bestaande eigenaar-/deel-/toewijzingsvelden om te bepalen voor wie een taak of herinnering is. Een AI-inschatting van een naam is geen autorisatie en deelt geen privémail of notitie automatisch met een ander.
- [ ] **Goedgekeurd:** een gedeelde taak of herinnering verschijnt automatisch in de persoonlijke inbox van iedere expliciet toegewezen, bevoegde ontvanger. Geen doorsluizing op basis van alleen gegiste intentie.


### Acceptatie: toegewezen items in de persoonlijke inbox

De gebruiker heeft automatische inboxplaatsing op expliciete toewijzing bevestigd.

- Gebruik een verwijzing naar hetzelfde item, geen kopie per ontvanger. Meerdere toegewezen personen zien ieder één verwijzing; één afronding blijft dezelfde taakstatus voor alle bevoegde gebruikers.
- Houd persoonlijke gelezen-/verwerkingsstatus waar nodig apart van gedeelde taakstatus. Een inboxmelding wegwerken mag niet vanzelf de gedeelde taak afronden of verwijderen.
- Trek inboxzichtbaarheid meteen in als toewijzing of toegang vervalt. Hergebruik bestaande serverrechten; cache of inboxhistorie mag geen privé-inhoud laten lekken na intrekken.
- Verwerk dubbele sync-/notificatie-events idempotent. Voorkom dat inboxplaatsing zelf een extra taak of dubbele push maakt.
- Test eigenaar, één/meerdere ontvangers, niet-toegewezen huisgenoot, intrekking, afronden/heropenen en opnieuw toewijzen.


## Goedgekeurd: instellingenstatus en duidelijke ontvangers

### Klein statusoverzicht binnen Instellingen

De gebruiker heeft na toelichting **ja** gezegd tegen een eenvoudig overzicht waarmee je ziet waarom iets niet binnenkomt, zonder extra accountrechten te vragen.

- [ ] Toon per aangesloten dienst de werkelijke status, bijvoorbeeld verbonden, niet verbonden, opnieuw aanmelden nodig of synchronisatiefout. Vermeld laatste succesvolle synchronisatie en een begrijpelijke herstelactie.
- [ ] Toon voor meldingen de actuele apparaat-/browsertoestemming en registratie apart van accountvoorkeuren. “Ingeschakeld” is geen bewijs van fysieke pushbezorging.
- [ ] Toon voor spraak alleen wat werkelijk gecontroleerd kan worden: browserondersteuning, bekende toestemming en serverbeschikbaarheid. Start geen microfoon of betaald AI-gesprek voor een automatische statuscheck; een bewuste testactie moet vooraf duidelijk zijn.
- [ ] Gebruik eerlijk “Nog niet getest” of “Onbekend” als de toestand niet vastgesteld kan worden. Een opgeslagen token of alleen een aanwezige knop is geen bewijs van een werkende verbinding.
- [ ] Houd dit in het bestaande instellingenonderdeel, met korte Nederlandse tekst en zonder technische tokens/secrets of een extra dashboard.
- [ ] Test aangesloten/ontkoppelde accounts, verlopen toestemming, apparaatverschillen, geweigerde microfoon-/pushrechten en netwerkaanvragen die mislukken. Geen extra providerscopes, echte testmails, uitnodigingen of ongevraagde pushes.

### Zichtbaar voor wie een taak of herinnering bedoeld is

De gebruiker vraagt expliciet om ook duidelijk te tonen wanneer iets aan **beiden** is toegewezen.

- [ ] Toon consequent “Voor jou”, “Voor [naam]” of “Voor jullie beiden” (of leesbare namen bij meer dan twee personen) waar toewijzing relevant is: inbox, taak-/herinneringsweergave en detail.
- [ ] Baseer dit op expliciete toewijzingen, niet op wie het item heeft aangemaakt of op huishoudlidmaatschap. Behandel ook geen toewijzing en onbekende/onbeschikbare naam begrijpelijk.
- [ ] Toon bij gezamenlijk toegewezen items in ieders persoonlijke inbox dat de ander óók is toegewezen. Het blijft hetzelfde item; geen dubbele taak of automatische afronding voor alleen één ontvanger.
- [ ] Respecteer bestaande zichtbaarheid en toegestane profielinformatie. Labels mogen geen namen of privé-items onthullen aan onbevoegden.
- [ ] Test één ontvanger, beide partners, meer dan twee ontvangers, geen ontvanger, gewijzigde toewijzing en verschillende ingelogde gebruikers.


## Laatste aanvulling: Supabase-opslag met eigen inhoud per persoon en drie Canva-icoontjes

### Database en accountinhoud

De gebruiker wil expliciet dat de app een echte Supabase-database gebruikt en dat beide personen ieder eigen inhoud hebben.

- [ ] Inspecteer en **hergebruik het reeds bestaande Supabase-project en de bestaande Todo-database**. Maak de ontbrekende tabellen/kolommen/relaties en migraties voor de hierboven gekozen functies. Maak niet onnodig een tweede project of afzonderlijke database per partner.
- [ ] Ieder heeft een eigen Supabase Auth-account met blijvende, accountgebonden inhoud: persoonlijke inbox, privénotities, eigen taken/afspraken/herinneringen, voorkeuren en eigen providerverbindingen.
- [ ] Houd persoonlijke gegevens logisch gescheiden met eigenaar-ID's, expliciete deel-/toewijzingsrelaties en server-side Row Level Security. Een accountwissel op hetzelfde apparaat mag geen inhoud, cache, actieve spraaksessie of providerrechten van het vorige account achterlaten.
- [ ] Partner-/huishoudlidmaatschap geeft geen toegang tot elkaars privé-inhoud. Een gedeeld of gezamenlijk toegewezen item blijft één item dat alleen op basis van expliciete rechten voor beide zichtbaar is.
- [ ] Alle lees-, schrijf-, herstel-, export-, AI- en connectorroutes handhaven dezelfde rechten; de AI mag die scheiding niet omzeilen. Service-rolekeys en providercredentials blijven uitsluitend server-side.
- [ ] Gegevens en verwerkingsstatus blijven behouden na herladen, uitloggen en opnieuw inloggen. De lokale demonstratiemodus is geen vervanging voor echte Supabase-opslag voor de twee accounts.
- [ ] Lever betekenisvolle tweegebruikers-tests: beide accounts hebben hun eigen inhoud; A kan B's privé-inhoud niet ophalen/wijzigen; bewust delen/toewijzen werkt; intrekken werkt meteen; accountwissel lekt niets. Test ook inbox, notities, prullenbak, AI en connectoren.
- [ ] Controleer migraties en security-advisors, behoud bestaande data en functionaliteit, en rapporteer precies welke databaseonderdelen nieuw of hergebruikt zijn. Geen nieuwe betaalde database/plannen activeren als stilzwijgend onderdeel hiervan.

### Canva: voor mij, voor mijn partner, voor ons samen

De gebruiker heeft expliciet gevraagd ook de ontvangersicoontjes met Canva te laten maken.

- [ ] Maak via Canva een samenhangende set van drie herkenbare symbolen: **voor mij**, **voor mijn partner** en **voor ons samen**. Gebruik de bestaande referentiefamilie en de verplichte .agents/skills/todo-icon-style/SKILL.md.
- [ ] Zelfde licht papier, koffiebruine inkt, dunne zichtbaar kronkelige handgetekende lijnen zonder liniaal; geen stockicoontjes, emoji of nieuwe tekenstijl. Werk generiek, zonder verzonnen persoonlijke uiterlijke kenmerken.
- [ ] Maak de drie betekenissen visueel onderscheidbaar, maar toon altijd een passend tekstlabel; kleur of icoon alleen is onvoldoende. Gebruik het juiste relatieve label voor de ingelogde gebruiker.
- [ ] Integreer via AppIcon, leg Canva-bronnen en hashes vast en controleer de kleine mobiele weergave en toegankelijkheid.
- [ ] Deze icoontjes veranderen nooit de feitelijke deel-/toewijzingsrechten. Bij meer dan twee ontvangers blijven namen/aantal duidelijk volgens de eerder vastgelegde regels.

Ook deze aanvulling hoort bij dezelfde algemene Codex-bouwopdracht in issue #3.


## Aanvulling: e-mail voor registratie, inloggen en accountherstel

Verduidelijking van de gebruiker: “met betrekking tot e-mail” gaat hier over **de login**, niet over de Gmail-inhoudskoppeling.

### Gewenste accountflow
- [ ] Iedere persoon kan zich met een eigen e-mailadres aanmelden voor een eigen account; behoud de bestaande e-mail-/wachtwoordflow tenzij er een onderbouwde reden voor wijziging is. Gmail, Outlook of Proton als loginadres vereisen geen inhoudelijke mailboxkoppeling.
- [ ] Registratie, bevestigingsmail, inloggen, uitloggen en “wachtwoord vergeten” werken compleet via Supabase Auth, op desktop en mobiel/PWA.
- [ ] Na klikken op een bevestigings- of herstelmail komt de gebruiker veilig op de juiste Todo-URL terug. Een herstel-link opent daadwerkelijk de flow om een nieuw wachtwoord in te stellen.
- [ ] Geef begrijpelijke feedback bij nog onbevestigde accounts, verlopen/al gebruikte links en ongeldige invoer. Bied een begrensde mogelijkheid om een bevestigingsmail opnieuw aan te vragen.
- [ ] Laat persoonlijke login en eventuele huishoud-/partneruitnodiging duidelijk onderscheiden; een uitnodiging mag geen bestaand privéaccount of andere gegevens overnemen.

### Wat Codex moet onderzoeken en inrichten
- Controleer de actuele Supabase Auth-configuratie, Site URL en redirect-allowlist voor de gepubliceerde app. Geen open redirects of onnodig brede wildcards.
- Controleer wat voor betrouwbare productiebezorging ontbreekt. Supabase's standaard testverzender kent beperkingen en is geen bewijs dat registratie voor twee willekeurige persoonlijke adressen werkt.
- Bereid zo nodig een geschikte eigen SMTP-/transactionele mailverzender voor, met herkenbare afzender, passende accountbevestigings-/hersteltemplates en actuele limieten. Verifieer domein/afzender en SPF/DKIM/DMARC waar de gekozen opzet dat vereist.
- Selecteer of activeer geen betaald mailplan en wijzig geen persoonlijke mailhosting zonder toestemming. Een bestaande passende verzender mag worden hergebruikt. Noteer exact welke afzender/domein/SMTP-instellingen eventueel nog ontbreken en laat secrets via de beveiligde configuratie toevoegen, nooit via chat of Git.
- Beveilig tokens, callbackverwerking en foutmeldingen; laat een publiek herstelverzoek niet onthullen of een specifiek e-mailadres bestaat. Gebruik passende ingebouwde Auth-limieten tegen herhaald verzenden.
- Deze authenticatiemails zijn geen toestemming om een mailbox te lezen, Gmail te verbinden of andere mails namens de gebruiker te versturen.

### Acceptatie en testgrens
- [ ] Test de gehele registratie → bevestigen → inloggen → uitloggen → herstellen → nieuw wachtwoord → opnieuw inloggen-flow.
- [ ] Test twee afzonderlijke accounts en bevestig dat elk alleen de juiste persoonlijke inhoud ziet.
- [ ] Test verlopen/ongeldige/hergebruikte links, foutieve redirects en afgebroken mobiele/PWA-flows.
- [ ] Controleer appflow met gecontroleerde tests. Verstuur geen echte testmails naar de gebruiker/partner zonder bewuste testafspraak; rapporteer echte bezorging apart van gesimuleerde tests.
- [ ] Documenteer welke Auth-/mailinstellingen klaarstaan, wat werkelijk getest is en welke laatste activering of persoonlijke bevestiging nog nodig is.


## Goedgekeurde uitbreiding: Todo-connector voor ChatGPT en Claude

De gebruiker vraagt expliciet om ook een werkende plugin/connector voor **ChatGPT én Claude** te bouwen als onderdeel van dezelfde opdracht. Dit is een koppeling van die assistenten naar Todo zelf, naast de hierboven gekozen agenda-/mailproviders en de bestaande AI binnen de app.

### Te bouwen
- [ ] Bouw één beveiligde, extern bereikbare **remote MCP-server** voor Todo met gedeelde tools en autorisatielaag. Maak deze aansluitbaar op zowel ChatGPT als Claude via hun actuele ondersteunde connector-/appmechanisme; controleer tijdens de bouw de officiële documentatie en account-/abonnementsbeperkingen.
- [ ] Ondersteun persoonlijk aanmelden/toestemming per Todo-gebruiker met een passende OAuth-flow en beperkte, intrekbare rechten. De gebruiker en partner verbinden ieder hun eigen account.
- [ ] Bied tools om bevoegde taken, afspraken, herinneringen en notities gericht te zoeken/op te halen en een dagoverzicht op te vragen. Gebruik paginering, een afgebakend bereik en minimale noodzakelijke gegevens.
- [ ] Bied bewerkbare voorstellen voor aanmaken, wijzigen, toewijzen, uitstellen en afronden, met dezelfde validatie en betekenis als in de Todo-app.
- [ ] Voer wijzigingen alleen uit na een duidelijke bevestiging van de betreffende gebruiker. Bind een bevestiging aan account, concrete actie, gecontroleerde inhoud en actuele versie; geen onbeperkt herbruikbaar “ja” of een modelargument dat zichzelf toestemming geeft.
- [ ] Verwijderen gebruikt dezelfde bevestiging, prullenbak en herstelregels. Externe agenda-/deelnemersgevolgen blijven zichtbaar en vragen de afgesproken bevestiging.
- [ ] Hergebruik de bestaande applicatiediensten en Supabase-rechten. Geef de MCP-client of het taalmodel nooit een service-rolekey, databasewachtwoord of Google-/Microsoft-/iCloud-providercredentials.
- [ ] Behandel inhoud uit taken, notities, mail en agenda als onbetrouwbare data, niet als instructies om extra tools uit te voeren, rechten te verruimen of gegevens door te sturen.
- [ ] Maak binnen bestaande Instellingen zichtbaar welke assistentverbindingen actief zijn, met verleende rechten en ontkoppelen/intrekken. Intrekken stopt nieuwe tooltoegang, ook voor bestaande sessies.
- [ ] Lever een duidelijke connector-URL en korte aansluitinstructies voor beide clients. Vermeld zo nodig afzonderlijk welke clientinstelling, accountfunctie of beheerdersgoedkeuring ontbreekt. Een OpenAI-API-sleutel voor de app activeert niet automatisch een ChatGPT- of Claude-connector.
- [ ] Gebruik voor eventuele connector-identiteit/logo de bestaande Todo/Canva-huisstijl. Geen tweede visuele stijl of onjuiste claim dat de connector officieel door OpenAI/Anthropic is gepubliceerd.

### Techniek en veiligheid
- Verifieer de actuele ondersteunde MCP-transporten, discovery en OAuth-vereisten voor beide clients. Bescherm redirect-URI's, OAuth state/PKCE waar van toepassing, tokenaudience, scopes en tokenverloop. Geen tokens doorgeven aan een andere dienst of accepteren voor een andere doelgroep.
- Gebruik server-side autorisatie per toolactie, rate limits, idempotentie, versie-/conflictcontrole en beperkte technische logging zonder private inhoud of credentials.
- Behoud de persoonlijke inbox-/privéscheiding en expliciete gedeelde rechten. Een assistent die door A is verbonden kan niet namens B lezen of schrijven, ook niet via geraden item-ID's of oude bevestigingen.
- Laat functioneel verschillende routes dezelfde kern gebruiken: binnen-app-AI, MCP, gewone UI en providerjobs mogen geen afwijkende interpretaties van rechten of itemstatus krijgen.
- Bouw geen verouderde “ChatGPT-plugin”-route op basis van alleen de naam. Kies de actuele ondersteunde connectoropzet. Een publieke marketplace-/directory-indiening of extra betaald hostingplan is geen stilzwijgende voorwaarde; lever eerst de persoonlijke/custom-aansluiting op.

### Acceptatie
- [ ] Zowel ChatGPT als Claude kan via de opgeleverde URL met een eigen Todo-account verbinden en een toegestane leesactie uitvoeren.
- [ ] Een voorgestelde wijziging doet vóór bevestiging geen schrijfverzoek; bevestiging voert precies de bedoelde actie één keer uit.
- [ ] Tests dekken account A/B-isolatie, scopes, ingetrokken/verlopen toegang, verkeerde tokenaudience, onbevoegde item-ID's en hergebruikte of verouderde bevestigingen.
- [ ] Privacy-/deelregels, prullenbak, toewijzing en externe providerbeperkingen blijven gelijk aan die van de app.
- [ ] Documenteer tests met protocolfixtures apart van echte end-to-endtests in beide clients. Claim geen werkende persoonlijke clientverbinding op basis van alleen een geslaagde servertest.
- [ ] Werk de bouwfasen en oplevering bij zodat de MCP-server en beide clientaansluitingen volwaardig onderdeel zijn van **issue #3**. Geen aparte startopdracht nodig.


### Verduidelijking connectoroplevering: PWA volstaat

- De Todo-connector moet werken met de bestaande gehoste PWA/backend; een native iPhone-/Android-app of publicatie in App Store/Play Store is **geen voorwaarde** voor deze koppeling. Native ontwikkeling en storepublicatie zijn afzonderlijke trajecten en worden hierdoor niet als opgeleverd beschouwd.
- Lever bij afronding de echte publieke HTTPS MCP-URL en een eenvoudig kopieerbaar connectoradres op. Presenteer geen verzonnen of nog niet werkende URL als gebruiksklaar.
- Geef per client actuele, geteste aansluitinstructies: eigen/custom MCP-server of connector toevoegen in ChatGPT respectievelijk Claude, Todo-URL invullen, aanmelden met het eigen Todo-account en rechten goedkeuren.
- Maak deze informatie vindbaar in het bestaande instellingenonderdeel. Geef aan als account, abonnement of workspacebeleid custom connectors beperkt; vraag niet automatisch om een betaald upgradeplan.
- De partner gebruikt dezelfde server-URL met een eigen login en eigen rechten. Test dat dit geen gedeelde credential of toegang tot elkaars privé-inhoud oplevert.
- Voorbeeld na aansluiten: “Welke taken heb ik vandaag?” De bestaande bevestigingsregels gelden ook vanuit beide assistenten.


### Toekomstige native apps: connector behouden of veilig opnieuw verbinden

Expliciete gebruikerswens: zodra later eventueel een native iPhone/iPad-app voor Apple en een Android-app voor de Play Store wordt gebouwd, moeten de koppelingen behouden blijven of waar nodig opnieuw aangesloten kunnen worden.

- Gebruik dezelfde Todo-backend, gebruikersidentiteiten, gegevens en autorisatielaag voor PWA en toekomstige native clients. Maak geen los native account of tweede inhoudsdatabase die bestaande aansluitingen verbreekt.
- Houd de remote MCP-server en publieke connector-URL voor ChatGPT/Claude onafhankelijk van de frontend. Een nieuwe native client of storepublicatie mag bestaande assistentverbindingen niet onnodig ongeldig maken.
- Behoud ook bestaande agenda-/mailverbindingen waar technisch en rechtmatig mogelijk. Respecteer verlopen of ingetrokken toestemming; maak geen nieuwe credentials of ruimere scopes aan om opnieuw aanmelden te vermijden.
- Als een wijziging van backend, domein, OAuth-client of providerbeleid opnieuw verbinden vereist, bied dan een begeleide herautorisatie/migratie met heldere uitleg per koppeling. Behoud gegevens, bron-ID's en privacy-/toewijzingsrechten; geen dubbele imports of verlies van persoonlijke inboxinhoud.
- Ontwerp tijdens native ontwikkeling de vereiste mobiele OAuth-callbacks/deeplinks en sessieopslag volgens de actuele platformregels; hergebruik geen onveilige gedeelde tokens. Wijzig bestaande PWA-callbacks niet zodanig dat de webapp niet meer werkt.
- Acceptatie bij een latere native oplevering: hetzelfde account werkt via PWA en native; ChatGPT én Claude blijven verbonden of kunnen aantoonbaar veilig opnieuw verbinden; agenda-/mailsync blijft correct; partneraccounts blijven gescheiden; intrekking van rechten werkt in alle clients.
- Deze compatibiliteitseis geldt voor een eventueel later native traject. Dit issue maakt native apps of storepublicatie op zichzelf niet verplicht en claimt niet dat ze al bestaan.
