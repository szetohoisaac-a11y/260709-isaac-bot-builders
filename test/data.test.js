const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { loadGlobals } = require('./helpers/load-globals.js');
const C = require('../gallery-core.js');

const kit = (f) => path.join(__dirname, '..', f);

test('assets.js seed data is all valid', () => {
  const w = loadGlobals(kit('assets.js'));
  assert.ok(Array.isArray(w.ASSETS) && w.ASSETS.length >= 6);
  for (const a of w.ASSETS) {
    assert.deepEqual(C.validateAsset(a), [], `invalid ${a && a.id}: ${C.validateAsset(a)}`);
  }
});

test('asset ids are unique', () => {
  const w = loadGlobals(kit('assets.js'));
  const ids = w.ASSETS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('all three families are represented', () => {
  const w = loadGlobals(kit('assets.js'));
  const g = C.groupByType(w.ASSETS);
  assert.ok(g.card.length && g.token.length && g.tile.length);
});

test('rulebook.js has all sections', () => {
  const w = loadGlobals(kit('rulebook.js'));
  for (const k of ['theme', 'howToPlay', 'aTurn', 'winCondition', 'pieces', 'ranges']) {
    assert.ok(w.RULEBOOK[k], `missing rulebook.${k}`);
  }
});
