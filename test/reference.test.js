const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

test('reference skill has name + description frontmatter', () => {
  const md = read('reference', 'new-asset', 'SKILL.md');
  assert.match(md, /^---/);
  assert.match(md, /name:\s*new-asset/);
  assert.match(md, /description:/);
});

test('reference skill points at the data files and the append step', () => {
  const md = read('reference', 'new-asset', 'SKILL.md');
  assert.match(md, /assets\.js/);
  assert.match(md, /rulebook\.js/);
  assert.match(md, /\];/);
});

test('CLAUDE.md documents the asset schema', () => {
  const md = read('CLAUDE.md');
  assert.match(md, /window\.ASSETS/);
  assert.match(md, /token/);
});
