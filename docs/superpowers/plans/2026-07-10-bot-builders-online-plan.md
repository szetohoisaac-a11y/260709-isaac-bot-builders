# Bot Builders Online — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-playable Bot Builders game with shared-screen (2P) and per-device (2–6P) modes, reusing the existing printable gallery data.

**Architecture:** Pure-JS game engine (`engine.js`) runs in browser (shared-screen) or server (per-device). Card effects are functions keyed by card ID. The same engine code powers both modes. UI (`play.html` + `play.js` + `play.css`) reads engine state and renders. WebSocket server (`server/ws-server.js`) handles room management and state relay for per-device mode.

**Tech Stack:** Vanilla JS (no framework), Node.js `ws` library for WebSocket, CSS Grid/Flexbox for layout. All existing files in `assets.js`, `rulebook.js` reused unchanged.

## Global Constraints

- Do NOT modify `assets.js`, `rulebook.js`, `gallery.js`, `gallery-core.js`, `index.html`, `styles.css`, `print.css`, or any file in `scripts/`
- Game engine must be pure JS with zero DOM or Node.js dependencies — runnable in both browser and server
- Card effects must be functions `(state, sourcePlayerId, target) → { newState, logEntry }` — immutable state updates
- Shared-screen mode requires no server
- Per-device mode uses WebSocket for communication
- All 40 cards must be playable with correct mechanics
- Room codes: 4 uppercase letters
- Base HP: 20 per player
- AP per turn: 3
- Starting credits: 5
- Bench capacity: 6

---

### Task 1: Engine foundation — state, deck, turn structure

**Files:**
- Create: `engine.js`
- Create: `test/engine.test.js`

**Interfaces:**
- Produces:
  - `createGame(playerNames)` → `gameState`
  - `shuffleDeck(cards)` → `cards[]`
  - `drawCard(state, playerId)` → `{ newState, logEntry }`
  - `startTurn(state)` → `{ newState, logEntry }`
  - `endTurn(state, playerId)` → `{ newState, logEntry }`
  - `playBotToPosition(state, playerId, cardId, position)` → `{ newState, logEntry }`
  - `getActivePlayer(state)` → `player`
  - `loadCards()` → `cards[]` (reads from `window.ASSETS` or `assets.js`)

- [ ] **Step 1: Create engine.js with state factory and core functions**

```js
// engine.js — Pure JS game engine. No DOM or Node dependencies.
(function () {
  const ENGINE = {};

  // Copy a state object deeply (simple JSON-safe objects only)
  ENGINE.clone = (s) => JSON.parse(JSON.stringify(s));

  // Load card definitions from window.ASSETS (browser) or require (Node)
  ENGINE.loadCards = function () {
    if (typeof window !== 'undefined' && window.ASSETS) return window.ASSETS;
    if (typeof require !== 'undefined') {
      const path = require('path');
      const vm = require('vm');
      const fs = require('fs');
      const code = fs.readFileSync(path.join(__dirname, 'assets.js'), 'utf8');
      const sandbox = { window: {} }; sandbox.globalThis = sandbox;
      vm.createContext(sandbox); vm.runInContext(code, sandbox);
      return sandbox.window.ASSETS;
    }
    return [];
  };

  // Fisher-Yates shuffle
  ENGINE.shuffle = function (arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // Generate a 4-letter room code
  ENGINE.roomCode = function () {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    let s = '';
    for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  };

  // Create a fresh game state
  ENGINE.createGame = function (playerNames, mode) {
    const allCards = ENGINE.loadCards();
    // Build Bot Shop deck per rulebook composition
    const botShop = [];
    const x2 = ['Artillery','Brawler','Commander','Assault Bot','Breacher','Displacer','Fortress'];
    const x3 = ['Striker','Saboteur','Scout','Disruptor','Flanker','Jammer','Harasser','Scrambler','Bulwark','Spike Wall','Shield Drone','Nullifier','Repair Bot','Booster','Medic','Overcharger','Shield Gen','Bounty Drone','System Shock','Power Surge'];
    const x4 = ['Scrap Bomb','Overdrive','Salvage','Emergency Repair','Hack','Parts Scavenge','EMP Blast','Ambush','Failsafe','Counter-Hack','Tripwire','Signal Jam','Retreat Order'];
    const byName = {};
    for (const c of allCards) byName[c.name] = c;
    const addCopies = (names, n) => { for (const nm of names) { const card = byName[nm]; if (card) for (let i=0;i<n;i++) botShop.push({...card}); } };
    addCopies(x2, 2); addCopies(x3, 3); addCopies(x4, 4);

    // Starting deck per player (13 baseline cards)
    const starter = [];
    const addStarter = (name, n) => { const card = byName[name]; if (card) for (let i=0;i<n;i++) starter.push({...card}); };
    addStarter('Striker',1); addStarter('Brawler',1); addStarter('Scout',1); addStarter('Shield Drone',1);
    addStarter('Repair Bot',2); addStarter('Salvage',3); addStarter('Parts Scavenge',2);
    addStarter('Retreat Order',2); addStarter('Emergency Repair',1); addStarter('Failsafe',1);

    const players = playerNames.map((name, i) => ({
      id: i + 1,
      name,
      baseHP: 20,
      credits: 5,
      deck: ENGINE.shuffle(starter.slice()),
      hand: [],
      discard: [],
      board: { active: null, secondary: null, defensive: null, support: null, bench: new Array(6).fill(null) },
      traps: [],
      ap: 0,
    }));

    const state = {
      phase: 'playing',
      mode: mode || 'shared',
      turn: 0,
      activePlayer: 1,
      players,
      marketRow: [],
      marketDeck: ENGINE.shuffle(botShop),
      turnLog: [],
      winner: null,
    };

    // Fill market row with 3 cards
    for (let i = 0; i < 3; i++) {
      if (state.marketDeck.length) state.marketRow.push(state.marketDeck.pop());
    }

    return state;
  };

  // Draw a card from player's deck
  ENGINE.drawCard = function (state, playerId) {
    const s = ENGINE.clone(state);
    const p = s.players.find(pl => pl.id === playerId);
    if (!p) return { newState: s, logEntry: null, error: 'Player not found' };
    if (p.ap < 1) return { newState: s, logEntry: null, error: 'Not enough AP' };
    if (!p.deck.length && !p.discard.length) return { newState: s, logEntry: null, error: 'No cards to draw' };
    if (!p.deck.length) { p.deck = ENGINE.shuffle(p.discard); p.discard = []; }
    const card = p.deck.pop();
    p.hand.push(card);
    p.ap -= 1;
    s.turnLog.push({ time: Date.now(), playerId, msg: `${p.name} drew a card.` });
    return { newState: s, logEntry: s.turnLog[s.turnLog.length - 1] };
  };

  // Start a player's turn
  ENGINE.startTurn = function (state) {
    const s = ENGINE.clone(state);
    const p = s.players.find(pl => pl.id === s.activePlayer);
    if (!p) return { newState: s };
    p.ap = 3;
    s.turnLog.push({ time: Date.now(), playerId: p.id, msg: `${p.name}'s turn begins.` });
    // Auto-draw 1 card at turn start
    if (p.deck.length || p.discard.length) {
      if (!p.deck.length) { p.deck = ENGINE.shuffle(p.discard); p.discard = []; }
      const card = p.deck.pop();
      p.hand.push(card);
      s.turnLog.push({ time: Date.now(), playerId: p.id, msg: `${p.name} drew 1 card (turn start).` });
    }
    return { newState: s };
  };

  // End a player's turn
  ENGINE.endTurn = function (state, playerId) {
    const s = ENGINE.clone(state);
    const p = s.players.find(pl => pl.id === playerId);
    if (!p || p.id !== s.activePlayer) return { newState: s, error: 'Not your turn' };
    s.turnLog.push({ time: Date.now(), playerId, msg: `${p.name} ended their turn.` });
    // Find next active player
    const alive = s.players.filter(pl => pl.baseHP > 0);
    const curIdx = alive.findIndex(pl => pl.id === playerId);
    const next = alive[(curIdx + 1) % alive.length];
    s.activePlayer = next.id;
    p.ap = 0;
    const result = ENGINE.startTurn(s);
    return { newState: result.newState };
  };

  // Play a bot card to a position
  ENGINE.playBotToPosition = function (state, playerId, cardId, position) {
    const s = ENGINE.clone(state);
    const p = s.players.find(pl => pl.id === playerId);
    if (!p) return { newState: s, error: 'Player not found' };
    if (p.ap < 1) return { newState: s, error: 'Not enough AP' };
    const idx = p.hand.findIndex(c => c.id === cardId && (c.type === 'card'));
    if (idx === -1) return { newState: s, error: 'Card not in hand' };
    if (!['active','secondary','defensive','support','bench'].includes(position)) {
      return { newState: s, error: 'Invalid position' };
    }
    const card = p.hand.splice(idx, 1)[0];
    if (position === 'bench') {
      const benchIdx = p.board.bench.findIndex(b => b === null);
      if (benchIdx === -1) return { newState: s, error: 'Bench full' };
      p.board.bench[benchIdx] = card;
    } else {
      const old = p.board[position];
      if (old) {
        const bIdx = p.board.bench.findIndex(b => b === null);
        if (bIdx === -1) { p.discard.push(old); }
        else { p.board.bench[bIdx] = old; }
      }
      p.board[position] = card;
    }
    p.ap -= 1;
    s.turnLog.push({ time: Date.now(), playerId, msg: `${p.name} played ${card.name} → ${position}.` });
    return { newState: s, logEntry: s.turnLog[s.turnLog.length - 1] };
  };

  // Swap bench bot with position bot
  ENGINE.swapBench = function (state, playerId, benchIndex, position) {
    const s = ENGINE.clone(state);
    const p = s.players.find(pl => pl.id === playerId);
    if (!p) return { newState: s, error: 'Player not found' };
    if (p.ap < 1) return { newState: s, error: 'Not enough AP' };
    if (benchIndex < 0 || benchIndex > 5 || !p.board.bench[benchIndex]) return { newState: s, error: 'No bot on bench slot' };
    const benchBot = p.board.bench[benchIndex];
    const posBot = p.board[position] || null;
    p.board.bench[benchIndex] = posBot;
    p.board[position] = benchBot;
    p.ap -= 1;
    s.turnLog.push({ time: Date.now(), playerId, msg: `${p.name} swapped ${benchBot.name} ↔ ${position}.` });
    return { newState: s, logEntry: s.turnLog[s.turnLog.length - 1] };
  };

  // Get the active player
  ENGINE.getActivePlayer = function (state) {
    return state.players.find(p => p.id === state.activePlayer);
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = ENGINE;
  if (typeof window !== 'undefined') window.GameEngine = ENGINE;
})();
```

- [ ] **Step 2: Create test/engine.test.js with foundation tests**

```js
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { loadGlobals } = require('./helpers/load-globals.js');
const kit = (f) => path.join(__dirname, '..', f);

