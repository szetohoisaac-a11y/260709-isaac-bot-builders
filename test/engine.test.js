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

test('attack kills bot when def reaches 0', () => {
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

test('repair bot heals 3 HP', () => {
  const s = E.createGame(['Alice'], 'shared');
  s.players[0].ap = 3;
  s.players[0].board.active = { id: '001', type: 'card', name: 'Striker', category: 'Active', cost: 3, atk: 4, def: 1, effect: 'test', image: null };
  const result = E.useSupportAbility(s, 1, 'Repair Bot', 'active');
  assert.equal(result.newState.players[0].board.active.def, 4);
  assert.equal(result.newState.players[0].ap, 2);
});

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
