# Tier Studio
Mobile portrait-first tier list. Buildless ES modules deployed from dist/.

- `model.js`: tier definitions, card data, state transitions, versioned local storage.
- `app.js`: DOM views and interaction handlers. Current card is the first unassigned card; selecting a ranked card enters move mode.
- `style.css`: responsive viewport layout and design tokens. Board uses remaining height in 100dvh; ResizeObserver calculates tile size per row including wrapping.
- `index.html`: accessible page shell and editor.

The main page never scrolls. Card editor is a bounded modal with its own text area. Default demo has 12 food cards; custom sets support 1–30 cards. All cards remain visible at the cost of small labels in dense rows. No multiplayer or cloud state in this version.

Run through any static server with dist as root. No dependencies/build step. Extend TIERS for ranks, model for rules, and views separately. State storage uses version 1; future incompatible changes should migrate or increment its schema.