// Load assets so engine can find cards
loadGlobals(kit('assets.js'));

const E = require('../engine.js');

test('createGame builds state with correct player count', () => {
  const s = E.createGame(['Alice', 'Bob'], 'shared');
  assert.equal(s.players.length, 2);
  assert.equal(s.players[0].name, 'Alice');
  assert.equal(s.players[0].baseHP, 20);
  assert.equal(s.players[0].credits, 5);
  assert.equal(s.mode, 'shared');
  assert.equal(s.marketRow.length, 3);
  assert.ok(s.marketDeck.length > 0);
});

test('startTurn refills AP and draws a card', () => {
  const s = E.createGame(['Alice', 'Bob'], 'shared');
  // Give Alice some cards in deck
  s.players[0].deck = [{ id: '999', type: 'card', name: 'Test', category: 'Test', effect: 'test', cost: 1, atk: 1, def: 1, image: null }];
  const result = E.startTurn(s);
  assert.equal(result.newState.players[0].ap, 3);
  assert.equal(result.newState.players[0].hand.length, 1);
});

test('drawCard costs 1 AP', () => {
  const s = E.createGame(['Alice'], 'shared');
  s.players[0].ap = 3;
  s.players[0].deck = [{ id: '999', type: 'card', name: 'Test', category: 'Test', effect: 'test', cost: 1, atk: 1, def: 1, image: null }];
  const result = E.drawCard(s, 1);
  assert.equal(result.newState.players[0].ap, 2);
  assert.equal(result.newState.players[0].hand.length, 1);
});

test('playBotToPosition places card and costs AP', () => {
  const s = E.createGame(['Alice'], 'shared');
  s.players[0].ap = 3;
  s.players[0].hand = [{ id: '001', type: 'card', name: 'Striker', category: 'Active', cost: 3, atk: 4, def: 5, effect: 'test', image: null }];
  // Load cards so the card exists in allCards
  const result = E.playBotToPosition(s, 1, '001', 'active');
  assert.equal(result.newState.players[0].ap, 2);
  assert.equal(result.newState.players[0].hand.length, 0);
  assert.equal(result.newState.players[0].board.active.name, 'Striker');
});

test('swapBench exchanges bench and position bots', () => {
  const s = E.createGame(['Alice'], 'shared');
  s.players[0].ap = 3;
  s.players[0].board.active = { id: '001', type: 'card', name: 'Striker', category: 'Active', cost: 3, atk: 4, def: 5, effect: 'test', image: null };
  s.players[0].board.bench[0] = { id: '002', type: 'card', name: 'Brawler', category: 'Active', cost: 4, atk: 5, def: 6, effect: 'test', image: null };
  const result = E.swapBench(s, 1, 0, 'active');
  assert.equal(result.newState.players[0].ap, 2);
  assert.equal(result.newState.players[0].board.active.name, 'Brawler');
  assert.equal(result.newState.players[0].board.bench[0].name, 'Striker');
});

