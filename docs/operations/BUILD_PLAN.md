# Bouwplan voor Codex

## Fase 0 — Verkenning
- Inspecteer repo, huidige branch, package manager, tests, Cloudflare-instellingen en alle bestaande bestanden.
- Inspecteer Let's Brew, Kasboek, PanKlaar en de genoemde house-style skill.
- Rapporteer bevindingen, risico's en voorstel voor stack; wijzig nog geen kernbestanden.

## Fase 1 — Werkende basis
- Zorg dat install, dev, test en production build aantoonbaar werken.
- Maak responsive app-shell in de afgesproken huisstijl.
- Verwijder of label demo-inhoud zodat deze niet wordt aangezien voor echte gebruikersdata.

## Fase 2 — Gebruikers en toegang
- Kies een passend auth-systeem dat bij de stack en budget past.
- Implementeer huishoudens, uitnodigen/koppelen en server-side autorisatie.
- Voeg tests toe voor privacygrenzen.

## Fase 3 — Taken
- CRUD, meerdere/nul toewijzingen, categorie, prioriteit, streefdatum en status.
- Formuliervalidatie en lege-/laad-/foutstatussen.

## Fase 4 — Delen, agenda en herinneringen
- Private/shared/selected delen.
- Agenda-items en herinneringen.
- Controleer dat privé-items niet zichtbaar worden via API, UI, zoekfunctie of meldingen.

## Fase 5 — Meldingen
- Voorkeuren per gebruiker.
- Push subscription-registratie en server-side verzending.
- Test toestemming geweigerd, verlopen subscription en uitgeschakelde meldingen.

## Fase 6 — Quick Capture, Siri en navigatie
- Deel-/plak-invoer met bewerkbaar concept.
- Onderzoek Shortcuts-route en documenteer apparaatstappen.
- Navigatiedeep-links met locatievalidatie.

## Fase 7 — AI en MCP (na stabiele kern)
- Optionele providerinterface voor OpenAI/Claude.
- AI alleen voor extractie/suggesties; schema-validatie en gebruiker bevestigt wijzigingen.
- MCP-tools met minimale scopes en dezelfde beveiliging.

## Fase 8 — Productieklaar
- Tests, typecheck, build, toegankelijkheid, security review, documentatie en herstelplan.
- PR naar main met overzicht, screenshots indien mogelijk en openstaande beperkingen.

## Definition of Done
Een fase is pas klaar als tests/build slagen, beveiligingsregels zijn getest, documentatie klopt en bekende beperkingen expliciet zijn vermeld.
