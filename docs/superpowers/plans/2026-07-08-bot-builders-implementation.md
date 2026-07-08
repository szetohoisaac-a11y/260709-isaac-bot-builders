# Bot Builders — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Bot Brawl game content with the Bot Builders game — rewrite `rulebook.js` and populate `assets.js` with ~44 cards across all 6 types, satisfying the existing test suite.

**Architecture:** Content-only changes. `rulebook.js` defines game rules via `window.RULEBOOK`. `assets.js` defines game pieces via `window.ASSETS`. The renderer (`gallery.js`, `gallery-core.js`, `index.html`, `styles.css`, `print.css`) is NOT modified. The gallery-core schema drives validation: `type: 'card'` requires `cost`/`atk`/`def`; `type: 'token'` requires `hp`; `type: 'tile'` requires no numbers. For bot cards, `def` is repurposed as HP (documented in the rulebook).

**Tech Stack:** Plain JavaScript objects in browser-global scripts. Node v18+ test runner (`node --test`). No build step.

## Global Constraints

- Do NOT edit `gallery.js`, `gallery-core.js`, `index.html`, `styles.css`, `print.css`, or any file in `scripts/`
- All assets must pass `GalleryCore.validateAsset()` (defined in `gallery-core.js`)
- All three families (`card`, `token`, `tile`) must be present (test requirement)
- IDs must be unique 3-digit strings: cards from `001`, tokens from `101`, tiles from `201`
- Rulebook must contain all 6 keys: `theme`, `howToPlay`, `aTurn`, `winCondition`, `pieces`, `ranges`
- Edit `assets.js` by replacing the closing `];` with new entries followed by `];` — keep existing formatting

---

### Task 1: Rewrite the rulebook

**Files:**
- Modify: `rulebook.js`

**Interfaces:**
- Produces: `window.RULEBOOK` with keys `theme`, `howToPlay`, `aTurn`, `winCondition`, `pieces`, `ranges`

- [ ] **Step 1: Write the new rulebook content**

Replace the entire contents of `rulebook.js` with:

```js
// Bot Builders — rulebook. Print-first: these rules print before the card gallery.
window.RULEBOOK = {
  theme: 'Engineers command squads of combat bots. Last base standing wins.',
  howToPlay: 'Auction-draft your squad, deploy bots to five positions, earn credits by scrapping enemy bots, and buy reinforcements from the shared market.',
  aTurn: 'Spend 3 Action Points to draw, buy from the market (1 AP + credits), play a bot or ability card, attack, activate a bot ability, or swap a position bot with the bench.',
  winCondition: 'Reduce every rival base from 20 HP to zero. The player who delivers the final hit scavenges one bot from the eliminated player — take it to your bench or hand.',
  pieces: '6 card types: Active Bots, Secondary Bots, Defensive Bots, Support Bots, Bench Bots, and one-shot Ability cards (Instants & Traps). Plus combat credits and a shared market deck.',
  ranges: 'Cards cost 0–5 credits. Active: ATK 3–7, HP 4–8. Secondary: ATK 1–4, HP 3–6. Defensive: ATK 0–2, HP 6–10. Support: ATK 0, HP 2–5. Bench: HP 2–8. Abilities: cost 0–3. On bot cards, DEF = HP.',
};
```

- [ ] **Step 2: Run the rulebook test**

```bash
npx node --test test/data.test.js --test-name-pattern="rulebook"
```
Expected: PASS (1 test passing)

- [ ] **Step 3: Commit**

```bash
git add rulebook.js
git commit -m "feat: rewrite rulebook for Bot Builders"
```

---

### Task 2: Add Active Bot cards

**Files:**
- Modify: `assets.js` — replace entire contents

**Interfaces:**
- Consumes: `window.ASSETS` array pattern from `gallery-core.js`
- Produces: 6 Active Bot cards (ids `001`–`006`), `type: 'card'` with `cost`/`atk`/`def`

- [ ] **Step 1: Replace assets.js with initial Active Bot cards**

Replace the entire contents of `assets.js` with:

```js
// Bot Builders — printable game-asset gallery.
// Cards use cost (credits), atk (damage), def (HP on bots).
window.ASSETS = [
  // ── Active Bots (primary attackers) ──────────────────────
  { id: '001', type: 'card', name: 'Striker', category: 'Active', cost: 3, atk: 4, def: 5,
    effect: 'Attack (1 AP): Deal 4 damage to target enemy bot.', flavor: 'Precision over power.', image: null },
  { id: '002', type: 'card', name: 'Brawler', category: 'Active', cost: 4, atk: 5, def: 6,
    effect: 'Attack (1 AP): Deal 5 damage to a bot or 3 to enemy base. Special (1 AP): +2 damage this turn.', flavor: 'Built for the front line.', image: null },
  { id: '003', type: 'card', name: 'Artillery', category: 'Active', cost: 5, atk: 7, def: 4,
    effect: 'Attack (1 AP): Deal 7 damage to a bot OR 4 to enemy base. Cannot target Defensive-position bots.', flavor: 'From a distance, with intent.', image: null },
  { id: '004', type: 'card', name: 'Commander', category: 'Active', cost: 4, atk: 3, def: 6,
    effect: 'Attack (1 AP): Deal 3 damage. Special (1 AP): Your Secondary Active deals +2 damage this turn.', flavor: 'Every squad needs a leader.', image: null },
  { id: '005', type: 'card', name: 'Saboteur', category: 'Active', cost: 3, atk: 3, def: 4,
    effect: 'Attack (1 AP): Deal 3 damage. Special (1 AP): Destroy one face-down trap an opponent controls.', flavor: 'Wires cut, plans ruined.', image: null },
  { id: '006', type: 'card', name: 'Assault Bot', category: 'Active', cost: 4, atk: 6, def: 5,
    effect: 'Attack (1 AP): Deal 6 damage to target enemy bot.', flavor: 'No subtlety. No mercy.', image: null },
];
```

- [ ] **Step 2: Run validation tests**

```bash
npx node --test test/data.test.js
```
Expected: FAIL — "all three families are represented" will fail because `token` and `tile` families are not yet present. But the first two tests (all valid + unique IDs) should PASS.

- [ ] **Step 3: Verify first two tests pass**

```bash
npx node --test test/data.test.js --test-name-pattern="seed data"
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add assets.js
git commit -m "feat: add 6 Active Bot cards (ids 001-006)"
```

---

### Task 3: Add Secondary Active Bot cards

**Files:**
- Modify: `assets.js` — append before `];`

**Interfaces:**
- Consumes: existing active bot entries
- Produces: 6 Secondary Active Bot cards (ids `007`–`012`)

- [ ] **Step 1: Append Secondary Active Bot entries**

In `assets.js`, replace the closing `];` with:

```js
  // ── Secondary Active Bots (flankers / debuffers) ─────────
  { id: '007', type: 'card', name: 'Scout', category: 'Secondary', cost: 2, atk: 2, def: 4,
    effect: 'Attack (1 AP): Deal 2 damage. On hit: target bot gets -1 ATK next turn.', flavor: 'Small, fast, annoying.', image: null },
  { id: '008', type: 'card', name: 'Disruptor', category: 'Secondary', cost: 3, atk: 3, def: 3,
    effect: 'Attack (1 AP): Deal 3 damage. On hit: target bot cannot use special abilities next turn.', flavor: 'Silence is a weapon.', image: null },
  { id: '009', type: 'card', name: 'Flanker', category: 'Secondary', cost: 2, atk: 3, def: 3,
    effect: 'Attack (1 AP): Deal 3 damage. If target has no adjacent ally bots, deal +2 instead.', flavor: 'Hit them where they\'re not looking.', image: null },
  { id: '010', type: 'card', name: 'Jammer', category: 'Secondary', cost: 2, atk: 1, def: 5,
    effect: 'Attack (1 AP): Deal 1 damage. On hit: enemy discards 1 random card from hand.', flavor: 'Interference on all channels.', image: null },
  { id: '011', type: 'card', name: 'Harasser', category: 'Secondary', cost: 3, atk: 4, def: 3,
    effect: 'Attack (1 AP): Deal 4 damage. On hit: target bot\'s ATK is halved (round down) next turn.', flavor: 'Death by a thousand pokes.', image: null },
  { id: '012', type: 'card', name: 'Scrambler', category: 'Secondary', cost: 2, atk: 2, def: 4,
    effect: 'Attack (1 AP): Deal 2 damage. On hit: swap target bot\'s ATK and DEF until end of next turn.', flavor: 'Turn their strength against them.', image: null },
];
```

- [ ] **Step 2: Run validation tests**

```bash
npx node --test test/data.test.js --test-name-pattern="seed data|asset ids"
```
Expected: PASS (2 tests)

- [ ] **Step 3: Commit**

```bash
git add assets.js
git commit -m "feat: add 6 Secondary Active Bot cards (ids 007-012)"
```

---

### Task 4: Add Defensive Bot cards

**Files:**
- Modify: `assets.js` — append before `];`