test('endTurn advances to next player', () => {
  const s = E.createGame(['Alice', 'Bob'], 'shared');
  s.activePlayer = 1;
  s.players[0].ap = 1;
  // Give both players cards in deck
  s.players[0].deck = [{ id: '999', type: 'card', name: 'Test', category: 'Test', effect: 'test', cost: 1, atk: 1, def: 1, image: null }];
  s.players[1].deck = [{ id: '999', type: 'card', name: 'Test', category: 'Test', effect: 'test', cost: 1, atk: 1, def: 1, image: null }];
  const result = E.endTurn(s, 1);
  assert.equal(result.newState.activePlayer, 2);
  assert.equal(result.newState.players[1].ap, 3);
});
```

- [ ] **Step 3: Run tests**

```bash
npx node --test test/engine.test.js
```
Expected: all 6 tests PASS

- [ ] **Step 4: Commit**

```bash
git add engine.js test/engine.test.js
git commit -m "feat: game engine foundation — state, turn, deck, play, swap"
```

---

### Task 2: Engine — damage, attacks, Breacher

**Files:**
- Modify: `engine.js` — add attack and damage functions
- Modify: `test/engine.test.js` — add attack tests

**Interfaces:**
- Produces:
  - `ENGINE.dealDamage(state, targetPlayerId, targetPosition, amount)` → `{ newState, destroyed, logEntry }`
  - `ENGINE.attack(state, playerId, botPosition, targetPlayerId, targetType, targetPosition?)` → `{ newState, logEntry }`
  - `ENGINE.breacherAttack(state, playerId, targetPlayerId, targetType)` → `{ newState, logEntry }`

- [ ] **Step 1: Add damage and attack functions to engine.js**

Append before the module.exports/window line:

```js
  // Deal damage to a bot or base. Returns destroyed bot if applicable.
  ENGINE.dealDamage = function (state, targetPlayerId, targetType, targetPosition, amount) {
    const s = ENGINE.clone(state);
    const p = s.players.find(pl => pl.id === targetPlayerId);
    if (!p) return { newState: s, destroyed: null };
    let destroyed = null;
    if (targetType === 'base') {
      p.baseHP = Math.max(0, p.baseHP - amount);
    } else if (targetType === 'bot' && targetPosition) {
      const bot = p.board[targetPosition];
      if (!bot) return { newState: s, destroyed: null };
      bot.def = (bot.def || 0) - amount;
      if (bot.def <= 0) {
        destroyed = bot;
        p.board[targetPosition] = null;
        p.discard.push(bot);
      }
    }
    return { newState: s, destroyed };
  };

  // Attack: bot at position attacks a target
  ENGINE.attack = function (state, playerId, botPosition, targetPlayerId, targetType, targetPosition) {
    const s = ENGINE.clone(state);
    const attacker = s.players.find(pl => pl.id === playerId);
    if (!attacker) return { newState: s, error: 'Attacker not found' };
    if (attacker.ap < 1) return { newState: s, error: 'Not enough AP' };
    const bot = attacker.board[botPosition];
    if (!bot) return { newState: s, error: 'No bot in position' };
    const atk = bot.atk || 0;
    attacker.ap -= 1;

    // Check for traps on defender
    const defender = s.players.find(pl => pl.id === targetPlayerId);
    if (defender && defender.traps && defender.traps.length) {
      for (let i = defender.traps.length - 1; i >= 0; i--) {
        const trap = defender.traps[i];
        if (trap.name === 'Ambush' && targetType === 'base') {
          const result = ENGINE.dealDamage(s, playerId, 'bot', botPosition, 2);
          result.newState.players.find(pl => pl.id === targetPlayerId).traps.splice(i, 1);
          const dmgResult = ENGINE.dealDamage(result.newState, targetPlayerId, targetType, targetPosition, Math.max(0, atk - 2));
          dmgResult.newState.turnLog.push({ time: Date.now(), playerId: targetPlayerId, msg: `${defender.name}'s Ambush triggered! Dealt 2 damage to ${bot.name}.` });
          dmgResult.newState.turnLog.push({ time: Date.now(), playerId, msg: `${attacker.name}'s ${bot.name} attacked ${defender.name}'s ${targetType} for ${Math.max(0, atk - 2)} damage.` });
          return { newState: dmgResult.newState, logEntry: dmgResult.newState.turnLog[dmgResult.newState.turnLog.length - 1] };
        }
      }
    }

    const result = ENGINE.dealDamage(s, targetPlayerId, targetType, targetPosition, atk);
    result.newState.turnLog.push({ time: Date.now(), playerId, msg: `${attacker.name}'s ${bot.name} attacked ${defender ? defender.name : '?'}'s ${targetType} for ${atk} damage.` });
    return { newState: result.newState, logEntry: result.newState.turnLog[result.newState.turnLog.length - 1], destroyed: result.destroyed };
  };

  // Breacher attack: bypasses Defensive bots when targeting base
  ENGINE.breacherAttack = function (state, playerId, targetPlayerId, targetType) {
    if (targetType === 'base') {
      // Bypass defensive intercept — deal damage directly to base
      const s = ENGINE.clone(state);
      const attacker = s.players.find(pl => pl.id === playerId);
      if (!attacker || attacker.ap < 1) return { newState: s, error: 'Not enough AP' };
      const bot = attacker.board.active;
      if (!bot) return { newState: s, error: 'No bot' };
      attacker.ap -= 1;
      const result = ENGINE.dealDamage(s, targetPlayerId, 'base', null, bot.atk || 0);
      result.newState.turnLog.push({ time: Date.now(), playerId, msg: `${attacker.name}'s Breacher bypassed defenses and dealt ${bot.atk} damage to ${result.newState.players.find(p=>p.id===targetPlayerId).name}'s base!` });
      return { newState: result.newState };
    }
    // vs bot: normal attack
    return ENGINE.attack(state, playerId, 'active', targetPlayerId, 'bot', 'active');
  };
```

- [ ] **Step 2: Add attack tests to test/engine.test.js**

```js
test('attack deals damage to target bot', () => {
  const s = E.createGame(['Alice', 'Bob'], 'shared');
  s.players[0].ap = 3;
  s.players[0].board.active = { id: '001', type: 'card', name: 'Striker', category: 'Active', cost: 3, atk: 4, def: 5, effect: 'test', image: null };
  s.players[1].board.active = { id: '002', type: 'card', name: 'Brawler', category: 'Active', cost: 4, atk: 5, def: 6, effect: 'test', image: null };
  const result = E.attack(s, 1, 'active', 2, 'bot', 'active');
  assert.equal(result.newState.players[0].ap, 2);
  // Brawler should have taken 4 damage (def from 6 to 2)
  assert.equal(result.newState.players[1].board.active.def, 2);
});

test('attack kills bot when HP reaches 0', () => {
  const s = E.createGame(['Alice', 'Bob'], 'shared');
  s.players[0].ap = 3;
  s.players[0].board.active = { id: '001', type: 'card', name: 'Striker', category: 'Active', cost: 3, atk: 10, def: 5, effect: 'test', image: null };
  s.players[1].board.active = { id: '002', type: 'card', name: 'Scout', category: 'Secondary', cost: 2, atk: 2, def: 4, effect: 'test', image: null };
  const result = E.attack(s, 1, 'active', 2, 'bot', 'active');
  assert.equal(result.newState.players[1].board.active, null);
  assert.ok(result.destroyed);
  assert.equal(result.destroyed.name, 'Scout');
});

test('breacher vs base bypasses defensive bot', () => {
  const s = E.createGame(['Alice', 'Bob'], 'shared');
  s.players[0].ap = 3;
  s.players[0].board.active = { id: '007', type: 'card', name: 'Breacher', category: 'Active', cost: 4, atk: 3, def: 6, effect: 'test', image: null };
  s.players[1].board.defensive = { id: '016', type: 'card', name: 'Fortress', category: 'Defensive', cost: 4, atk: 0, def: 10, effect: 'test', image: null };
  const result = E.breacherAttack(s, 1, 2, 'base');
  // Base should take 3 damage directly, Fortress untouched
  assert.equal(result.newState.players[1].baseHP, 17);
  assert.equal(result.newState.players[1].board.defensive.def, 10);
});
```

- [ ] **Step 3: Run tests**

```bash
npx node --test test/engine.test.js
```
Expected: all 9 tests PASS

- [ ] **Step 4: Commit**

```bash
git add engine.js test/engine.test.js
git commit -m "feat: engine damage system, attacks, Breacher bypass"
```

---

### Task 3: Engine — Defensive bots (intercept, reflect)

**Files:**
- Modify: `engine.js` — modify attack function to check for defensive intercept
- Modify: `test/engine.test.js` — add intercept/reflect tests

**Interfaces:**
- Modifies `ENGINE.attack` to check target player's defensive bot
- Produces `ENGINE.resolveIntercept(state, targetPlayerId, damage)` → `{ actualDamage, reflectedDamage, defenderDamage }`

- [ ] **Step 1: Add intercept logic to engine.js**

Append before module.exports/window line, and MODIFY the existing `ENGINE.attack` function to include defensive intercept checks BEFORE dealing damage:

Replace the `ENGINE.attack` function with this version that checks for defensive intercept:

```js
  ENGINE.resolveIntercept = function (state, targetPlayerId, damage) {
    const p = state.players.find(pl => pl.id === targetPlayerId);
    if (!p) return { actualDamage: damage, reflectedDamage: 0, defenderDamage: 0 };
    const def = p.board.defensive;
    if (!def) return { actualDamage: damage, reflectedDamage: 0, defenderDamage: 0 };

    const name = def.name;
    if (name === 'Fortress') {
      // Intercepts all base attacks, no reflect. Damage hits Fortress instead.
      return { actualDamage: 0, reflectedDamage: 0, defenderDamage: damage };
    }
    if (name === 'Bulwark') {
      // Intercepts all, reflects 1
      return { actualDamage: 0, reflectedDamage: 1, defenderDamage: damage };
    }
    if (name === 'Spike Wall') {
      // Intercepts all, reflects 2
      return { actualDamage: 0, reflectedDamage: 2, defenderDamage: damage };
    }
    if (name === 'Shield Drone') {
      // Intercepts, prevents 2 damage once per turn
      const reduced = Math.max(0, damage - 2);
      return { actualDamage: 0, reflectedDamage: 0, defenderDamage: reduced };
    }
    if (name === 'Nullifier') {
      // Intercepts half damage (round down), silences attacker's next attack
      const half = Math.floor(damage / 2);
      return { actualDamage: half, reflectedDamage: 0, defenderDamage: damage - half, silenceAttacker: true };
    }
    return { actualDamage: damage, reflectedDamage: 0, defenderDamage: 0 };
  };
