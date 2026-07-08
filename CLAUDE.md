# Bot Brawl kit — agent guide

This is a printable game-asset gallery. Content lives in two data files; everything else renders them.

## Where things are
- `assets.js` — `window.ASSETS`, an array of game pieces. **Add assets here**, appended before `];`.
- `rulebook.js` — `window.RULEBOOK`, your game's rules. **Edit the rulebook here.**
- `gallery.js`, `gallery-core.js`, `index.html`, `styles.css`, `print.css` — the renderer. **Do not edit these to add content.**
- `scripts/` — helper scripts you run, never rewrite.

## Asset schema (one entry in `assets.js`)
`{ id, type: 'card'|'token'|'tile', name, category, effect, flavor?, image?, cost?, atk?, def?, hp? }`
- Cards use `cost`, `atk`, `def`. Tokens use `hp`. Tiles use no numbers.
- `id` is a 3-digit string: cards from `001`, tokens from `101`, tiles from `201`.
- `image` is `null` (a placeholder shows) or a path under `assets/images/`.

## Running things
- See the gallery: `npm start`, then open `http://localhost:5050` and refresh after edits.
- Optional art: `node scripts/gen-asset-image.js "<prompt>" --type <type> --id <id>` (needs `GOOGLE_API_KEY` in `.env`; safe to skip).
- Check a key: `node scripts/test-key.js`.

Keep new assets inside the `ranges` in `rulebook.js`.
