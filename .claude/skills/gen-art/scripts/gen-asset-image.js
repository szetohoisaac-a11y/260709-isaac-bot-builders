const fs = require('node:fs');
const path = require('node:path');

const MODEL = 'gemini-2.5-flash-image'; // swappable; any Gemini image model works
const ENDPOINT = (model, key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

function slug(name) {
  return String(name || 'art').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { prompt: null, type: 'card', id: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--type') out.type = args[++i];
    else if (a === '--id') out.id = args[++i];
    else if (!a.startsWith('--') && out.prompt === null) out.prompt = a;
  }
  return out;
}

function imagePath(type, id, name) {
  return path.posix.join('assets', 'images', `${type}s`, `${id || '000'}-${slug(name)}.png`);
}

async function requestImage(prompt, key) {
  const res = await fetch(ENDPOINT(MODEL, key), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const parts = (((json.candidates || [])[0] || {}).content || {}).parts || [];
  const inline = parts.find((p) => p.inlineData && p.inlineData.data);
  if (!inline) throw new Error('no image in response');
  return Buffer.from(inline.inlineData.data, 'base64');
}

async function main() {
  const { prompt, type, id } = parseArgs(process.argv);
  if (!prompt) {
    console.log('Usage: node scripts/gen-asset-image.js "<prompt>" [--type card|token|tile] [--id NNN]');
    return;
  }
  const out = imagePath(type, id, prompt.split(' ').slice(0, 3).join(' '));
  const key = process.env.GOOGLE_API_KEY;
  if (!key) {
    console.log(`No GOOGLE_API_KEY set — skipping art. Your asset still renders with a placeholder.`);
    console.log(`(Would have saved: ${out})`);
    return;
  }
  try {
    const png = await requestImage(prompt, key);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, png);
    console.log(`saved: ${out}`);
  } catch (e) {
    console.log(`Image generation failed (${e.message}). No worries — the placeholder stays. ${out} not written.`);
  }
}

if (require.main === module) main();
module.exports = { parseArgs, imagePath, slug };