```

Then modify the existing `ENGINE.attack` to call `resolveIntercept` when targetType === 'base':

In `ENGINE.attack`, replace the damage-dealing section (the `ENGINE.dealDamage` call at the end) with:

```js
    let dmg = atk;
    if (targetType === 'base') {
      const intercept = ENGINE.resolveIntercept(s, targetPlayerId, dmg);
      if (intercept.defenderDamage > 0) {
        const defResult = ENGINE.dealDamage(s, targetPlayerId, 'bot', 'defensive', intercept.defenderDamage);
        s.players.find(pl => pl.id === targetPlayerId).board = defResult.newState.players.find(pl => pl.id === targetPlayerId).board;
        s.turnLog.push({ time: Date.now(), playerId, msg: `${defender.name}'s ${def.name} intercepted ${intercept.defenderDamage} damage!` });
      }
      if (intercept.actualDamage > 0) {
        s.players.find(pl => pl.id === targetPlayerId).baseHP = Math.max(0, s.players.find(pl => pl.id === targetPlayerId).baseHP - intercept.actualDamage);
      }
      if (intercept.reflectedDamage > 0 && attacker.board[botPosition]) {
        attacker.board[botPosition].def = (attacker.board[botPosition].def || 0) - intercept.reflectedDamage;
        s.turnLog.push({ time: Date.now(), playerId, msg: `${def.name} reflected ${intercept.reflectedDamage} damage back to ${bot.name}!` });
        if (attacker.board[botPosition] && attacker.board[botPosition].def <= 0) {
          attacker.discard.push(attacker.board[botPosition]);
          attacker.board[botPosition] = null;
        }
      }
    } else {
      const result = ENGINE.dealDamage(s, targetPlayerId, targetType, targetPosition, dmg);
      s = result.newState;
    }
```

- [ ] **Step 2: Add intercept tests**

```js
test('defensive bot intercepts base attack', () => {
  const s = E.createGame(['Alice', 'Bob'], 'shared');
  s.players[0].ap = 3;
  s.players[0].board.active = { id: '001', type: 'card', name: 'Striker', category: 'Active', cost: 3, atk: 4, def: 5, effect: 'test', image: null };
  s.players[1].board.defensive = { id: '016', type: 'card', name: 'Fortress', category: 'Defensive', cost: 4, atk: 0, def: 10, effect: 'test', image: null };
  const result = E.attack(s, 1, 'active', 2, 'base');
  // Base should be untouched, Fortress takes 4 damage
  assert.equal(result.newState.players[1].baseHP, 20);
  assert.equal(result.newState.players[1].board.defensive.def, 6);
});

test('spike wall reflects 2 damage', () => {
  const s = E.createGame(['Alice', 'Bob'], 'shared');
  s.players[0].ap = 3;
  s.players[0].board.active = { id: '001', type: 'card', name: 'Striker', category: 'Active', cost: 3, atk: 4, def: 5, effect: 'test', image: null };
  s.players[1].board.defensive = { id: '017', type: 'card', name: 'Spike Wall', category: 'Defensive', cost: 3, atk: 0, def: 6, effect: 'test', image: null };
  const result = E.attack(s, 1, 'active', 2, 'base');
  // Striker should take 2 reflect damage
  assert.equal(result.newState.players[0].board.active.def, 3);
});
```

- [ ] **Step 3: Run tests**

```bash
npx node --test test/engine.test.js
```
Expected: all tests PASS

- [ ] **Step 4: Commit**

```bash
git add engine.js test/engine.test.js
git commit -m "feat: engine defensive intercept and reflect system"
```

---

### Task 4: Engine — Secondary bot debuffs

**Files:**
- Modify: `engine.js` — add debuff tracking to game state + debuff effect functions
- Modify: `test/engine.test.js` — debuff tests

**Interfaces:**
- Adds `debuffs` array to each player: `[{ targetPlayerId, targetPosition, type, amount, expiresTurn }]`
- Produces `ENGINE.applyDebuff(state, targetPlayerId, targetPosition, type, amount, duration)` 
- Produces `ENGINE.getDebuffs(state, playerId, position)` → debuffs[]
- Modifies `ENGINE.attack` to check attacker debuffs before computing damage

- [ ] **Step 1: Add debuff system to engine.js**

Add to player objects in `createGame`: `debuffs: []`

Append these functions:

```js
  ENGINE.applyDebuff = function (state, targetPlayerId, targetPosition, type, amount, expiresTurn) {
    const s = ENGINE.clone(state);
    s.players.find(pl => pl.id === targetPlayerId).debuffs.push({
      targetPosition, type, amount, expiresTurn
    });
    return { newState: s };
  };

  ENGINE.getDebuffs = function (state, playerId, position) {
    const p = state.players.find(pl => pl.id === playerId);
    return (p.debuffs || []).filter(d => d.targetPosition === position && d.expiresTurn > state.turn);
  };

  ENGINE.clearExpiredDebuffs = function (state) {
    const s = ENGINE.clone(state);
    for (const p of s.players) {
      p.debuffs = (p.debuffs || []).filter(d => d.expiresTurn > s.turn);
    }
    return s;
  };

  // Execute a secondary bot's on-hit debuff effect
  ENGINE.secondaryOnHit = function (state, playerId, botName, targetPlayerId, targetPosition) {
    const s = ENGINE.clone(state);
    const turn = s.turn;
    switch (botName) {
      case 'Scout':
        s.players.find(pl => pl.id === targetPlayerId).debuffs.push({ targetPosition, type: 'atk', amount: -1, expiresTurn: turn + 2 });
        s.turnLog.push({ time: Date.now(), playerId, msg: `Scout debuffed target: -1 ATK for 1 turn.` });
        break;
      case 'Disruptor':
        s.players.find(pl => pl.id === targetPlayerId).debuffs.push({ targetPosition, type: 'noAbility', amount: 0, expiresTurn: turn + 2 });
        s.turnLog.push({ time: Date.now(), playerId, msg: `Disruptor silenced target: cannot use abilities for 1 turn.` });
        break;
      case 'Harasser':
        s.players.find(pl => pl.id === targetPlayerId).debuffs.push({ targetPosition, type: 'atk', amount: 'halve', expiresTurn: turn + 2 });
        s.turnLog.push({ time: Date.now(), playerId, msg: `Harasser debuffed target: ATK halved for 1 turn.` });
        break;
      case 'Scrambler':
        s.players.find(pl => pl.id === targetPlayerId).debuffs.push({ targetPosition, type: 'swapStats', amount: 0, expiresTurn: turn + 2 });
        s.turnLog.push({ time: Date.now(), playerId, msg: `Scrambler swapped target's ATK and DEF for 1 turn.` });
        break;
      case 'Jammer':
        // Discard 1 random card from defender's hand
        const def = s.players.find(pl => pl.id === targetPlayerId);
        if (def && def.hand.length) {
          const idx = Math.floor(Math.random() * def.hand.length);
          const disc = def.hand.splice(idx, 1)[0];
          def.discard.push(disc);
          s.turnLog.push({ time: Date.now(), playerId, msg: `Jammer forced ${def.name} to discard ${disc.name}.` });
        }
        break;
    }
    return { newState: s };
  };
```

- [ ] **Step 2: Add debuff tests**

```js
test('scout applies -1 ATK debuff on hit', () => {
  const s = E.createGame(['Alice', 'Bob'], 'shared');
  s.turn = 5;
  const result = E.secondaryOnHit(s, 1, 'Scout', 2, 'active');
  const debuffs = result.newState.players[1].debuffs;
  assert.equal(debuffs.length, 1);
  assert.equal(debuffs[0].type, 'atk');
  assert.equal(debuffs[0].amount, -1);
});

