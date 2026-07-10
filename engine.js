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

    const playerCount = playerNames.length;
    const biddingChips = Math.floor(300 / playerCount);
    const totalAuctionRounds = 10 + (2 * playerCount);
    // Build auction pool: shuffle market deck, take first totalAuctionRounds cards
    const auctionPool = ENGINE.shuffle(botShop.slice()).slice(0, totalAuctionRounds);
    const remainingMarket = ENGINE.shuffle(botShop.slice()).slice(totalAuctionRounds);

    const players = playerNames.map((name, i) => ({
      id: i + 1,
      name,
      baseHP: 20,
      credits: 5,
      biddingChips,
      deck: [],  // filled after auction with starter + won cards
      hand: [],
      discard: [],
      board: { active: null, secondary: null, defensive: null, support: null, bench: new Array(6).fill(null) },
      traps: [],
      debuffs: [],
      ap: 0,
    }));

    const state = {
      phase: 'auction',
      mode: mode || 'shared',
      turn: 0,
      activePlayer: 1,
      players,
      auctionPool,
      auctionRound: 0,
      totalAuctionRounds,
      currentAuctionCard: auctionPool.length > 0 ? auctionPool[0] : null,
      bids: {},  // { playerId: amount }
      marketRow: [],
      marketDeck: remainingMarket,
      turnLog: [{ time: Date.now(), msg: `Auction begins! ${totalAuctionRounds} cards. Each player has ${biddingChips} bidding chips.` }],
      winner: null,
    };

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

    let dmg = atk;
    if (targetType === 'base') {
      const intercept = ENGINE.resolveIntercept(s, targetPlayerId, dmg);
      const def = defender && defender.board && defender.board.defensive;
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
      s.turnLog.push({ time: Date.now(), playerId, msg: `${attacker.name}'s ${bot.name} attacked ${defender ? defender.name : '?'}'s base.` });
      return { newState: s, logEntry: s.turnLog[s.turnLog.length - 1] };
    } else {
      const result = ENGINE.dealDamage(s, targetPlayerId, targetType, targetPosition, dmg);
      result.newState.turnLog.push({ time: Date.now(), playerId, msg: `${attacker.name}'s ${bot.name} attacked ${defender ? defender.name : '?'}'s ${targetType} for ${dmg} damage.` });
      return { newState: result.newState, logEntry: result.newState.turnLog[result.newState.turnLog.length - 1], destroyed: result.destroyed };
    }
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

  ENGINE.resolveIntercept = function (state, targetPlayerId, damage) {
    const p = state.players.find(pl => pl.id === targetPlayerId);
    if (!p) return { actualDamage: damage, reflectedDamage: 0, defenderDamage: 0 };
    const def = p.board.defensive;
    if (!def) return { actualDamage: damage, reflectedDamage: 0, defenderDamage: 0 };

    const name = def.name;
    if (name === 'Fortress') {
      return { actualDamage: 0, reflectedDamage: 0, defenderDamage: damage };
    }
    if (name === 'Bulwark') {
      return { actualDamage: 0, reflectedDamage: 1, defenderDamage: damage };
    }
    if (name === 'Spike Wall') {
      return { actualDamage: 0, reflectedDamage: 2, defenderDamage: damage };
    }
    if (name === 'Shield Drone') {
      const reduced = Math.max(0, damage - 2);
      return { actualDamage: 0, reflectedDamage: 0, defenderDamage: reduced };
    }
    if (name === 'Nullifier') {
      const half = Math.floor(damage / 2);
      return { actualDamage: half, reflectedDamage: 0, defenderDamage: damage - half, silenceAttacker: true };
    }
    return { actualDamage: damage, reflectedDamage: 0, defenderDamage: 0 };
  };

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

  ENGINE.playInstant = function (state, playerId, cardId, targets) {
    let s = ENGINE.clone(state);
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
          s = res.newState;
          s.turnLog.push({ time: Date.now(), playerId, msg: `${p.name} played Scrap Bomb — 3 damage to ${t.playerId}'s ${t.position}.` });
        }
        break;
      case 'Overdrive':
        if (targets && targets.length) {
          const t = targets[0];
          const buffResult = ENGINE.buff(s, t.playerId, t.position, 'atk', 3, s.turn + 2);
          s = buffResult.newState;
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
          const debuffResult = ENGINE.applyDebuff(s, t.playerId, t.position, 'systemShock', 1, s.turn + 99);
          s = debuffResult.newState;
          s.turnLog.push({ time: Date.now(), playerId, msg: `${p.name} played System Shock — target will be destroyed on next action.` });
        }
        break;
    }
    return { newState: s, logEntry: s.turnLog[s.turnLog.length - 1] };
  };

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

  // ── Auction Phase ───────────────────────────────────────

  ENGINE.submitBid = function (state, playerId, amount) {
    const s = ENGINE.clone(state);
    const p = s.players.find(pl => pl.id === playerId);
    if (!p) return { newState: s, error: 'Player not found' };
    if (s.phase !== 'auction') return { newState: s, error: 'Not in auction phase' };
    if (amount < 0 || amount > p.biddingChips) return { newState: s, error: 'Invalid bid amount' };
    if (s.bids[playerId] !== undefined) return { newState: s, error: 'Already bid this round' };
    s.bids[playerId] = amount;
    s.turnLog.push({ time: Date.now(), playerId, msg: `${p.name} submitted a bid.` });
    // Check if all alive players have bid
    const alive = s.players.filter(pl => pl.baseHP > 0);
    const allBid = alive.every(pl => s.bids[pl.id] !== undefined);
    if (allBid) {
      return ENGINE.resolveAuctionRound(s);
    }
    return { newState: s };
  };

  ENGINE.resolveAuctionRound = function (state) {
    const s = ENGINE.clone(state);
    const card = s.currentAuctionCard;
    if (!card) return { newState: s, error: 'No auction card' };
    const bids = s.bids;
    const alive = s.players.filter(pl => pl.baseHP > 0);

    // Find highest bid
    let maxBid = 0;
    let winnerIds = [];
    for (const pl of alive) {
      const bid = bids[pl.id] || 0;
      if (bid > maxBid) { maxBid = bid; winnerIds = [pl.id]; }
      else if (bid === maxBid && bid > 0) { winnerIds.push(pl.id); }
    }

    // If all bid 0, no one wins the card — discard it
    if (maxBid === 0) {
      s.turnLog.push({ time: Date.now(), msg: `No bids on ${card.name} — card discarded.` });
    } else if (winnerIds.length > 1) {
      // Tie: re-bid required. Log it and reset bids for tied players only
      const tied = winnerIds.map(id => s.players.find(p => p.id === id).name).join(', ');
      s.turnLog.push({ time: Date.now(), msg: `Tie between ${tied}! Re-bid for ${card.name}.` });
      // Reset bids, but only tied players can re-bid
      // We mark this by clearing bids and setting a reBidPlayers field
      s._tiePlayers = winnerIds;
      s.bids = {};
      return { newState: s, tie: true, tiedPlayers: winnerIds };
    } else {
      // One winner
      const winnerId = winnerIds[0];
      const winner = s.players.find(pl => pl.id === winnerId);
      winner.biddingChips -= maxBid;
      winner.deck.push(card);
      s.turnLog.push({ time: Date.now(), msg: `${winner.name} won ${card.name} for ${maxBid} chips!` });
    }

    // Advance to next round
    return ENGINE.nextAuctionCard(s);
  };

  ENGINE.nextAuctionCard = function (state) {
    const s = ENGINE.clone(state);
    s.auctionRound++;
    s.bids = {};
    delete s._tiePlayers;

    if (s.auctionRound >= s.totalAuctionRounds || !s.auctionPool[s.auctionRound]) {
      // Auction complete — start the game
      s.phase = 'playing';
      s.currentAuctionCard = null;

      // Give each player their starter deck + shuffle
      const allCards = ENGINE.loadCards();
      const byName = {};
      for (const c of allCards) byName[c.name] = c;
      const starterNames = [
        ['Striker',1],['Brawler',1],['Scout',1],['Shield Drone',1],
        ['Repair Bot',2],['Salvage',3],['Parts Scavenge',2],
        ['Retreat Order',2],['Emergency Repair',1],['Failsafe',1]
      ];
      for (const p of s.players) {
        for (const [name, n] of starterNames) {
          const card = byName[name];
          if (card) for (let i = 0; i < n; i++) p.deck.push({...card});
        }
        p.deck = ENGINE.shuffle(p.deck);
      }

      // Fill market row
      for (let i = 0; i < 3; i++) {
        if (s.marketDeck.length) s.marketRow.push(s.marketDeck.pop());
      }

      s.turnLog.push({ time: Date.now(), msg: 'Auction complete! Game begins.' });

      // Start player 1's turn
      const result = ENGINE.startTurn(s);
      return { newState: result.newState, auctionComplete: true };
    }

    s.currentAuctionCard = s.auctionPool[s.auctionRound];
    s.turnLog.push({ time: Date.now(), msg: `Next auction card: ${s.currentAuctionCard.name}. Place your bids!` });
    return { newState: s };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = ENGINE;
  if (typeof window !== 'undefined') window.GameEngine = ENGINE;
})();
