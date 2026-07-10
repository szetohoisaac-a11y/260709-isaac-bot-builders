# Bot Builders Online — Game Design Spec

A browser-based playable version of the Bot Builders card game. Two modes: shared-screen hot-seat (2 players) and per-device room-based (2–6 players over WiFi). All 40 cards implemented. Built on top of the existing printable gallery project.

## 1. Architecture

### 1.1 Modes

| Mode | Players | Device | Connection |
|------|---------|--------|------------|
| Shared-screen | 2 | One browser | None — game engine runs in-browser |
| Per-device | 2–6 | One per player | Same WiFi — host creates room |

### 1.2 Server

- Extend existing `serve.js` with WebSocket support
- Manages rooms, relays player actions, enforces turn order
- No persistence — games are live only, no accounts
- Host's browser generates the game state; server validates and broadcasts
- Room codes: 4 uppercase letters (e.g. "ABCD")

### 1.3 Game Engine

- Pure JavaScript state machine running in the browser (shared-screen) or on the server (per-device)
- Enforces: AP spending, damage, card effects, turn order, win condition
- Card effects are functions that mutate game state and return log entries
- All 40 cards, board layout, economy, and win condition implemented per the game design spec

## 2. Main Game Screen

Dashboard layout with your board at the center.

### 2.1 Status Bar (top)

```
⚡ 3 AP  |  💰 5 credits  |  🔴 BASE 20 HP  |  ⚙ Settings  |  ⛭ Turn Log
```

### 2.2 Your Board

Four position slots displayed as cards:

| ACTIVE | SECONDARY | DEFENSIVE | SUPPORT |

Each slot shows: bot name, ATK (if > 0), current HP / max HP, special ability indicator. Click any bot to see action buttons: Attack, Activate Ability, Swap to Bench.

### 2.3 Bench

Up to 6 slots displayed as small chips below the position row. If occupied, shows bot name and HP. Click a bench bot to swap (1 AP) with any position bot.

### 2.4 Market Row

3 face-up cards from the Bot Shop deck, always visible above the hand. Shows card name, type badge, credit cost. Click to buy: costs 1 AP + credit cost. Refills immediately from the deck.

### 2.5 Hand

Scrollable row of ability cards (Instants, Traps) and unplayed bot cards. Click to play or deploy (1 AP). Traps show a face-down icon until triggered.

### 2.6 Enemy Boxes

Below your board, compact boxes for each opponent:

```
┌─P1: Isaac ───┐ ┌─P2: Kelly ───┐
│ 🔴 18 HP     │ │ 🔴 20 HP     │
│ 4 bots       │ │ 3 bots       │
└──────────────┘ └──────────────┘
```

Click an enemy box to open the targeting screen.

## 3. Targeting Screen

Opens when a player clicks an attack action then selects an enemy.

### 3.1 Layout

- Header: shows attacking bot name and ATK, plus "← Back" button
- Enemy's board displayed with all 4 position slots, bench, and base
- Each bot and the base is selectable (tappable)
- Damaged bots show current HP / max HP; undamaged bots show just HP
- Confirm button (✓) at the bottom

### 3.2 Targeting Rules

- **Single-target attack** (e.g. Striker): pick one bot or base, tap confirm
- **Multi-target attack** (e.g. EMP Blast): pick up to N bots, tap confirm
- **Breacher vs base**: base shows as unguarded regardless of enemy Defensive bot. Damage bypasses interception and goes straight to base HP.
- **Breacher vs bot**: works like a normal single-target attack

### 3.3 Traps During Targeting

If the target player has face-down traps, they trigger during this flow:
- Card-flip animation plays
- Effect resolves
- Entry added to turn log
- Targeting continues (or is interrupted if the trap cancels the attack)

## 4. Turn Structure

### 4.1 Turn Start

- 3 AP refilled
- Draw 1 card from personal deck (free)
- Market row visible, hand visible

### 4.2 During Turn

Spend AP on actions. Each action resolves immediately with visual feedback:

| Action | AP Cost | UI |
|--------|---------|-----|
| Draw a card | 1 | Tap deck icon or hand area |
| Buy from market | 1 + credits | Click market card |
| Play a bot to a position | 1 | Drag card to slot or click card + slot |
| Play an ability card | 1 | Click card in hand → confirm |
| Attack with a bot | 1 | Click bot → Attack → enemy box → targeting screen |
| Activate bot ability | 1 | Click bot → Activate → choose target if needed |
| Swap bench ↔ position | 1 | Click bench bot → choose position |

### 4.3 End Turn

- Player taps "End Turn"
- AP does not carry over
- In shared-screen mode: "Pass to Player N" screen appears to hide the board
- In per-device mode: turn passes automatically, next player sees "Your Turn" notification

## 5. Shared-Screen Pass-Device Flow

Between turns, a full-screen overlay:

```
┌─────────────────────────────────────┐
│                                     │
│         Pass to Player 2            │
│                                     │
│         [ TAP TO CONTINUE ]         │
│                                     │
└─────────────────────────────────────┘
```

