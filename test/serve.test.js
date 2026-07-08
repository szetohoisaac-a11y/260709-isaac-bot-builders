const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { contentType, resolveSafe } = require('../serve.js');

test('contentType maps known extensions', () => {
  assert.equal(contentType('a.html'), 'text/html; charset=utf-8');
  assert.equal(contentType('a.css'), 'text/css; charset=utf-8');
  assert.equal(contentType('a.js'), 'text/javascript; charset=utf-8');
  assert.equal(contentType('a.png'), 'image/png');
});

test('contentType falls back for unknown extensions', () => {
  assert.equal(contentType('a.xyz'), 'application/octet-stream');
});

test('resolveSafe maps / to index.html', () => {
  const root = path.resolve('/srv/app');
  assert.equal(resolveSafe(root, '/'), path.join(root, 'index.html'));
});

test('resolveSafe strips the query string', () => {
  const root = path.resolve('/srv/app');
  assert.equal(resolveSafe(root, '/assets.js?v=2'), path.join(root, 'assets.js'));
});

test('resolveSafe blocks path traversal', () => {
  const root = path.resolve('/srv/app');
  assert.equal(resolveSafe(root, '/../../etc/passwd'), null);
});
