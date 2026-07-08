const fs = require('node:fs');
const vm = require('node:vm');

// Run a browser-side script (e.g. assets.js) under a fake window and return it.
function loadGlobals(file) {
  const code = fs.readFileSync(file, 'utf8');
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: file });
  return sandbox.window;
}

module.exports = { loadGlobals };
