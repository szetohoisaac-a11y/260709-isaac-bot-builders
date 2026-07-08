const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const gen = require('../scripts/gen-asset-image.js');
const exp = require('../scripts/export-shape.js');

const script = (f) => path.join(__dirname, '..', 'scripts', f);
const noKey = { ...process.env, GOOGLE_API_KEY: '' };

test('parseArgs reads prompt, type and id', () => {
  const a = gen.parseArgs(['node', 'x', 'a red bot', '--type', 'token', '--id', '105']);
  assert.equal(a.prompt, 'a red bot');
  assert.equal(a.type, 'token');
  assert.equal(a.id, '105');
});

test('parseArgs defaults type to card', () => {
  assert.equal(gen.parseArgs(['node', 'x', 'art']).type, 'card');
});

test('imagePath builds a typed, slugged path', () => {
  assert.equal(gen.imagePath('token', '105', 'Titan Unit'), 'assets/images/tokens/105-titan-unit.png');
});

test('placeholderSVG includes the name and a showcase note', () => {
  const svg = exp.placeholderSVG('Titan Unit', 'token');
  assert.match(svg, /Titan Unit/);
  assert.match(svg, /showcase/i);
});

test('gen-asset-image exits 0 and degrades without a key', () => {
  const out = execFileSync('node', [script('gen-asset-image.js'), 'a bot'], { env: noKey, encoding: 'utf8' });
  assert.match(out, /placeholder/i);
});

test('test-key reports a missing key without throwing', () => {
  const out = execFileSync('node', [script('test-key.js')], { env: noKey, encoding: 'utf8' });
  assert.match(out, /No GOOGLE_API_KEY/i);
});
