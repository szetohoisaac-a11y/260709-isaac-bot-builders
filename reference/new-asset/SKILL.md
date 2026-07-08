---
name: new-asset
description: Add one game asset (card, token, or tile) that fits the rulebook, with art that matches the theme. Use when the user runs /new-asset.
---

# Add a new asset to the gallery

You are filling a Bot Brawl–style game-asset gallery. Follow these steps exactly.

1. **Read the rules.** Open `rulebook.js` and read `winCondition` and `ranges`. Open
   `assets.js` to see the existing entries and their ids.
2. **Pick a type and a fresh name.** Default to a `card` unless the user asked for a
   `token` or `tile`. The name must not already exist in `assets.js`.
3. **Choose the numbers, inside the rulebook ranges.** Cards need `cost`, `atk`, `def`;
   tokens need `hp`; tiles have no numbers. Stay within `rulebook.js` → `ranges`.
4. **Write what it does + a flavor line.** The `effect` must respect the win condition —
   nothing that makes a player win instantly.
5. **Pick the next id.** Cards count up from `001`, tokens from `101`, tiles from `201`.
   Use the highest existing id of that type, plus one, as a 3-digit string.
6. **(Optional) Generate art.** Run:
   `node scripts/gen-asset-image.js "<short art prompt>" --type <type> --id <id>`
   If it saves a PNG, set the entry's `image` to that path; otherwise leave `image: null`.
7. **Append the entry to `assets.js`,** as one object placed immediately before the
   closing `];`. Keep the existing formatting. Never edit the renderer (`gallery.js`, `gallery-core.js`, `index.html`, `styles.css`, `print.css`).

Then tell the user to refresh the browser to see it.