**Interfaces:**
- Consumes: existing active + secondary entries
- Produces: 4 Defensive Bot cards (ids `013`–`016`)

- [ ] **Step 1: Append Defensive Bot entries**

In `assets.js`, replace the closing `];` with:

```js
  // ── Defensive Bots (bodyguards / interceptors) ───────────
  { id: '013', type: 'card', name: 'Bulwark', category: 'Defensive', cost: 3, atk: 0, def: 8,
    effect: 'Guard: Intercept all attacks targeting your base. Reflect 1 damage back to attacker.', flavor: 'Step behind me.', image: null },
  { id: '014', type: 'card', name: 'Fortress', category: 'Defensive', cost: 4, atk: 1, def: 10,
    effect: 'Guard: Intercept all attacks targeting your base. This bot does not reflect damage.', flavor: 'An immovable wall.', image: null },
  { id: '015', type: 'card', name: 'Spike Wall', category: 'Defensive', cost: 3, atk: 2, def: 6,
    effect: 'Guard: Intercept attacks. Reflect 2 damage on hit. After reflecting: -1 DEF permanently.', flavor: 'Touch it and bleed.', image: null },
  { id: '016', type: 'card', name: 'Shield Drone', category: 'Defensive', cost: 2, atk: 0, def: 7,
    effect: 'Guard: Intercept attacks targeting your base. Once per turn: prevent 2 damage from one attack.', flavor: 'Constant, quiet protection.', image: null },
];
```

- [ ] **Step 2: Run validation tests**

```bash
npx node --test test/data.test.js --test-name-pattern="seed data|asset ids"
```
Expected: PASS (2 tests)

- [ ] **Step 3: Commit**

```bash
git add assets.js
git commit -m "feat: add 4 Defensive Bot cards (ids 013-016)"
```

---

### Task 5: Add Support Bot cards

**Files:**
- Modify: `assets.js` — append before `];`

**Interfaces:**
- Consumes: existing active + secondary + defensive entries
- Produces: 5 Support Bot cards (ids `017`–`021`)

- [ ] **Step 1: Append Support Bot entries**

In `assets.js`, replace the closing `];` with:

```js
  // ── Support Bots (healers / buffers) ─────────────────────
  { id: '017', type: 'card', name: 'Repair Bot', category: 'Support', cost: 2, atk: 0, def: 3,
    effect: 'Ability (1 AP): Restore 3 HP to target bot.', flavor: 'Welding torch at the ready.', image: null },
  { id: '018', type: 'card', name: 'Booster', category: 'Support', cost: 3, atk: 0, def: 2,
    effect: 'Ability (1 AP): Target Active or Secondary bot gains +2 ATK this turn.', flavor: 'Overclock and overdeliver.', image: null },
  { id: '019', type: 'card', name: 'Medic', category: 'Support', cost: 2, atk: 0, def: 4,
    effect: 'Ability (1 AP): Restore 5 HP to target bot. Once per turn.', flavor: 'Patch up and push on.', image: null },
  { id: '020', type: 'card', name: 'Overcharger', category: 'Support', cost: 3, atk: 0, def: 2,
    effect: 'Ability (1 AP): Target bot may attack twice this turn. Cannot use on consecutive turns.', flavor: 'Push the limit. Then push harder.', image: null },
  { id: '021', type: 'card', name: 'Shield Gen', category: 'Support', cost: 2, atk: 0, def: 3,
    effect: 'Ability (1 AP): Give target bot +3 DEF until your next turn.', flavor: 'A bubble of bad ideas for your enemies.', image: null },
];
```

- [ ] **Step 2: Run validation tests**

```bash
npx node --test test/data.test.js --test-name-pattern="seed data|asset ids"
```
Expected: PASS (2 tests)

- [ ] **Step 3: Commit**

```bash
git add assets.js
git commit -m "feat: add 5 Support Bot cards (ids 017-021)"
```

---

### Task 6: Add Instant ability cards

**Files:**
- Modify: `assets.js` — append before `];`

**Interfaces:**
- Consumes: existing bot entries (ids 001–021)
- Produces: 8 Instant ability cards (ids `022`–`029`)

- [ ] **Step 1: Append Instant ability card entries**

In `assets.js`, replace the closing `];` with:

