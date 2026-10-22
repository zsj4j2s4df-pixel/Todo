# Technische architectuur

## Richtlijn
Inspecteer eerst de repository en bestaande Cloudflare-configuratie. Behoud werkende onderdelen tenzij er een aantoonbare reden is om ze te vervangen. Leg wijzigingen uit.

## Voorgestelde lagen
1. Responsive frontend/PWA
2. Server-side routes / application services
3. Authenticatie en autorisatie
4. Relationele database met rijbeveiliging
5. Integratie-adapters (meldingen, agenda, AI, navigatie)
6. Optionele MCP-adapter die dezelfde beveiligde application services gebruikt

## Cloudflare
De beoogde hosting is Cloudflare. Verifieer actuele compatibiliteit van het bestaande framework, buildcommando en deploycommando aan de hand van officiële documentatie en de huidige repository. Verander niet blind naar een nieuw framework. Zet de exacte werkende instellingen in de README.

## Data en privacy
- Gebruiker en huishouden zijn aparte concepten.
- Taken, agenda-items en herinneringen hebben eigenaar en expliciete zichtbaarheid.
- Geselecteerd delen gebruikt een aparte relatie/tabel, niet een lijst die uitsluitend client-side wordt vertrouwd.
- Autorisatie moet bij iedere serveractie worden afgedwongen.
- Tijdstippen worden eenduidig opgeslagen; toon ze in de lokale tijdzone van de gebruiker.

## Integraties
Elke integratie zit achter een adapter, heeft minimale rechten, kan worden uitgeschakeld en heeft een begrijpelijke foutstatus. Bewaar OAuth-tokens alleen server-side en versleuteld waar passend.

## AI/MCP
AI is optioneel en mag geen kernfunctionaliteit blokkeren. MCP-tools gebruiken dezelfde autorisatie, validatie, auditregistratie en bevestiging als de normale app. Geen directe databasecredentials aan modellen geven.