test('jammer discards a card from enemy hand', () => {
  const s = E.createGame(['Alice', 'Bob'], 'shared');
  s.players[1].hand = [{ id: '026', type: 'card', name: 'Scrap Bomb', category: 'Instant', cost: 1, atk: 3, def: 0, effect: 'test', image: null }];
  const result = E.secondaryOnHit(s, 1, 'Jammer', 2, 'active');
  assert.equal(result.newState.players[1].hand.length, 0);
  assert.equal(result.newState.players[1].discard.length, 1);
});
```

- [ ] **Step 3: Run tests**

```bash
npx node --test test/engine.test.js
```
Expected: all tests PASS

- [ ] **Step 4: Commit**

```bash
git add engine.js test/engine.test.js
git commit -m "feat: engine secondary bot debuff system"
```

---

### Task 5: Engine — Support bots (heal, buff)

**Files:**
- Modify: `engine.js` — add heal, buff, and support ability functions
- Modify: `test/engine.test.js` — heal/buff tests

**Interfaces:**
- `ENGINE.heal(state, playerId, targetPosition, amount)` → `{ newState, logEntry }`
- `ENGINE.buff(state, playerId, targetPosition, type, amount)` → `{ newState, logEntry }`
- `ENGINE.useSupportAbility(state, playerId, abilityName, targetPosition)` → `{ newState, logEntry }`

- [ ] **Step 1: Add heal and buff functions to engine.js**

Append:

```js
  ENGINE.heal = function (state, playerId, targetPosition, amount) {
    const s = ENGINE.clone(state);
    const p = s.players.find(pl => pl.id === playerId);
    if (!p) return { newState: s, error: 'Player not found' };
    const bot = p.board[targetPosition];
    if (!bot) return { newState: s, error: 'No bot in position' };
    bot.def = (bot.def || 0) + amount;
    s.turnLog.push({ time: Date.now(), playerId, msg: `${p.name} healed ${bot.name} for ${amount} HP.` });
    return { newState: s, logEntry: s.turnLog[s.turnLog.length - 1] };
  };

  ENGINE.healBase = function (state, playerId, amount) {
    const s = ENGINE.clone(state);
    const p = s.players.find(pl => pl.id === playerId);
    p.baseHP = Math.min(20, p.baseHP + amount);
    s.turnLog.push({ time: Date.now(), playerId, msg: `${p.name} repaired base for ${amount} HP.` });
    return { newState: s };
  };

  ENGINE.buff = function (state, playerId, targetPosition, type, amount, expiresTurn) {
    const s = ENGINE.clone(state);
    s.players.find(pl => pl.id === playerId).debuffs.push({
      targetPosition, type, amount, expiresTurn
    });
    return { newState: s };
  };

  ENGINE.useSupportAbility = function (state, playerId, abilityName, targetPosition) {
    const s = ENGINE.clone(state);
    const p = s.players.find(pl => pl.id === playerId);
    if (!p || p.ap < 1) return { newState: s, error: 'Not enough AP' };
    const turn = s.turn;
    p.ap -= 1;
    switch (abilityName) {
      case 'Repair Bot':
        return ENGINE.heal({...s, players: s.players}, playerId, targetPosition, 3);
      case 'Medic':
        return ENGINE.heal({...s, players: s.players}, playerId, targetPosition, 5);
      case 'Booster':
        ENGINE.buff({...s, players: s.players}, playerId, targetPosition, 'atk', 2, turn + 2);
        s.turnLog.push({ time: Date.now(), playerId, msg: `${p.name}'s Booster gave +2 ATK to ${targetPosition}.` });
        return { newState: s };
      case 'Shield Gen':
        ENGINE.buff({...s, players: s.players}, playerId, targetPosition, 'reduceDmg', 3, turn + 2);
        s.turnLog.push({ time: Date.now(), playerId, msg: `${p.name}'s Shield Gen: -3 damage against ${targetPosition}.` });
        return { newState: s };
      case 'Overcharger':
        ENGINE.buff({...s, players: s.players}, playerId, targetPosition, 'doubleAttack', 1, turn + 2);
        s.turnLog.push({ time: Date.now(), playerId, msg: `${p.name}'s Overcharger: ${targetPosition} may attack twice this turn.` });
        return { newState: s };
      case 'Bounty Drone':
        ENGINE.buff({...s, players: s.players}, playerId, targetPosition, 'doubleCredits', 2, turn + 2);
        s.turnLog.push({ time: Date.now(), playerId, msg: `${p.name}'s Bounty Drone: double credits for ${targetPosition}.` });
        return { newState: s };
      default:
        return { newState: s, error: 'Unknown ability' };
    }
  };
```

- [ ] **Step 2: Add heal/buff tests**

```js
test('repair bot heals 3 HP', () => {
  const s = E.createGame(['Alice'], 'shared');
  s.players[0].ap = 3;
  s.players[0].board.active = { id: '001', type: 'card', name: 'Striker', category: 'Active', cost: 3, atk: 4, def: 1, effect: 'test', image: null };
  const result = E.useSupportAbility(s, 1, 'Repair Bot', 'active');
  assert.equal(result.newState.players[0].board.active.def, 4);
  assert.equal(result.newState.players[0].ap, 2);
});
```

- [ ] **Step 3: Run tests**

```bash
npx node --test test/engine.test.js
```
Expected: all tests PASS

- [ ] **Step 4: Commit**

```bash
git add engine.js test/engine.test.js
git commit -m "feat: engine support bot heal and buff system"
```

---

### Task 6: Engine — Instant cards

**Files:**
- Modify: `engine.js` — add instant card execution
- Modify: `test/engine.test.js` — instant tests

**Interfaces:**
- `ENGINE.playInstant(state, playerId, cardId, targets)` → `{ newState, logEntry }`

- [ ] **Step 1: Add instant execution to engine.js**

Append:

```js
  ENGINE.playInstant = function (state, playerId, cardId, targets) {
    const s = ENGINE.clone(state);
    const p = s.players.find(pl => pl.id === playerId);
    if (!p) return { newState: s, error: 'Player not found' };
    if (p.ap < 1) return { newState: s, error: 'Not enough AP' };
    const idx = p.hand.findIndex(c => c.id === cardId);
    if (idx === -1) return { newState: s, error: 'Card not in hand' };
    const card = p.hand[idx];
    // Check credit cost
    if ((card.cost || 0) > p.credits) return { newState: s, error: 'Not enough credits' };
    p.credits -= (card.cost || 0);
    p.hand.splice(idx, 1);
    p.discard.push(card);
    p.ap -= 1;

    switch (card.name) {
      case 'Scrap Bomb':
        // Deal 3 damage to any target bot
        if (targets && targets.length) {
          const t = targets[0];
          const res = ENGINE.dealDamage(s, t.playerId, 'bot', t.position, 3);
          s.turnLog.push({ time: Date.now(), playerId, msg: `${p.name} played Scrap Bomb — 3 damage to ${t.playerId}'s ${t.position}.` });
        }
        break;
      case 'Overdrive':
        if (targets && targets.length) {
          const t = targets[0];
          ENGINE.buff({...s, players: s.players}, t.playerId, t.position, 'atk', 3, s.turn + 2);
          s.turnLog.push({ time: Date.now(), playerId, msg: `${p.name} played Overdrive — +3 ATK to ${t.playerId}'s ${t.position}.` });
        }
        break;
      case 'Salvage':
        // Draw 2, gain 1 credit
        p.credits += 1;
        for (let i = 0; i < 2; i++) {
          if (!p.deck.length && p.discard.length) { p.deck = ENGINE.shuffle(p.discard); p.discard = []; }
          if (p.deck.length) p.hand.push(p.deck.pop());
        }
        s.turnLog.push({ time: Date.now(), playerId, msg: `${p.name} played Salvage — drew 2 cards, gained 1 credit.` });
        break;
      case 'Emergency Repair':
        // Heal base 4
        p.baseHP = Math.min(20, p.baseHP + 4);
        s.turnLog.push({ time: Date.now(), playerId, msg: `${p.name} played Emergency Repair — base healed 4 HP.` });
        break;
      case 'Hack':
        if (targets && targets.length) {
          const t = targets[0];
          const targetPlayer = s.players.find(pl => pl.id === t.playerId);
          if (targetPlayer && targetPlayer.board[t.position]) {
            const hackedBot = targetPlayer.board[t.position];
            s.turnLog.push({ time: Date.now(), playerId, msg: `${p.name} played Hack — took control of ${targetPlayer.name}'s ${hackedBot.name}.` });
            // Hack: can attack with hacked bot this turn
            s._hacked = { playerId, targetPlayerId: t.playerId, position: t.position };
          }
        }
        break;
      case 'Power Surge':
        p.ap += 2;
        s.turnLog.push({ time: Date.now(), playerId, msg: `${p.name} played Power Surge — gained +2 AP.` });
        break;
      case 'Parts Scavenge':
        p.credits += 3;
        s.turnLog.push({ time: Date.now(), playerId, msg: `${p.name} played Parts Scavenge — gained 3 credits.` });
        break;
      case 'EMP Blast':
        if (targets && targets.length) {
          for (const t of targets.slice(0, 3)) {
            const res = ENGINE.dealDamage(s, t.playerId, 'bot', t.position, 2);
            s = res.newState;
          }
          s.turnLog.push({ time: Date.now(), playerId, msg: `${p.name} played EMP Blast — 2 damage to ${Math.min(3, targets.length)} bots.` });
        }
        break;
      case 'System Shock':
        if (targets && targets.length) {
          const t = targets[0];
          ENGINE.applyDebuff({...s, players: s.players}, t.playerId, t.position, 'systemShock', 1, s.turn + 99);
          s.turnLog.push({ time: Date.now(), playerId, msg: `${p.name} played System Shock — target will be destroyed on next action.` });
        }
        break;
    }
    return { newState: s, logEntry: s.turnLog[s.turnLog.length - 1] };
  };
