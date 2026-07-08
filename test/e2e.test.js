const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../gallery-core.js');

function loadSource(src) {
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.window;
}

test('appending a card the way /new-asset does keeps the gallery valid', () => {
  const file = path.join(__dirname, '..', 'assets.js');
  const original = fs.readFileSync(file, 'utf8');
  const before = loadSource(original).ASSETS;
  const id = C.nextId(before, 'card');

  const entry =
    `  { id: '${id}', type: 'card', name: 'EMP Burst', category: 'Attack', cost: 3, atk: 4, def: 0,\n` +
    `    effect: 'Stun a rival bot for one turn.', flavor: 'Lights out.', image: null },\n`;

  // Insert before the closing `];` — exactly what the skill is told to do.
  const patched = original.replace(/\n\];\s*$/, `\n${entry}];\n`);
  assert.notEqual(patched, original, 'the append must change the source');

  const after = loadSource(patched).ASSETS;
  assert.equal(after.length, before.length + 1);

  const added = after.find((a) => a.id === id);
  assert.ok(added, 'new asset is present');
  assert.deepEqual(C.validateAsset(added), []);
  assert.equal(new Set(after.map((a) => a.id)).size, after.length, 'ids stay unique');
  assert.equal(C.groupByType(after).card.length, C.groupByType(before).card.length + 1);
});
