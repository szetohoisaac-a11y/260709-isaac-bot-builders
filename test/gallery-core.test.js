const { test } = require('node:test');
const assert = require('node:assert');
const C = require('../gallery-core.js');

const sample = [
  { id: '001', type: 'card', name: 'Overclock', category: 'Boost', cost: 2, atk: 3, def: 1, effect: 'x' },
  { id: '101', type: 'token', name: 'Scrapbot', category: 'Bot', hp: 4, effect: 'y' },
  { id: '201', type: 'tile', name: 'Open Floor', category: 'Arena', effect: 'z' },
];

test('groupByType splits into three families', () => {
  const g = C.groupByType(sample);
  assert.equal(g.card.length, 1);
  assert.equal(g.token.length, 1);
  assert.equal(g.tile.length, 1);
});

test('statChips returns present numeric stats in order', () => {
  assert.deepEqual(C.statChips(sample[0]), [
    { label: 'COST', value: 2 }, { label: 'ATK', value: 3 }, { label: 'HP', value: 1 },
  ]);
  assert.deepEqual(C.statChips(sample[1]), [{ label: 'HP', value: 4 }]);
  assert.deepEqual(C.statChips(sample[2]), []);
});

test('slug normalizes names', () => {
  assert.equal(C.slug('Cursed Anchor!'), 'cursed-anchor');
  assert.equal(C.slug('  Laser  Array  '), 'laser-array');
});

test('nextId increments within a type range', () => {
  assert.equal(C.nextId(sample, 'card'), '002');
  assert.equal(C.nextId(sample, 'token'), '102');
  assert.equal(C.nextId([], 'tile'), '201');
});

test('validateAsset accepts good assets and flags bad ones', () => {
  assert.deepEqual(C.validateAsset(sample[0]), []);
  assert.ok(C.validateAsset({ type: 'card', name: 'x' }).length > 0);
  assert.ok(C.validateAsset({ id: '1', type: 'card', name: 'x', category: 'c', effect: 'e' })
    .some((m) => m.includes('cost')));
  assert.ok(C.validateAsset({ id: '2', type: 'tile', name: 't', category: 'Arena', effect: 'e', atk: 3 })
    .some((m) => m.includes('tile')));
});
