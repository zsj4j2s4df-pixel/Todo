# PWA-status

Manifest, SVG-icoon en service-workerregistratie zijn aanwezig. De nieuwe service worker verwijdert oude `shared-todo-*` caches en cachet geen requests, accountpagina's of privégegevens. De eerdere algemene GET-cache is verwijderd.

Lokale items worden opgeslagen in localStorage. Dat maakt de gegevens lokaal persistent, maar garandeert niet dat een gesloten app zonder netwerk kan worden geopend. Geen offline cloudschrijfqueue, achtergrondpush of gegarandeerde herinneringsmeldingen. De installatiemogelijkheden moeten nog op echte iOS-/Android-apparaten worden getest. Voor brede iconcompatibiliteit kunnen later aanvullende PNG-iconen worden toegevoegd.

Het manifest declareert nu een GET-share-target voor tekst, titel en URL. De app toont ontvangen invoer als concept en verwijdert de invoerparameters uit de huidige URL. Native deelbladondersteuning en installatie moeten nog per platform worden geverifieerd. Zie `docs/integrations/SHORTCUTS_AND_SHARE.md`.
