# Bot Builders — Game Design Spec

A printable tabletop card game for 2–6 players. Teach in two minutes. Last base standing wins.

## 1. Theme

You're an engineer commanding a squad of combat bots. Each bot is built for a specific tactical role — attackers, flankers, bodyguards, healers. Assemble your lineup, manage your credits, and scrap the competition.

## 2. Components

### 2.1 Card Types (6 total)

Five permanent bot types, each designed for a specific board position:

| # | Type | Position | Has HP | Attacks | Special Ability |
|---|------|----------|--------|---------|-----------------|
| 1 | Active Bot | Active | Yes | 1–2 attack options (bots or base) | Some have one |
| 2 | Secondary Active | Secondary Active | Yes | Weaker attacks, can debuff enemy bots | No |
| 3 | Defensive Bot | Defensive | Yes (high HP) | None by default; some can reflect or counter | Some weaken attackers or reflect damage |
| 4 | Support Bot | Support | Yes | None | Heal or buff Active / Secondary |
| 5 | Bench Bot | Bench | Varies | None | Varies — generalist backup; the bench position can hold any bot type, not just bench bots |

The 6th type is a **one-shot ability card** — not a bot, held in hand:

| # | Type | Played From | Timing |
|---|------|-------------|--------|
| 6 | Ability Card | Hand | Instant (your turn) or Trap (set face-down, triggers on opponent action) |

### 2.2 Board Layout

Each player manages 5 position slots + a bench:

| Slot | Capacity | Purpose |
|------|----------|---------|
| Active Bot | 1 bot | Primary attacker |
| Secondary Active | 1 bot | Flanker, weaker attacks that weaken enemies |
| Defensive | 1 bot | High HP, intercepts damage to base, can counter/reflect |
| Support | 1 bot | Heals or buffs Active and Secondary |
| Bench | Up to 5 bots (any type) | Flexible reserve — any bot type can be stored here |

**Replacing a bot**: Playing a new bot to an occupied position lets you either move the old bot to the bench (if space) or discard it.

### 2.3 Decks

- **Personal deck**: Each player has their own deck (built during auction draft)
- **Market deck**: Shared deck, 3 cards always face-up in the market row. Refill after each purchase.

## 3. Setup

### 3.1 Auction Draft

1. Reveal **20 + (5 × number of players)** cards face-up from the market deck
2. Split **300 bidding chips** equally among all players
   - 2 players: 150 chips each
   - 3 players: 100 chips each
   - 4 players: 75 chips each
   - 5 players: 60 chips each
   - 6 players: 50 chips each
3. Players take turns bidding 1 chip at a time on a single card. Bidding continues until all players pass.
4. Won cards become that player's starting personal deck. Shuffle it.
5. Unsold cards are discarded. Unspent bidding chips are discarded.
6. Each player draws to a **5-card hand**.

### 3.2 Game Start

- Each player starts with **5 combat credits**
- Each player deploys **1 bot** from hand to any position for free (before the first turn)
- Market row is dealt: 3 cards face-up
- Randomly determine first player

## 4. Turn Structure

Each player gets **3 Action Points (AP)** per turn. AP do not carry over.

### 4.1 Action Menu

| Action | AP Cost | Notes |
|--------|---------|-------|
| Draw a card | 1 | From your personal deck |
| Buy from market | 1 + credit cost | Take one of the 3 face-up market cards; refill after |
| Play a bot to a position | 1 | Obey position limits (1 per slot, 5 on bench) |
| Play a one-shot ability card | 1 | Instant effects resolved immediately; traps set face-down |
| Attack with a bot | 1 | Declare target: enemy bot or enemy base |
| Activate a bot's built-in ability | 1 | Per the bot's card text |
| Swap position ↔ bench | 1 | Exchange one position bot with one bench bot |

### 4.2 End of Turn

- No hand size limit for **one-shot ability cards**
- Bot/module cards in hand: no explicit limit (governed by board capacity)
- Discard excess only if a card effect forces it

### 4.3 Attacking

- Attacks deal **fixed damage** (no dice) at a 1:1 ratio — ATK 3 deals 3 damage
- Active Bots can target enemy bots **or** enemy bases
- Secondary Active Bots can attack and may apply debuffs (weaken, reduce ATK, etc.)
- Defensive Bots of the target player may **intercept** attacks aimed at their base — the attacker must target the Defensive Bot instead
- Some Defensive Bots can **reflect a portion** of damage back or **weaken** the attacker on hit

### 4.4 Damage & Destruction

- Damage to bots **persists** between turns — track with counters, dice, or scratch paper
- A bot is **destroyed** when its HP reaches 0 — discard it and its controller earns +2 credits
- Base damage is permanent — no built-in repair (unless a card effect says otherwise)

## 5. Economy

### 5.1 Combat Credits

- Start with **5 credits** per player
- Earn **+2 credits** for defeating an enemy bot
- Some one-shot ability cards grant credits
- Credits carry over turn to turn (no cap)

### 5.2 Market

- 3 cards face-up at all times
- Purchase cost: **1 AP + listed credit cost** (per card)
- Market refills from the market deck immediately after each purchase
- Market deck runs out? Shuffle the discard pile to form a new market deck

## 6. Win Condition

- Each player's **base** has **20 HP**
- When a base reaches **0 HP**, that player is **eliminated**
- **Scavenge rule**: The player who dealt the final hit may immediately take **1 bot** of their choice from the eliminated player's board (any position or bench) and place it onto their own bench or into their hand. All other cards from the eliminated player are discarded.
- **Last player with a standing base wins**

## 7. Card Design Guidelines

### 7.1 Bot Stats Range

| Position | HP Range | ATK Range | Ability Frequency |
|----------|----------|-----------|-------------------|
| Active | 4–8 | 3–7 | ~50% have a special ability |
| Secondary Active | 3–6 | 1–4 | None |
| Defensive | 6–10 | 0–2 | ~50% have counter/reflect |
| Support | 2–5 | 0 | All have heal or buff |
| Bench | 2–8 | 0–2 | Varies |

### 7.2 Ability Card Guidelines

- **Instants**: cost 0–3 credits, one-time effects (damage, draw, heal, credits)
- **Traps**: cost 0–2 credits, set face-down, trigger condition listed on card, revealed on trigger
- Nothing that instantly eliminates a player or destroys a base outright

## 8. Print Format

- Cards designed for standard A4/letter paper
- Print, cut, and play — no special equipment needed
- Backed by the Bot Brawl gallery renderer: `assets.js` holds card data, `rulebook.js` holds the rules summary
- Print: File → Print → Save as PDF (rulebook prints first, then cards)

## 9. Technical Implementation

- **Content files**: `assets.js` (cards), `rulebook.js` (rules summary)
- **Renderer**: `gallery.js`, `gallery-core.js`, `index.html`, `styles.css`, `print.css`
- **Serve**: `npm start` → `http://localhost:5050`
- **Asset schema**: `{ id, type, name, category, effect, flavor?, image?, cost?, atk?, def?, hp? }`
  - Cards (Active, Secondary, Defensive, Support, Ability): use `cost`, `atk`, `def`
  - Tokens (Benched bots): use `hp`
  - Tiles: no numbers (not used in this game; skip for now)
- **IDs**: cards from `001`, tokens from `101`, tiles from `201`
- **No art required** initially — `image: null` uses placeholder icons
