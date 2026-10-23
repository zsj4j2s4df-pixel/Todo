# OpenAI-assistent

## Beschikbaar

Het tabblad Assistent gebruikt OpenAI Responses API (`gpt-5-mini`, aanpasbaar via serversecret `OPENAI_MODEL`). De bestaande `OPENAI_API_KEY` moet uitsluitend bij Supabase Edge Function Secrets staan. De gebruiker heeft aangegeven die op 22 oktober 2026 te hebben geactiveerd. De app controleert ingelogd of de sleutel geconfigureerd is; er wordt geen sleutel naar de browser gestuurd.

- Typ een vraag of spreek maximaal 30 seconden in. Inspreken vereist microfoontoestemming en MediaRecorder-ondersteuning. Audio wordt via de beveiligde functie aan `gpt-4o-mini-transcribe` aangeboden; standaard controleer je de transcriptie voordat je verstuurt.
- Met “Na inspreken direct antwoord vragen” kan de transcriptie direct als vraag worden gebruikt. “Antwoord voorlezen” gebruikt de spraakstem van het apparaat; die is afhankelijk van browser en beschikbare stemmen.
- AI zoekt via een parametergebonden RLS-query in titels, notities, categorieën, locaties en checklists, met paginering. Tellingen gebruiken de volledige zichtbare dataset. Detailtools lezen één item; weer gebruikt de gekozen plaats uit briefingvoorkeuren en Open-Meteo.
- De AI kan voorstellen maken voor toevoegen, wijzigen, afronden, heropenen en verwijderen. Nieuwe items zijn privé. Het voorstel wordt pas uitgevoerd na de knop of een exacte bevestiging: “ja opslaan” / “ja uitvoeren”; verwijderen vereist “ja verwijderen”. Dit kan ook als ingesproken transcriptie binnenkomen.
- Bewerken kan via “Eerst bewerken”. Annuleren voert niets uit. Delen en huishoudrechten worden via het gewone itemformulier ingesteld.
- Wijzigen/verwijderen vergelijken de verwachte updated_at atomair. Afronden gebruikt een RPC met rijvergrendeling en versiecontrole. Een achterhaald voorstel faalt en vereist opnieuw ophalen.

## Rechten en budget

De server verifieert de echte Auth-gebruiker met getUser. Iedere gegevensquery draait met de JWT van die gebruiker en de bestaande RLS; de AI krijgt geen service-role databanktoegang. Beheer betekent bevoegdheden binnen het account: eigenaar mag details aanpassen/verwijderen, toegewezen personen mogen afronden. Er is geen tool voor DDL, SQL, willekeurige HTTP-verzoeken, wijzigingen aan huishouddrechten of accounts van anderen.

De gebruiker heeft gevraagd om beheer en toevoegen via spraak. Dit is geïmplementeerd als expliciet te bevestigen beheeracties, zodat onzekere interpretaties en instructies in opgeslagen tekst niet zelfstandig muteren. Database-inhoud is onbetrouwbare data in de modelinstructie; RLS en de beperkte acties vormen de daadwerkelijke grens.

Vraag maximaal 2000 tekens; audio maximaal 2 MiB; modeluitvoer maximaal 2000 tokens per API-ronde, maximaal vier rondes en drie tooloproepen per ronde. API-responses gebruiken `store:false`. Er wordt geen gespreksgeschiedenis in Todo bewaard en een nieuwe vraag bevat geen eerdere conversatie. OpenAI-verwerking valt onder de ingestelde API-organisatie/dataretentie; `store:false` is geen algemene nulretentiegarantie.

Serverlimieten: 12 aanvragen per gebruiker per uur, 40 per gebruiker per UTC-dag, en 200 gezamenlijk per UTC-dag. Transcriptie en tekstvragen tellen afzonderlijk; één tekstvraag kan meerdere begrensde modelrondes gebruiken. Quota staan in private tabellen en een beperkte auth-RPC. De sleuteleigenaar beheert daarnaast projectbudget en modeltoegang bij OpenAI. Er zijn tijdens tests geen betaalde modelverzoeken uitgevoerd.

## Verificatie en open punten

- Edge-code door Deno gecontroleerd; function `todo-ai` is live, gateway JWT-controle aan en server-side gebruikerscontrole verplicht.
- Live CORS-preflight geeft 204; anonieme POST geeft 401.
- Tests mocken uitsluitend de upstream modelrespons; de echte SQL-migraties testen RLS, zoekresultaten, tellingen en quota. De browsercontrole onderschept alle Supabase-aanroepen met synthetische fixtures en controleert dat een voorstel vóór bevestiging nul writes oplevert.
- Nog op een echt ingelogd apparaat controleren: API-sleutel/modelrechten/tegoed, een modelantwoord, microfoonopname, transcriptie, voorlezen en gesproken bevestiging. Een geconfigureerde sleutel alleen bewijst geen geslaagd modelverzoek.

## OpenAI Realtime / GPT Live

De opname/transcriptie-modus blijft beschikbaar. Daarnaast is een apart doorlopend OpenAI Realtime-gesprek gebouwd met WebRTC, dezelfde RLS-tools, expliciete bevestiging, sessieduur en server-cleanup. Zie [Live en routines](LIVE_AND_ROUTINES.md) voor de precieze limieten en testgrens. Dit gebruikt Realtime (`gpt-realtime-2.1`), niet de afzonderlijke GPT-Live-1 API. Echte provider- en apparaattests blijven open.

Bronnen: [Responses API](https://developers.openai.com/api/docs/guides/text), [spraak naar tekst](https://developers.openai.com/api/docs/guides/speech-to-text), [Realtime](https://developers.openai.com/api/docs/guides/realtime), [Supabase functie-autorisatie](https://supabase.com/docs/guides/functions/auth-headers).