```js
  // ── Ability Cards: Instants (one-shot, your turn) ────────
  { id: '022', type: 'card', name: 'Scrap Bomb', category: 'Instant', cost: 1, atk: 3, def: 0,
    effect: 'Play (1 AP): Deal 3 damage to any target bot.', flavor: 'One bot\'s trash is another\'s ammunition.', image: null },
  { id: '023', type: 'card', name: 'Overdrive', category: 'Instant', cost: 1, atk: 0, def: 0,
    effect: 'Play (1 AP): One bot gains +3 ATK this turn.', flavor: 'Redline it.', image: null },
  { id: '024', type: 'card', name: 'Salvage', category: 'Instant', cost: 1, atk: 0, def: 0,
    effect: 'Play (1 AP): Draw 2 cards and gain 1 credit.', flavor: 'Find value in the wreckage.', image: null },
  { id: '025', type: 'card', name: 'Emergency Repair', category: 'Instant', cost: 2, atk: 0, def: 0,
    effect: 'Play (1 AP): Restore 4 HP to your base.', flavor: 'Duct tape and determination.', image: null },
  { id: '026', type: 'card', name: 'Hack', category: 'Instant', cost: 2, atk: 0, def: 0,
    effect: 'Play (1 AP): Take control of target enemy bot this turn. It cannot attack its owner.', flavor: 'I\'m in. Your move.', image: null },
  { id: '027', type: 'card', name: 'Power Surge', category: 'Instant', cost: 3, atk: 0, def: 0,
    effect: 'Play (1 AP): Gain 2 extra AP this turn (use immediately).', flavor: 'Caffeine for circuits.', image: null },
  { id: '028', type: 'card', name: 'Parts Scavenge', category: 'Instant', cost: 0, atk: 0, def: 0,
    effect: 'Play (1 AP): Gain 3 credits. (Costs 0 credits — you only spend the AP.)', flavor: 'Everything has a use.', image: null },
  { id: '029', type: 'card', name: 'EMP Blast', category: 'Instant', cost: 2, atk: 2, def: 0,
    effect: 'Play (1 AP): Deal 2 damage to all bots of one chosen position type (all players).', flavor: 'Lights out, everybody.', image: null },
];
```

- [ ] **Step 2: Run validation tests**

```bash
npx node --test test/data.test.js --test-name-pattern="seed data|asset ids"
```
Expected: PASS (2 tests)

- [ ] **Step 3: Commit**

```bash
git add assets.js
git commit -m "feat: add 8 Instant ability cards (ids 022-029)"
```

---

### Task 7: Add Trap ability cards

**Files:**
- Modify: `assets.js` — append before `];`

**Interfaces:**
- Consumes: existing entries (ids 001–029)
- Produces: 6 Trap ability cards (ids `030`–`035`)

- [ ] **Step 1: Append Trap ability card entries**

In `assets.js`, replace the closing `];` with:

```js
  // ── Ability Cards: Traps (face-down, opponent turn) ──────
  { id: '030', type: 'card', name: 'Ambush', category: 'Trap', cost: 1, atk: 2, def: 0,
    effect: 'Trap: When an enemy bot attacks your base, deal 2 damage to it and negate 2 of the incoming damage.', flavor: 'They never see it coming.', image: null },
  { id: '031', type: 'card', name: 'Failsafe', category: 'Trap', cost: 1, atk: 0, def: 0,
    effect: 'Trap: When one of your bots would be destroyed, it survives with 1 HP instead. Then discard this.', flavor: 'One last backup routine.', image: null },
  { id: '032', type: 'card', name: 'Counter-Hack', category: 'Trap', cost: 2, atk: 0, def: 0,
    effect: 'Trap: When an enemy plays an Instant, negate it and gain 2 credits.', flavor: 'Nice try. My turn.', image: null },
  { id: '033', type: 'card', name: 'Tripwire', category: 'Trap', cost: 0, atk: 1, def: 0,
    effect: 'Trap: When an enemy plays a bot to any position, deal 1 damage to it.', flavor: 'Watch your step.', image: null },
  { id: '034', type: 'card', name: 'Signal Jam', category: 'Trap', cost: 1, atk: 0, def: 0,
    effect: 'Trap: When an enemy activates a bot\'s special ability, negate it.', flavor: 'No signal. No orders.', image: null },
  { id: '035', type: 'card', name: 'Retreat Order', category: 'Trap', cost: 1, atk: 0, def: 0,
    effect: 'Trap: When your bot would be destroyed, swap it to bench with 1 HP instead.', flavor: 'Live to fight another round.', image: null },
];
```

- [ ] **Step 2: Run validation tests**

```bash
npx node --test test/data.test.js --test-name-pattern="seed data|asset ids"
```
Expected: PASS (2 tests)

- [ ] **Step 3: Commit**

```bash
git add assets.js
git commit -m "feat: add 6 Trap ability cards (ids 030-035)"
```

---

