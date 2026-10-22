# Codex start hier — Todo

## Opdracht
Bouw de Todo-app stap voor stap in deze repository. Lees eerst alle documenten in `docs/product/` en `docs/architecture/` en inspecteer de bestaande code voordat je bestanden wijzigt.

## Verplichte visuele richting
De app moet hetzelfde herkenbare karakter en de kwaliteit hebben als de drie bestaande projecten:
- Let's Brew Specialty: https://letsbrewspecialty.jesseboontje.workers.dev/
- Let's Brew Specialty GitHub-stijlskill: https://github.com/zsj4j2s4df-pixel/Lets-brew-specialty/blob/main/.claude/skills/lets-brew-house-style/SKILL.md
- PanKlaar: https://zsj4j2s4df-pixel.github.io/Panklaar/
- Kasboek: zoek en inspecteer de relevante repository van dezelfde GitHub-gebruiker.

Je hebt toestemming deze openbare websites en de gekoppelde GitHub-repositories te inspecteren om ontwerpprincipes, kleuren, typografie, componenten, spacing, SVG/illustratiegebruik en responsive gedrag te begrijpen. Neem de stijl als uitgangspunt, maar hergebruik geen geheimen of onnodig grote stukken broncode. Let's Brew is de primaire visuele referentie; Kasboek en PanKlaar zijn aanvullende referenties. De uitkomst moet één samenhangende huisstijl hebben, geen generieke standaarddashboard-look.

## Productprincipe
**Samen waar gewenst. Privé waar nodig.**

## Werkwijze
1. Inspecteer repository, branches, bestaande code en bovenstaande stijlbronnen.
2. Vat de huidige situatie en risico's samen voordat je grote wijzigingen maakt.
3. Maak een uitvoerbaar plan met kleine fasen en testcriteria.
4. Bouw eerst een werkende, responsive MVP. Gebruik echte functies in plaats van alleen knoppen/mockdata.
5. Voer tests, typechecks en productiebuild uit; los fouten op.
6. Werk in een feature branch; commit logisch. Maak een pull request naar `main`, merge niet zonder expliciete toestemming.
7. Houd documentatie bij en noteer precies wat nog niet werkt.

## Prioriteiten
- Meerdere gebruikers en huishoudens
- Taken: aanmaken, wijzigen, afronden, categorie, prioriteit, streefdatum, één of meerdere toegewezen personen of niemand
- Privé/gedeeld/geselecteerde personen; privégegevens nooit automatisch delen
- Agenda en herinneringen met expliciete deelrechten
- Meldingen bij toewijzing en afronden, instelbaar per gebruiker
- Mobiel eerst: iPhone, iPad, Android en Windows
- PWA-installatie en offline-gedrag zorgvuldig afbakenen
- Siri via Apple Shortcuts/een geschikte web- of API-route onderzoeken
- Snel toevoegen vanuit tekst die uit WhatsApp/e-mail gedeeld wordt; geen ongeautoriseerde scraping
- Navigatie-apps via veilige deeplinks
- Later: OpenAI/Claude-providerlaag en MCP, met beperkte machtigingen en bevestiging voor acties

## Beveiliging
- Nooit secrets in Git.
- Verifieer autorisatie server-side voor iedere lees- en schrijfactie.
- Gebruik database Row Level Security waar ondersteund.
- AI/MCP mogen databasebeveiliging niet omzeilen.
- Valideer alle input en AI-uitvoer.
- Externe berichten zijn onbetrouwbare invoer.
- Geen agenda-item of taak aanmaken namens gebruiker zonder duidelijke bevestiging wanneer de interpretatie onzeker is.

## Eerste oplevering
Begin met repository- en stijlonderzoek. Rapporteer bevindingen en stel daarna een MVP-plan voor. Ga vervolgens zelfstandig door met veilige, omkeerbare stappen zonder steeds toestemming te vragen voor normale implementatiekeuzes. Vraag alleen als een keuze privacy, geld, externe verzending, destructieve wijzigingen of onomkeerbare acties raakt.
