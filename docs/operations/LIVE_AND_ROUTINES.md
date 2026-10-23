# Vervolg 23 oktober 2026

## Live praten

Assistent heeft naast typen en opnemen een knop Livegesprek starten. Het gebruikt OpenAI Realtime over WebRTC (`gpt-realtime-2.1`, aanpasbaar met serversecret `OPENAI_REALTIME_MODEL`). SDP-onderhandeling loopt via de ingelogde Edge Function; er gaat geen permanente of tijdelijke API-sleutel naar de browser. Audio loopt tijdens de bewuste sessie rechtstreeks naar OpenAI. Antwoorden zijn gesproken en onderbreekbaar.

Dezelfde zoek-, weer- en beheervoorsteltools worden gebruikt als in de gewone assistent. Iedere toolaanroep wordt met de actuele gebruikers-JWT en RLS uitgevoerd; hij vereist ook een actieve eigen sessie. Alleen de echte gebruikers-transcriptie kan de exacte woorden “ja opslaan” / “ja uitvoeren” of “ja verwijderen” bevestigen. Gesproken tekst van de AI zelf kan geen acties bevestigen. Een knop blijft beschikbaar. De server voegt de inhoud niet vanzelf toe.

Bij stoppen, navigeren, verbergen van het tabblad of uitloggen worden lokale tracks, datachannel en peerverbinding gesloten. Ook bij stoppen tijdens microfoontoestemming en een laat verbindingsantwoord wordt opgeruimd. Het clientgesprek eindigt na maximaal 90 seconden. De registratie verloopt twee minuten na reservering, met maximaal 6 starts per account en 20 gezamenlijk per UTC-dag. Per sessie maximaal 12 data-/voorsteltools. Mislukte starts tellen ook mee om onbeperkte retries te voorkomen. Dit staat los van de bestaande quota voor gewone AI-vragen.

Een private registry bewaart uitsluitend sessie-ID, eigenaar, provider-call-ID, tijden en tellers. Alleen de server mag provider-ID’s vastleggen. De service-roleclient in todo-ai wordt uitsluitend voor sessieadministratie gebruikt; itemqueries houden de gebruikers-JWT. De bestaande Cron-dispatcher beëindigt verlopen provider-calls, ook als de browser geen stopverzoek meer kan versturen. Hangup wordt herhaald bij tijdelijke fouten; deze netwerkafhankelijke fallback is geen exacte kosten- of tijdgarantie. API-modeltoegang en tegoed moeten bij de bestaande OpenAI-organisatie beschikbaar zijn. Er is geen nieuw betaald plan of nieuwe API-sleutel aangemaakt.

Tests gebruiken een echte lokale PostgreSQL-database voor eigenaarschap, parallelle sessies, limieten, stoppen, te late attach en cleanup. Browser-tests simuleren de peerverbinding en upstream API: ze bewijzen opbouw, toolbrug, bevestiging en het stoppen van tracks. Echte microfoon-/luidspreker-/WebRTC-kwaliteit en het provider-model vereisen nog een ingelogd fysiek apparaat. Er is geen betaald modelverzoek als onderdeel van deze tests verstuurd.

Bronnen: [OpenAI WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc), [server-side controls](https://developers.openai.com/api/docs/guides/voice-server-controls), [hangup](https://developers.openai.com/api/reference/resources/realtime/subresources/calls/methods/hangup).

## Herhalende routines

Taken en herinneringen hebben Herhalen na afronden: dagelijks, wekelijks of maandelijks, met verplichte datum/tijd. Na afronden maakt één transactie precies één volgend open item. Eigendom, privacy, expliciete deelrechten en toewijzingen worden overgenomen; checkliststappen worden weer opengezet. Gemiste momenten worden overgeslagen tot de eerste toekomstige planning. Het is geen schema dat onafhankelijk van afronden nieuwe taken blijft aanmaken.

De oorspronkelijke lokale datum en kloktijd blijven het anker. Maandultimo schuift in een korte maand naar de laatste dag en keert in een langere maand terug naar de oorspronkelijke dag. Bij ontbrekende of dubbele lokale tijden wordt de latere interpretatie gekozen, gelijk in PostgreSQL en de Temporal-polyfill. Dagelijks en wekelijks zijn kalenderdagen, geen vaste blokken van 24 uur. Tests vergelijken beide engines op zomer-/wintertijd, schrikkeldag, maandultimo en meerjarige achterstand.

Herhaald afronden of heropenen/weer afronden maakt geen tweede vervolgitem. Heropenen verwijdert het bestaande vervolg niet. Stop een routine door Niet herhalen op het volgende open item te kiezen. Een gewijzigde datum/frequentie/tijdzone start een nieuw anker voor dat item. Een bestaand ouder-item wijzigen past reeds gemaakte vervolgitems niet aan. De bronrelatie wordt op eigenaar en gegevens gecontroleerd; een andere gebruiker kan geen privéslot voor een vervolg kapen.

Terugkerende agenda-afspraken en RRULE-uitbreiding zijn nog niet toegevoegd. Gebruik gewone afspraken of een externe agenda voor volledige reeksen. AI kan de herhaling op een taak/herinnering voorstellen; normale bevestiging en datumvalidatie blijven gelden.

## Agenda-import

Instellingen kan een iCalendar-bestand (.ics) lezen tot 200 kB en 100 losse afspraken. Parser en tijdzonebibliotheek worden pas bij bestandskeuze geladen. De gebruiker ziet een voorbeeld, kiest afspraken en bevestigt vóór opslag. Alle imports zijn privé en krijgen geen deelnemers of toewijzingen; er worden geen uitnodigingen verstuurd. Identieke UID’s worden met een eigenaargebonden SHA-256-kenmerk gededupliceerd, ook bij een herhaalde serveraanvraag. Een eigen Todo-export wordt herkend.

UTC, IANA-tijdzones, zwevende tijden met gekozen fallback, duur en hele dagen worden ondersteund. Voor hele dagen blijft de einddatum exclusief; een dag met zomertijd kan 23 uur zijn. Ingebedde aangepaste tijdzones worden alleen met beperkte jaarlijkse overgangsregels en een begrensd datumbereik geaccepteerd. Complexe of onbekende tijdzones worden geweigerd/gemeld. Deelnemers, bijlagen en alarmen worden genegeerd; inhoud wordt nooit als HTML uitgevoerd of automatisch opgehaald.

Herhalingen, herhalingsuitzonderingen, annuleringen en ongeldige afspraken worden zichtbaar overgeslagen. Een import wijzigt of verwijdert geen bestaande afspraken en synchroniseert geen provider. Geannuleerde afspraken moeten dus handmatig worden verwerkt. Voor echte Google/Outlook/iCloud-synchronisatie ontbreken nog gekozen provider, OAuth/CalDAV-inrichting en accountautorisatie.
