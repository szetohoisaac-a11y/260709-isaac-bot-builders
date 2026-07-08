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
