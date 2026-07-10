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