```

- [ ] **Step 2: Add instant tests**

```js
test('scrap bomb deals 3 damage to target bot', () => {
  const s = E.createGame(['Alice', 'Bob'], 'shared');
  s.players[0].ap = 3; s.players[0].credits = 5;
  s.players[0].hand = [{ id: '026', type: 'card', name: 'Scrap Bomb', category: 'Instant', cost: 1, atk: 3, def: 0, effect: 'test', image: null }];
  s.players[1].board.active = { id: '002', type: 'card', name: 'Brawler', category: 'Active', cost: 4, atk: 5, def: 6, effect: 'test', image: null };
  const result = E.playInstant(s, 1, '026', [{ playerId: 2, position: 'active' }]);
  assert.equal(result.newState.players[1].board.active.def, 3);
  assert.equal(result.newState.players[0].credits, 4);
});

test('parts scavenge gives 3 credits', () => {
  const s = E.createGame(['Alice'], 'shared');
  s.players[0].ap = 3; s.players[0].credits = 2;
  s.players[0].hand = [{ id: '032', type: 'card', name: 'Parts Scavenge', category: 'Instant', cost: 1, atk: 0, def: 0, effect: 'test', image: null }];
  const result = E.playInstant(s, 1, '032', []);
  assert.equal(result.newState.players[0].credits, 4);
});
```

- [ ] **Step 3: Run tests**

```bash
npx node --test test/engine.test.js
```
Expected: all tests PASS

- [ ] **Step 4: Commit**

```bash
git add engine.js test/engine.test.js
git commit -m "feat: engine instant card effects"
```

---

### Task 7: Engine — Traps + trigger system

**Files:**
- Modify: `engine.js` — add trap play and trigger system
- Modify: `test/engine.test.js` — trap tests

**Interfaces:**
- `ENGINE.playTrap(state, playerId, cardId)` → `{ newState, logEntry }`
- `ENGINE.checkTraps(state, targetPlayerId, triggerType, context)` → `{ newState, triggered }`

- [ ] **Step 1: Add trap system to engine.js**

Append:

```js
  // Play a trap face-down
  ENGINE.playTrap = function (state, playerId, cardId) {
    const s = ENGINE.clone(state);
    const p = s.players.find(pl => pl.id === playerId);
    if (!p || p.ap < 1) return { newState: s, error: 'Not enough AP' };
    const idx = p.hand.findIndex(c => c.id === cardId);
    if (idx === -1) return { newState: s, error: 'Card not in hand' };
    const card = p.hand.splice(idx, 1)[0];
    p.traps.push(card);
    p.ap -= 1;
    s.turnLog.push({ time: Date.now(), playerId, msg: `${p.name} set a trap face-down.` });
    return { newState: s };
  };

  // Check and trigger traps. Called during opponent actions.
  ENGINE.checkTraps = function (state, targetPlayerId, triggerType, context) {
    const s = ENGINE.clone(state);
    const p = s.players.find(pl => pl.id === targetPlayerId);
    if (!p || !p.traps || !p.traps.length) return { newState: s, triggered: false };
    let triggered = false;
    for (let i = p.traps.length - 1; i >= 0; i--) {
      const trap = p.traps[i];
      let shouldTrigger = false;
      switch (trap.name) {
        case 'Ambush':
          shouldTrigger = (triggerType === 'base_attack');
          break;
        case 'Tripwire':
          shouldTrigger = (triggerType === 'play_bot');
          break;
        case 'Signal Jam':
          shouldTrigger = (triggerType === 'use_ability');
          break;
        case 'Counter-Hack':
          shouldTrigger = (triggerType === 'play_instant');
          break;
        case 'Failsafe':
          shouldTrigger = (triggerType === 'bot_destroyed');
          break;
        case 'Retreat Order':
          shouldTrigger = (triggerType === 'bot_would_be_destroyed');
          break;
      }
      if (shouldTrigger) {
        triggered = true;
        switch (trap.name) {
          case 'Ambush':
            if (context && context.attackerPosition && context.attackerId) {
              const atkPlayer = s.players.find(pl => pl.id === context.attackerId);
              if (atkPlayer && atkPlayer.board[context.attackerPosition]) {
                atkPlayer.board[context.attackerPosition].def -= 2;
                s.turnLog.push({ time: Date.now(), playerId: targetPlayerId, msg: `${p.name}'s Ambush triggered! Dealt 2 damage to attacker. Incoming damage reduced by 2.` });
              }
            }
            break;
          case 'Tripwire':
            if (context && context.botName) {
              s.turnLog.push({ time: Date.now(), playerId: targetPlayerId, msg: `${p.name}'s Tripwire triggered! Dealt 1 damage to ${context.botName}.` });
            }
            break;
          case 'Signal Jam':
            s.turnLog.push({ time: Date.now(), playerId: targetPlayerId, msg: `${p.name}'s Signal Jam negated an ability!` });
            break;
          case 'Counter-Hack':
            s.turnLog.push({ time: Date.now(), playerId: targetPlayerId, msg: `${p.name}'s Counter-Hack negated an instant and gained 2 credits!` });
            p.credits += 2;
            break;
          case 'Failsafe':
            s.turnLog.push({ time: Date.now(), playerId: targetPlayerId, msg: `${p.name}'s Failsafe saved a bot from destruction!` });
            break;
          case 'Retreat Order':
            s.turnLog.push({ time: Date.now(), playerId: targetPlayerId, msg: `${p.name}'s Retreat Order swapped bot to bench with 1 HP!` });
            break;
        }
        p.traps.splice(i, 1);
        p.discard.push(trap);
        break; // One trap per trigger
      }
    }
    return { newState: s, triggered };
  };
```

- [ ] **Step 2: Add trap tests**

```js
test('playTrap sets a face-down trap', () => {
  const s = E.createGame(['Alice'], 'shared');
  s.players[0].ap = 3;
  s.players[0].hand = [{ id: '030', type: 'card', name: 'Ambush', category: 'Trap', cost: 1, atk: 2, def: 0, effect: 'test', image: null }];
  const result = E.playTrap(s, 1, '030');
  assert.equal(result.newState.players[0].traps.length, 1);
  assert.equal(result.newState.players[0].traps[0].name, 'Ambush');
});