### Task 8: Add Bench Bot tokens

**Files:**
- Modify: `assets.js` — append before `];`

**Interfaces:**
- Consumes: existing entries (ids 001–035, card family)
- Produces: 6 Bench Bot tokens (ids `101`–`106`), satisfies `token` family requirement

- [ ] **Step 1: Append Bench Bot token entries**

In `assets.js`, replace the closing `];` with:

```js
  // ── Bench Bots (backup units / generalists) ──────────────
  { id: '101', type: 'token', name: 'Scrapbot', category: 'Bench', hp: 4,
    effect: 'A cobbled-together backup. Swap into any position (1 AP).', flavor: 'Held together by spite.', image: null },
  { id: '102', type: 'token', name: 'Runner', category: 'Bench', hp: 3,
    effect: 'Fast and fragile. Swap from bench to position for 0 AP instead of 1.', flavor: 'Already there before you blinked.', image: null },
  { id: '103', type: 'token', name: 'Reserve Unit', category: 'Bench', hp: 5,
    effect: 'Standard backup bot. No special abilities. Reliable HP pool.', flavor: 'When you need a warm body in a cold chassis.', image: null },
  { id: '104', type: 'token', name: 'Repair Drone', category: 'Bench', hp: 2,
    effect: 'When swapped in from bench: restore 2 HP to one ally bot.', flavor: 'Comes with a tiny wrench.', image: null },
  { id: '105', type: 'token', name: 'Heavy Backup', category: 'Bench', hp: 7,
    effect: 'Tough reserve. Swap cost is 2 AP instead of 1 — plan ahead.', flavor: 'Slow off the bench, hard to knock down.', image: null },
  { id: '106', type: 'token', name: 'Tactical Reserve', category: 'Bench', hp: 6,
    effect: 'When swapped in from bench: draw 1 card.', flavor: 'It does the thinking while it waits.', image: null },
];
```

- [ ] **Step 2: Run validation tests**

```bash
npx node --test test/data.test.js --test-name-pattern="seed data|asset ids"
```
Expected: PASS (2 tests). The "all three families" test still fails (tiles missing).

- [ ] **Step 3: Commit**

```bash
git add assets.js
git commit -m "feat: add 6 Bench Bot tokens (ids 101-106)"
```

---

### Task 9: Add Workshop tiles

**Files:**
- Modify: `assets.js` — append before `];`

**Interfaces:**
- Consumes: existing entries (ids 001–035 cards, ids 101–106 tokens)
- Produces: 3 Workshop tiles (ids `201`–`203`), satisfies `tile` family requirement

- [ ] **Step 1: Append Workshop tile entries**

In `assets.js`, replace the closing `];` with:

```js
  // ── Workshop Tiles (optional base mods / play-area cards) ─
  { id: '201', type: 'tile', name: 'Workshop', category: 'Base Mod',
    effect: 'Once per turn: your first market purchase costs 1 fewer credit (minimum 0).', image: null },
  { id: '202', type: 'tile', name: 'Scrap Yard', category: 'Base Mod',
    effect: 'When any bot is destroyed: its controller gains +1 extra credit.', image: null },
  { id: '203', type: 'tile', name: 'Command Center', category: 'Base Mod',
    effect: 'Your first draw each turn costs 0 AP instead of 1.', image: null },
];
```

- [ ] **Step 2: Run all tests**

```bash
npx node --test test/data.test.js
```
Expected: all 4 tests PASS (seed data valid, unique IDs, all three families, rulebook sections)

- [ ] **Step 3: Commit**

```bash
git add assets.js
git commit -m "feat: add 3 Workshop tiles (ids 201-203)"
```

---

### Task 10: Verify end-to-end

**Files:**
- No changes — verification only

- [ ] **Step 1: Run the full test suite**

```bash
npx node --test test/*.test.js
```
Expected: all tests PASS

- [ ] **Step 2: Start the dev server and check the browser**

```bash
npx node serve.js
```
Open `http://localhost:5050` in a browser. Verify:
- Rulebook section shows Bot Builders rules (theme, how to play, win condition, etc.)
- Gallery shows three families: Cards (35 modules), Tokens (6 bots), Tiles (3 base mods)
- Print preview (File → Print) shows rulebook first, then all 44 cards
- No console errors

- [ ] **Step 3: Commit final verification**

```bash
git add -A
git commit -m "chore: final verification — all tests pass, gallery renders"
```

---

**Plan complete.** Total: 44 assets (35 cards, 6 tokens, 3 tiles) across 6 game types. All existing tests pass. Gallery renders correctly for screen and print.
