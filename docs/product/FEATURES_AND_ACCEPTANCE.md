# Functies en acceptatiecriteria

## Taken
- Taak aanmaken, bekijken, wijzigen en afronden.
- Titel verplicht; omschrijving optioneel.
- Toewijzing ondersteunt één persoon, meerdere personen of niemand.
- Optionele categorie, prioriteit en streefdatum.
- Status en wijzigingsdatum worden opgeslagen.
- Fouten worden begrijpelijk getoond; dubbele verzending wordt waar mogelijk voorkomen.

## Privacy en delen
- Elke taak, herinnering en agenda-afspraak heeft zichtbaarheid: `private`, `shared` of `selected`.
- Alleen de eigenaar en expliciet toegestane gebruikers kunnen details lezen of wijzigen.
- Lidmaatschap van een huishouden geeft niet automatisch toegang tot privé-items.
- Rechten worden op de server gecontroleerd, niet alleen in de interface.

## Meldingen
- Gebruiker kan meldingstypen afzonderlijk aan- of uitzetten.
- Meldingen over toewijzing en afronding gaan uitsluitend naar gerechtigde ontvangers.
- Push werkt alleen na toestemming en ondersteuning door het platform; bied waar nodig een fallback.
- Geen echte pushbelofte totdat subscription-opslag en server-side verzending zijn geïmplementeerd en getest.

## Agenda en herinneringen
- Items kunnen privé, gedeeld of met geselecteerde personen gedeeld zijn.
- Datum, tijd, tijdzone en optionele locatie worden ondersteund.
- Terugkerende items alleen implementeren als opslag en tijdzonegedrag correct zijn.
- Privé-items mogen niet uitlekken via meldingen, zoekresultaten of AI-samenvattingen.

## Snelle invoer
- Accepteer geplakte of gedeelde tekst, bijvoorbeeld: “Reservering bij … om 17:00 op 30-08-2026”.
- Herken mogelijke datum/tijdformaten, toon een bewerkbaar concept en vraag bevestiging bij ambiguïteit.
- Sla niets automatisch op als de datum dubbelzinnig of onvolledig is.
- Bouw geen ongeautoriseerde koppeling die WhatsApp of e-mail uitleest.

## Navigatie
- Toon een navigatielink als een locatie beschikbaar is.
- Maak de gekozen provider verwisselbaar; valideer/encodeer locatieparameters.
- Toon geen verzonnen reistijden.

## Siri
- Onderzoek eerst Apple Shortcuts, deelblad en web-compatibele opties.
- Documenteer beperkingen van Safari/PWA en wat eventueel een server-endpoint vereist.
- Claim geen volledige Siri-integratie voordat deze op een echt apparaat getest is.

## Responsive en toegankelijk
- Bruikbaar op kleine mobiele schermen, tablet en desktop.
- Toetsenbordbediening, zichtbare focus, labels en voldoende contrast.
- Belangrijke acties hebben laad-, succes- en foutstatussen.