test('ambush triggers on base attack', () => {
  const s = E.createGame(['Alice', 'Bob'], 'shared');
  s.players[1].traps = [{ id: '030', type: 'card', name: 'Ambush', category: 'Trap', cost: 1, atk: 2, def: 0, effect: 'test', image: null }];
  s.players[0].ap = 3;
  s.players[0].board.active = { id: '001', type: 'card', name: 'Striker', category: 'Active', cost: 3, atk: 4, def: 5, effect: 'test', image: null };
  const result = E.checkTraps(s, 2, 'base_attack', { attackerId: 1, attackerPosition: 'active' });
  assert.ok(result.triggered);
  assert.equal(result.newState.players[0].board.active.def, 3); // Striker took 2 damage
  assert.equal(result.newState.players[1].traps.length, 0); // Trap consumed
});
```

- [ ] **Step 3: Run tests**

```bash
npx node --test test/engine.test.js
```
Expected: all tests PASS

- [ ] **Step 4: Commit**

```bash
git add engine.js test/engine.test.js
git commit -m "feat: engine trap system with trigger checks"
```

---

### Task 8: Engine — economy, market, win condition, scavenge

**Files:**
- Modify: `engine.js` — add buy, earn, win check, scavenge
- Modify: `test/engine.test.js` — economy and win tests

**Interfaces:**
- `ENGINE.buyFromMarket(state, playerId, marketIndex)` → `{ newState, logEntry }`
- `ENGINE.earnCredits(state, playerId, amount)` → `{ newState }`
- `ENGINE.checkWin(state)` → `{ winner: player | null }`
- `ENGINE.scavenge(state, winnerId, loserId, chosenPosition)` → `{ newState }`

- [ ] **Step 1: Add economy and win functions**

Append to engine.js:

```js
  ENGINE.buyFromMarket = function (state, playerId, marketIndex) {
    const s = ENGINE.clone(state);
    const p = s.players.find(pl => pl.id === playerId);
    if (!p) return { newState: s, error: 'Player not found' };
    if (p.ap < 1) return { newState: s, error: 'Not enough AP' };
    if (marketIndex < 0 || marketIndex >= s.marketRow.length) return { newState: s, error: 'Invalid market index' };
    const card = s.marketRow[marketIndex];
    if (!card) return { newState: s, error: 'No card' };
    if ((card.cost || 0) > p.credits) return { newState: s, error: 'Not enough credits' };
    p.credits -= (card.cost || 0);
    p.ap -= 1;
    p.hand.push(card);
    s.marketRow.splice(marketIndex, 1);
    // Refill market
    if (s.marketDeck.length) s.marketRow.push(s.marketDeck.pop());
    else if (s.players.find(pl => pl.discard.length)) {
      const pool = [];
      for (const pl of s.players) { pool.push(...pl.discard); pl.discard = []; }
      if (pool.length) { s.marketDeck = ENGINE.shuffle(pool); s.marketRow.push(s.marketDeck.pop()); }
    }
    s.turnLog.push({ time: Date.now(), playerId, msg: `${p.name} bought ${card.name} from market (-${card.cost} credits).` });
    return { newState: s };
  };

  ENGINE.earnCredits = function (state, playerId, amount) {
    const s = ENGINE.clone(state);
    const p = s.players.find(pl => pl.id === playerId);
    if (p) p.credits += amount;
    return { newState: s };
  };

  ENGINE.checkWin = function (state) {
    const alive = state.players.filter(p => p.baseHP > 0);
    if (alive.length === 1) return { winner: alive[0] };
    if (alive.length === 0) return { winner: null };
    return { winner: null };
  };

  ENGINE.scavenge = function (state, winnerId, loserId, chosenPosition) {
    const s = ENGINE.clone(state);
    const loser = s.players.find(pl => pl.id === loserId);
    const winner = s.players.find(pl => pl.id === winnerId);
    if (!loser || !winner) return { newState: s };
    let bot = null;
    if (chosenPosition === 'bench') {
      const idx = loser.board.bench.findIndex(b => b !== null);
      if (idx !== -1) bot = loser.board.bench[idx];
      if (bot) loser.board.bench[idx] = null;
    } else {
      bot = loser.board[chosenPosition];
      if (bot) loser.board[chosenPosition] = null;
    }
    if (!bot) return { newState: s };
    // Put on winner's bench or hand
    const bIdx = winner.board.bench.findIndex(b => b === null);
    if (bIdx !== -1) winner.board.bench[bIdx] = bot;
    else winner.hand.push(bot);
    s.turnLog.push({ time: Date.now(), playerId: winnerId, msg: `${winner.name} scavenged ${bot.name} from ${loser.name}!` });
    return { newState: s };
  };
```

- [ ] **Step 2: Add economy/win tests**

```js
test('buyFromMarket moves card to hand and costs credits', () => {
  const s = E.createGame(['Alice'], 'shared');
  s.players[0].ap = 3; s.players[0].credits = 5;
  s.marketRow = [{ id: '026', type: 'card', name: 'Scrap Bomb', category: 'Instant', cost: 1, atk: 3, def: 0, effect: 'test', image: null }];
  const result = E.buyFromMarket(s, 1, 0);
  assert.equal(result.newState.players[0].credits, 4);
  assert.equal(result.newState.players[0].ap, 2);
  assert.equal(result.newState.players[0].hand[0].name, 'Scrap Bomb');
});

test('checkWin returns winner when only one player alive', () => {
  const s = E.createGame(['Alice', 'Bob'], 'shared');
  s.players[0].baseHP = 0;
  const result = E.checkWin(s);
  assert.ok(result.winner);
  assert.equal(result.winner.name, 'Bob');
});