Tap to reveal the next player's board. Prevents hand information leaks.

## 6. Game State & Communication

### 6.1 Game State Object

```js
gameState = {
  phase: 'playing', // 'setup' | 'playing' | 'ended'
  turn: 0,
  activePlayer: 1,
  players: [
    {
      id: 1, name: 'Isaac',
      baseHP: 18,
      credits: 7,
      deck: [...], hand: [...], discard: [...],
      board: {
        active: card | null,
        secondary: card | null,
        defensive: card | null,
        support: card | null,
        bench: [card | null, ...], // length 6
      },
      traps: [card, ...], // face-down, triggered by opponent actions
    },
    // ... up to 6
  ],
  marketRow: [card, card, card],
  marketDeck: [...],
  turnLog: [{ timestamp, playerId, message }, ...],
}
```

### 6.2 Action Messages (per-device mode)

Each player action is a JSON message:

```json
{ "type": "PLAY_CARD", "playerId": 1, "cardId": "026", "target": { "type": "bot", "playerId": 2, "position": "active" } }
{ "type": "ATTACK", "playerId": 1, "botPosition": "active", "target": { "playerId": 2, "type": "base" } }
{ "type": "BUY_MARKET", "playerId": 1, "marketIndex": 1 }
{ "type": "END_TURN", "playerId": 1 }
```

Server validates, resolves, broadcasts updated game state to all players.

## 7. Card Effect System

Each card's effect is a function `execute(gameState, sourcePlayer, target) → { newState, logEntry }`.

Types of effects:

| Category | Examples |
|----------|----------|
| Direct damage | Striker, Brawler, Assault Bot, Scrap Bomb |
| Conditional damage | Flanker (+2 if target has no adjacent allies) |
| Debuff | Scout (-1 ATK), Disruptor (no abilities), Harasser (halve ATK) |
| Intercept | Bulwark, Fortress, Spike Wall, Shield Drone, Nullifier |
| Reflect | Bulwark (1 dmg), Spike Wall (2 dmg) |
| Heal | Repair Bot, Medic, Emergency Repair |
| Buff | Booster (+2 ATK), Overcharger (attack twice), Shield Gen (-3 dmg received) |
| Bypass | Breacher (ignores Defensive vs base) |
| Control | Hack (take control this turn) |
| Swap | Displacer (swap target to bench), Retreat Order (swap own bot to bench) |
| Economy | Salvage (draw + credit), Parts Scavenge (credits), Bounty Drone (double credits) |
| Multi-target | EMP Blast (up to 3 bots) |
| Delayed destroy | System Shock (destroy on next action if damaged) |
| Negate | Signal Jam (cancel ability), Counter-Hack (cancel instant), Failsafe (prevent death) |
| AP | Power Surge (+2 AP) |
| Trap detection | Tripwire (on bot play), Ambush (on base attack) |

## 8. Turn Log

Accessible via ⛭ icon. Chronological feed:

```
[14:32] Isaac played Striker → Active position
[14:32] Isaac's Striker attacked Kelly's Brawler for 4 damage
[14:32] Kelly's Ambush triggered! Dealt 2 damage to Striker
[14:33] Isaac bought Scrap Bomb from market (-1 credit)
[14:33] Isaac ended turn
[14:33] Kelly's turn begins — drew 1 card
```

## 9. Win Condition

- Each player's base has 20 HP
- Base HP hits 0 → player eliminated
- Scavenge rule: the player who dealt the final hit may take 1 bot from the eliminated player's board
- Last player standing wins
- Victory screen with play-again option

## 10. Room Management (per-device)

### 10.1 Host Flow

1. Tap "Host Game" → room code displayed
2. Share code with other players (verbally or via text)
3. Other players join → their names appear in the lobby
4. Host taps "Start Game" when all players are ready
5. Game begins with Player 1's turn

### 10.2 Join Flow

1. Tap "Join Game" → enter 4-letter code
2. Enter name
3. Connected → see other players in lobby
4. Host starts → game begins

### 10.3 Disconnection

- If a player disconnects, they have 60 seconds to reconnect
- If they don't reconnect, their turn is skipped until they return
- If the host disconnects, the server assigns a new host

## 11. Technical Summary

| Component | Stack |
|-----------|-------|
| Frontend | HTML, CSS, vanilla JS (same pattern as existing gallery) |
| Backend | Node.js + WebSocket (ws library) added to existing serve.js |
| Game engine | Pure JS state machine, card effects as functions |
| Room management | In-memory Map of room codes to game sessions |
| Assets | Reuse existing assets.js and rulebook.js data |

New files:
- `play.html` — game client page
- `play.js` — game UI and interaction
- `engine.js` — game state machine and card effects
- `server/` — WebSocket server and room management
- `play.css` — game UI styles

Existing files modified:
- `serve.js` — add WebSocket upgrade handling

Existing files reused (unchanged):
- `assets.js` — card data
- `rulebook.js` — rules
- `gallery.js`, `gallery-core.js` — gallery renderer
- `index.html`, `styles.css`, `print.css` — gallery UI
