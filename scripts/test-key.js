async function main() {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) {
    console.log('✗ No GOOGLE_API_KEY found (.env). That is fine — art will use placeholders.');
    return;
  }
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    if (res.ok) console.log('✓ Key works. AI art is available.');
    else console.log(`✗ Key was rejected (HTTP ${res.status}). Check it, or just use placeholders.`);
  } catch (e) {
    console.log(`✗ Could not reach the API (${e.message}). Check your network, or use placeholders.`);
  }
}

if (require.main === module) main();
module.exports = { main };
