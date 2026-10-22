# Oplevering 22 oktober 2026

De oorspronkelijke rootbestanden zijn op de juiste Next.js-locaties gezet. Tailwind was niet geïnstalleerd; de nieuwe interface gebruikt gewone CSS met centrale papier/inkt/geel-tokens, Caveat en Patrick Hand. Bronnen: Let's Brew house-style SKILL.md, PanKlaar index.html en Kasboek index.html; oudere Kasboek-brief wijkt af van de huidige broncode. Het koffie-specifieke gedrag en Engelstalige UI uit de referenties zijn niet overgenomen.

Fase 1 is gebouwd met lokale persistentie. Fasen 2–4 hebben clientfunctionaliteit plus een Supabase-migratie voor accounts, huishoudens en RLS; activering en live verificatie vereisen een echt Supabase-project. Agenda is een chronologische lijst. Herinneringen zijn opgeslagen items zonder achtergrondmeldingen. Snelle invoer en navigatielinks werken zonder AI. Fasen 5 en 7 zijn niet geïmplementeerd. Siri en native deelblad blijven onderzoek.

De architectuur is de al voorgestelde PostgreSQL/Supabase-richting met statische Next.js-export voor Cloudflare Pages. Geselecteerde shares en toewijzingen zijn UUID-arrays op items in plaats van losse tabellen. RLS bepaalt leesrechten; een databasetrigger valideert dat alle personen huishoudenlid zijn en toegewezen personen toegang hebben. Alleen de eigenaar kan details wijzigen/verwijderen. Toegewezen gebruikers kunnen afronden via een begrensde RPC. Er wordt geen database-RLS door clientlogica vervangen.

Buiten bereik: auditlog, lid verwijderen/huishouden verlaten, realtime abonnementen, notificatievoorkeuren, pushbezorging, herhaling, providerkoppelingen en live hosting. Geen secrets of service-rolecredentials toegevoegd. Zie README voor configuratie en beperkingen.

## Verificatie

- `npm run build`: statische productie-export slaagt.
- `npm run typecheck`: slaagt.
- `npm test`: 15 tests slagen, inclusief uitvoering van de echte RLS-migratie in PostgreSQL/PGlite.
- `npm run test:e2e`: 8 tests slagen op desktop (1440 px) en mobiel (390 px), ook tegen de productie-export.
- `npm audit --omit=dev`: 0 kwetsbaarheden na expliciete PostCSS 8.5.31 / Sharp 0.35.5 overrides; overrides opnieuw beoordelen bij een Next.js-upgrade.
- Desktop- en mobiele screenshots visueel gecontroleerd; CI voert de functionele controles opnieuw uit bij een PR.
- Niet geverifieerd: live Supabase Auth/e-mail, echte gedeelde sessies, Cloudflare-deployment, fysieke iPhone/iPad/Android-installatie en platformmeldingen.

Aanvulling: `.ics`-export met bevestiging, UTC-tijden, stabiele identifiers en ontsnapte/gevouwen tekstvelden. Asynchrone accountverzoeken kunnen na uitloggen of accountwissel geen oude gegevens terugplaatsen; dit is apart getest, ook bij terugkeer naar hetzelfde account.
