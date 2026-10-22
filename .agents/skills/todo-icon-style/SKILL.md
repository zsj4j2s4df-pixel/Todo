---
name: todo-icon-style
description: Mandatory Todo hand-drawn Canva icon system, including app icons and UI icons.
---

# Todo icon style

Use this skill for every icon or illustration change in Todo.

- The approved source is the Canva coffee-brown pen family: [master sheet](https://www.canva.com/M/MAHYxDzIIZ8). Every edge must visibly wander: use real wobbly hand-drawn pen strokes, uneven pressure, imperfect joins and occasional partial sketch strokes. Never use ruler-straight lines or perfect geometric circles. Keep imperfect thin rounded strokes, open shapes, light paper and no lettering, gradients or yellow accents.
- All interface icons must use `components/AppIcon.tsx`, its explicit registry and the Canva-derived PNG masks in `public/icons/ui`. Never add stock icons, emoji, hand-coded SVG paths or a second icon library. Do not silently substitute an unrelated symbol.
- Original artwork and provenance live in `assets/icon-masters`. `scripts/build-icons.py` only crops, removes paper into an alpha channel and resizes. It must not redraw artwork. Keep source resolution honest; exported previews are raster sources, not vectors. Request a larger Canva export when large artwork is needed.
- For a missing symbol, use Canva generate-image with MEDIA reference `MAHYxDzIIZ8`. Prompt: "Match the reference hand-drawn coffee-brown pen icons on flat light paper; very visibly wobbly wandering pen strokes, uneven pressure and imperfect joins, drawn without a ruler; simple clear silhouette; no letters, shadows, gradients or yellow." Generate a coordinated batch where practical. Inspect it before adding it to the registry and record its media ID and source hash.
- All UI outlines and separators also use Canva pen sources: frame MEDIA `MAHYxChA8rA`, app icon MEDIA `MAHYxC2VE74`. Use `pen-frame.png` via border-image and `pen-line.png` for rules. Avoid straight CSS borders, box-shadow outlines and a second line style. Preserve visible keyboard focus for accessibility.
- Recolor through CSS `currentColor`; simple rotations of the same arrow/plus are permitted. Preserve accessible text labels; decorative icons are aria-hidden.
- Use paper #efe9dd, card #f8f4ec, ink #3a302a, accent #755a43, soft accent #e3d6c6, light text #fffaf2. Validate button text contrast and keyboard focus.
- Before shipping, run the icon source check, typecheck and production build. Inspect desktop and narrow mobile screenshots. Do not merge main without user permission.
