const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function slug(name) {
  return String(name || 'shape').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function placeholderSVG(name, type) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="320" viewBox="0 0 240 320">
  <rect x="6" y="6" width="228" height="308" rx="18" fill="#F2F9FE" stroke="#45ACF4" stroke-width="3"/>
  <text x="120" y="150" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#213F99">${name}</text>
  <text x="120" y="182" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#888888">${type} · showcase shape</text>
</svg>`;
}

function loadAssets() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'assets.js'), 'utf8');
  const sandbox = { window: {} };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.window.ASSETS || [];
}

function main() {
  const id = process.argv[2];
  if (!id) {
    console.log('Usage: node scripts/export-shape.js <asset-id>');
    return;
  }
  const asset = loadAssets().find((a) => a.id === id);
  if (!asset) {
    console.log(`No asset with id ${id} in assets.js.`);
    return;
  }
  const out = path.posix.join('assets', 'shapes', `${asset.id}-${slug(asset.name)}.svg`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, placeholderSVG(asset.name, asset.type));
  console.log(`saved: ${out}`);
  console.log('Showcase only — turning this into a real STL/laser file is a makerspace step.');
}

if (require.main === module) main();
module.exports = { placeholderSVG, slug };
