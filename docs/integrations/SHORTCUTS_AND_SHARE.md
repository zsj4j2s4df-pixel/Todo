# Snelle invoer, deelblad en Apple Shortcuts

De app heeft een conceptinvoer via `/?capture=1&text=<URL-gecodeerde tekst>`. De velden `title`, `text` en `url` worden als gewone onbetrouwbare tekst samengevoegd (maximaal 5000 tekens). Het openen van de URL slaat niets op: eerst verschijnt de tekst, daarna een bewerkbaar concept, en pas Opslaan schrijft gegevens. Bij accountmodus is eerst inloggen nodig. Er worden geen WhatsApp- of e-mailinboxen uitgelezen.

## Apple Shortcuts / Siri-route

Na publicatie kun je op een iPhone een opdracht maken:

1. Open Opdrachten en maak een nieuwe opdracht met de naam **Voeg toe aan Todo**.
2. Voeg **Dicteer tekst** toe. Een variant voor het deelblad gebruikt **Ontvang tekst van het deelblad** als invoer.
3. Voeg **URL-codeer** toe en codeer de ontvangen/gedicteerde tekst.
4. Voeg een tekst/URL-actie toe met `https://JOUW-APP-ADRES/?capture=1&text=` gevolgd door de gecodeerde tekstvariabele.
5. Gebruik **Open URL's** om de Todo-app in Safari te openen. Controleer het concept in de app en sla het zelf op.

Dit is een webhandoff, geen native Siri-intent of stille achtergrondactie. De app bevat geen API-token in de URL. De stappen en gedrag van Siri, Safari en een geïnstalleerde PWA moeten nog op een echt toestel worden getest; actienamen kunnen per iOS-versie verschillen.

## Android / webdeelblad

Het webmanifest declareert een GET-share-target voor titel, tekst en URL. Ondersteunende browsers kunnen een geïnstalleerde PWA daarmee als deelbestemming aanbieden. Dit is niet op alle platformen beschikbaar en nog niet op fysieke apparaten geverifieerd. Als de app niet tussen deelbestemmingen staat, kopieer de tekst en gebruik **Snel invoeren** in Todo. De app leest of verstuurt niets op de achtergrond.

## Privacy van URL-invoer

De ontvangen parameters worden na inlezen uit de huidige browsergeschiedenisregel verwijderd. De eerste URL kan echter al in browser-, proxy- of hostinglogs voorkomen. Gebruik plakken in de app voor gevoelige inhoud. Er worden geen externe links automatisch geopend. Een concept wordt niet automatisch naar lokale of cloudopslag geschreven.

## Herkende datums

Alleen één volledige geldige datum (`dd-mm-jjjj` of `dd/mm/jjjj`) met één tijd (`uu:mm`) wordt als voorstel ingevuld. Meerdere datums/tijden, ontbrekende jaartallen en ongeldige datums blijven handmatig te kiezen. De gebruikte tijdzone is die van het apparaat. Controle van het concept blijft verplicht.
