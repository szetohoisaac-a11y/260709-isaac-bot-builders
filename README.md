# Bot Brawl — your game-asset gallery

A tiny, printable gallery for a tabletop game you design. You write a **skill** that fills it.

## Run it
You need Node (v18+). No install step.

```bash
npm start
```
(No npm? `node serve.js` does the same thing.)
Open **http://localhost:5050** in your browser. Edit a data file, then refresh.

## What's what
- `assets.js` — your game pieces (cards, tokens, tiles).
- `rulebook.js` — your game's rules.
- `index.html` / `styles.css` / `print.css` — the gallery (you don't edit these).
- `scripts/` — optional helpers (AI art, a shape export, a key check).

## Make it yours
1. Ask your agent to rewrite `rulebook.js` for your game.
2. Author a `/new-asset` skill, then run it to add pieces.
3. Print: **File → Print → Save as PDF** (the rulebook prints first, then your cards).

## Optional: AI art
Copy `.env.example` to `.env`, paste a `GOOGLE_API_KEY`, then `node scripts/test-key.js`.
No key? No problem — assets use clean placeholder art.

## For teachers
A working reference skill lives in `reference/new-asset/SKILL.md`. Copy it into
`.claude/skills/new-asset/SKILL.md` if a student needs a safety net.