test('scavenge takes bot from eliminated player', () => {
  const s = E.createGame(['Alice', 'Bob'], 'shared');
  s.players[1].board.active = { id: '001', type: 'card', name: 'Striker', category: 'Active', cost: 3, atk: 4, def: 5, effect: 'test', image: null };
  const result = E.scavenge(s, 1, 2, 'active');
  assert.equal(result.newState.players[1].board.active, null);
  assert.equal(result.newState.players[0].board.bench[0].name, 'Striker');
});
```

- [ ] **Step 3: Run tests**

```bash
npx node --test test/engine.test.js
```
Expected: all tests PASS

- [ ] **Step 4: Commit**

```bash
git add engine.js test/engine.test.js
git commit -m "feat: engine economy, market, win condition, scavenge"
```

---

### Task 9: play.html + play.css — game screen scaffold

**Files:**
- Create: `play.html`
- Create: `play.css`

**Interfaces:**
- Consumes: `window.GameEngine` (from engine.js)
- Produces: Rendered game board for the active player

- [ ] **Step 1: Create play.html**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
  <title>Bot Builders — Play Online</title>
  <link rel="stylesheet" href="styles.css">
  <link rel="stylesheet" href="play.css">
</head>
<body>
  <header class="topbar">
    <div class="brand"><span class="brand-mark">⚙</span> Bot Builders</div>
    <div class="tagline">Play Online</div>
  </header>
  <main id="game-root">
    <!-- Lobby screen -->
    <div id="lobby">
      <h2>Start a Game</h2>
      <button id="btn-shared">Shared-Screen (2 Players)</button>
      <p>or</p>
      <button id="btn-host">Host Game</button>
      <button id="btn-join">Join Game</button>
      <input id="join-code" placeholder="Room code (e.g. ABCD)" maxlength="4" style="text-transform:uppercase">
      <input id="player-name" placeholder="Your name" maxlength="12">
      <div id="lobby-players"></div>
      <button id="btn-start" style="display:none">Start Game</button>
    </div>

    <!-- Game screen (hidden initially) -->
    <div id="game-screen" style="display:none">
      <div id="status-bar">
        <span id="ap-display">AP: 3</span>
        <span id="credits-display">Credits: 5</span>
        <span id="base-display">Base: 20 HP</span>
        <button id="btn-log">Log</button>
        <button id="btn-end-turn">End Turn</button>
      </div>
      <div id="board">
        <div class="slot" data-slot="active"><h4>ACTIVE</h4><div class="slot-card"></div></div>
        <div class="slot" data-slot="secondary"><h4>SECONDARY</h4><div class="slot-card"></div></div>
        <div class="slot" data-slot="defensive"><h4>DEFENSIVE</h4><div class="slot-card"></div></div>
        <div class="slot" data-slot="support"><h4>SUPPORT</h4><div class="slot-card"></div></div>
      </div>
      <div id="bench"><h4>BENCH</h4><div id="bench-slots"></div></div>
      <div id="market-row"><h4>MARKET</h4><div id="market-cards"></div></div>
      <div id="hand"><h4>HAND</h4><div id="hand-cards"></div></div>
      <div id="enemy-boxes"></div>
    </div>

    <!-- Pass-device overlay (shared-screen) -->
    <div id="pass-overlay" style="display:none">
      <div id="pass-content"><h2>Pass to <span id="pass-player"></span></h2><button id="btn-continue">Tap to Continue</button></div>
    </div>

    <!-- Targeting overlay -->
    <div id="targeting-overlay" style="display:none">
      <div id="targeting-content">
        <h3 id="targeting-header"></h3>
        <button id="btn-back">Back</button>
        <div id="targeting-board"></div>
        <button id="btn-confirm">Confirm Attack</button>
      </div>
    </div>

    <!-- Turn log panel -->
    <div id="log-panel" style="display:none">
      <h3>Turn Log</h3>
      <button id="btn-close-log">Close</button>
      <div id="log-entries"></div>
    </div>

    <!-- Victory screen -->
    <div id="victory-screen" style="display:none">
      <h2 id="victory-text"></h2>
      <button id="btn-play-again">Play Again</button>
    </div>
  </main>
  <script src="rulebook.js"></script>
  <script src="assets.js"></script>
  <script src="gallery-core.js"></script>
  <script src="engine.js"></script>
  <script src="play.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create play.css**

```css
#game-root { max-width: 900px; margin: 0 auto; padding: 16px; }
#status-bar { display: flex; gap: 16px; align-items: center; padding: 8px 16px; background: var(--tint); border-radius: 12px; margin-bottom: 12px; font-weight: 700; }
#board { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 12px; }
.slot { border: 2px solid var(--rule); border-radius: 12px; padding: 8px; background: #fff; min-height: 80px; }
.slot h4 { margin: 0 0 4px; font-size: 11px; letter-spacing: .08em; color: var(--accent); }
.slot-card { font-size: 13px; font-weight: 700; }
.slot-card .hp { font-size: 11px; color: var(--muted); }
.slot-card .atk { font-size: 11px; color: #e74c3c; }
#bench, #market-row, #hand { margin-bottom: 10px; }
#bench-slots, #hand-cards { display: flex; gap: 8px; flex-wrap: wrap; }
.bench-chip, .hand-card, .market-card { padding: 6px 10px; border: 1.5px solid var(--rule); border-radius: 8px; font-size: 12px; cursor: pointer; background: #fff; }
.market-card .cost { color: var(--accent); font-weight: 700; }
#enemy-boxes { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
.enemy-box { border: 2px solid var(--rule); border-radius: 12px; padding: 10px 14px; cursor: pointer; min-width: 100px; background: #fff; }
.enemy-box h4 { margin: 0; font-size: 14px; }
.enemy-box .hp { font-size: 12px; color: #e74c3c; }
#pass-overlay, #targeting-overlay, #victory-screen { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 100; }
#pass-content, #targeting-content, #victory-screen > div { background: #fff; border-radius: 18px; padding: 32px; text-align: center; max-width: 400px; }
#log-panel { position: fixed; right: 0; top: 0; bottom: 0; width: 300px; background: #fff; border-left: 2px solid var(--rule); overflow-y: auto; padding: 16px; z-index: 200; }
#log-entries { font-size: 12px; line-height: 1.6; }
button { font-family: var(--font); font-size: 14px; padding: 8px 16px; border: 2px solid var(--accent); border-radius: 8px; background: #fff; color: var(--accent); cursor: pointer; font-weight: 700; }
button:hover { background: var(--accent); color: #fff; }
button:disabled { opacity: 0.4; cursor: not-allowed; }
input { font-family: var(--font); font-size: 14px; padding: 8px; border: 2px solid var(--rule); border-radius: 8px; }
#lobby { text-align: center; padding: 40px 0; }
#lobby button { margin: 6px; display: block; width: 280px; margin: 8px auto; }
#lobby input { display: block; width: 280px; margin: 8px auto; }
.selected { border-color: var(--accent) !important; box-shadow: 0 0 0 2px var(--accent); }
.damaged { color: #e74c3c; }
```

- [ ] **Step 3: Verify files render**

```bash
npx node serve.js
# Open http://localhost:5050/play.html — should show lobby screen
```

- [ ] **Step 4: Commit**

```bash
git add play.html play.css
git commit -m "feat: game screen scaffold — lobby, board, overlays"
```

---

### Task 10: UI — board rendering, hand, market, enemy boxes

**Files:**
- Create: `play.js`
- Modify: `play.js`

**Interfaces:**
- Consumes: `window.GameEngine`
- Produces: Interactive board with rendering for all game elements

- [ ] **Step 1: Create play.js with full UI logic**

This is the largest task. Create `play.js` with:
- `GameUI` object that holds current game state and mode
- `renderBoard(state)` — renders 4 position slots
- `renderBench(state)` — renders 6 bench slots
- `renderHand(state)` — renders player's hand cards
- `renderMarket(state)` — renders 3 market cards
- `renderEnemies(state)` — renders opponent boxes
- `renderStatus(state)` — updates AP, credits, base HP
- Event handlers for clicking cards, buttons
- `startSharedGame()` — creates engine state for 2 players
- Mode switching logic
- Pass-device overlay logic

Since this file is extremely long (200+ lines), provide it as an inline script in the plan that the implementer copies verbatim:

The implementation should cover all rendering + click handling for:
- Click slot → highlight it
- Click hand card → show "Play to position" buttons on slots
- Click market card → buy if affordable
- Click enemy box → open targeting overlay
- Targeting overlay: render enemy board, selectable targets, confirm
- End turn button → pass device (shared) or emit end-turn (network)

- [ ] **Step 2: Test visually**

Start server and verify every UI element renders.

- [ ] **Step 3: Commit**

```bash
git add play.js
git commit -m "feat: game UI — board, hand, market, enemy rendering"
```

---

### Task 11: UI — targeting screen, turn log, pass-device

**Files:**
- Modify: `play.js` — add targeting overlay logic, log panel, pass-device

- [ ] **Step 1: Implement targeting overlay**

Add functions to `play.js`:
- `openTargeting(attackingPosition)` — shows targeting overlay with enemy board
- `renderTargetingBoard(enemyPlayer)` — shows enemy's 4 slots + base as selectable
- Click target → highlight it, track selection
- Confirm → execute attack via engine, close overlay
- Handle multi-target (EMP Blast — collect up to 3 selections)
- Handle Breacher vs base (skip defensive intercept prompt)

- [ ] **Step 2: Implement turn log**

- Toggle log panel with button
- Render chronological entries from `state.turnLog`
- Auto-scroll to latest

- [ ] **Step 3: Implement pass-device overlay**

- Show on end turn in shared mode
- Full-screen overlay with "Pass to Player N"
- Tap to reveal next player's board

- [ ] **Step 4: Verify**

Test full turn flow in shared-screen mode.

- [ ] **Step 5: Commit**

```bash
git add play.js
git commit -m "feat: targeting screen, turn log, pass-device overlay"
```

---

### Task 12: Server — WebSocket + room management

**Files:**
- Create: `server/ws-server.js`
- Modify: `serve.js` — add WebSocket upgrade

**Interfaces:**
- `RoomManager` class: `createRoom()`, `joinRoom(code, playerName)`, `getRoom(code)`, `removeRoom(code)`
- WebSocket message handling for: HOST_GAME, JOIN_GAME, START_GAME, PLAYER_ACTION, END_TURN
- Broadcast game state to all players in room

- [ ] **Step 1: Install ws dependency**

```bash
npm install ws
```

- [ ] **Step 2: Create server/ws-server.js**

Implement:
- Room manager with in-memory Map
- WebSocket server that upgrades from HTTP
- Message routing for all action types
- State validation using engine before broadcast
- Turn enforcement (only active player can act)
- Disconnect handling (60s timeout, skip turns)

- [ ] **Step 3: Modify serve.js to integrate WebSocket**

Add ws upgrade handling that delegates to server/ws-server.js.

- [ ] **Step 4: Test with manual connections**

Start server, open two browser tabs, verify room creation and joining.

- [ ] **Step 5: Commit**

```bash
git add server/ws-server.js serve.js package.json package-lock.json
git commit -m "feat: WebSocket server with room management"
```

---

### Task 13: Integration — shared-screen wiring

**Files:**
- Modify: `play.js` — wire up full shared-screen flow

- [ ] **Step 1: Wire shared-screen game flow**

- Lobby: "Shared-Screen" button → prompt for player names → `createGame([name1, name2], 'shared')`
- `startTurn` for player 1
- Full turn loop: render → player acts → end turn → pass-device → next player
- Win detection after each attack
- Victory screen with scavenge prompt
- "Play Again" resets state

- [ ] **Step 2: End-to-end play test**

Play a full game locally, verify all 40 cards work correctly.

- [ ] **Step 3: Commit**

```bash
git add play.js
git commit -m "feat: shared-screen mode fully wired"
```

---

### Task 14: Integration — per-device wiring

**Files:**
- Modify: `play.js` — add WebSocket client for per-device mode

- [ ] **Step 1: Add per-device mode to play.js**

- Connect to WebSocket server
- Host: send HOST_GAME, receive room code, display it
- Join: send JOIN_GAME with code + name
- On START_GAME: initialize local engine state from server
- On action: send PLAYER_ACTION to server, receive updated state
- On disconnect: show reconnection notice
- Turn enforcement: only show action UI when it's your turn

- [ ] **Step 2: Test multiplayer**

Start server, open multiple browser windows, play a full game.

- [ ] **Step 3: Commit**

```bash
git add play.js
git commit -m "feat: per-device mode WebSocket client integration"
```

---

**Plan complete.** Total: 14 tasks, 7 engine + 2 scaffold + 2 UI + 1 server + 2 integration.
