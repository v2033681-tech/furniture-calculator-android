const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function makeHarness({ native = true, initialLocal = [], secure = new Map(), secureWrite } = {}) {
  const local = new Map(initialLocal);
  const calls = { get: 0, set: 0, remove: 0 };
  const localStorage = {
    getItem(key) { return local.has(key) ? local.get(key) : null; },
    setItem(key, value) { local.set(key, value); },
    removeItem(key) { local.delete(key); }
  };
  const secureStorage = {
    async getItem(key) { calls.get += 1; return secure.has(key) ? secure.get(key) : null; },
    async setItem(key, value) { calls.set += 1; if (secureWrite) await secureWrite(key, value); secure.set(key, value); },
    async removeItem(key) { calls.remove += 1; secure.delete(key); }
  };
  const sandbox = { Map, Promise, String, TypeError, Error, Object, globalThis: null };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'auth-storage.js'), 'utf8'), sandbox, { filename: 'auth-storage.js' });
  const storage = sandbox.FurnitureAuthStorage.create({ isNative: () => native, secureStorage, localStorage });
  return { storage, local, secure, calls };
}

test('native Supabase sessions survive creating a fresh adapter after app restart', async () => {
  const first = makeHarness();
  await first.storage.setItem('sb-project-auth-token', '{"refresh_token":"protected-session"}');
  const second = makeHarness({ secure: first.secure });
  assert.equal(await second.storage.getItem('sb-project-auth-token'), '{"refresh_token":"protected-session"}');
  assert.equal(second.local.size, 0, 'native sessions are not copied to WebView localStorage');
});

test('legacy WebView session migrates to secure storage before its old copy is removed', async () => {
  const key = 'sb-project-auth-token';
  const value = '{"refresh_token":"legacy"}';
  const h = makeHarness({ initialLocal: [[key, value]] });
  assert.equal(await h.storage.getItem(key), value);
  assert.equal(h.secure.get(key), value);
  assert.equal(h.local.has(key), false);
  assert.equal(h.calls.set, 1);
});

test('failed legacy migration leaves the existing session untouched', async () => {
  const key = 'sb-project-auth-token';
  const value = '{"refresh_token":"legacy"}';
  const h = makeHarness({ initialLocal: [[key, value]], secureWrite: async () => { throw new Error('Keystore unavailable'); } });
  await assert.rejects(h.storage.getItem(key), /Keystore unavailable/);
  assert.equal(h.local.get(key), value);
});

test('concurrent reads migrate one legacy session exactly once', async () => {
  const key = 'sb-project-auth-token';
  const value = '{"refresh_token":"legacy"}';
  const h = makeHarness({ initialLocal: [[key, value]] });
  const result = await Promise.all([h.storage.getItem(key), h.storage.getItem(key)]);
  assert.deepEqual(result, [value, value]);
  assert.equal(h.calls.set, 1);
  assert.equal(h.local.has(key), false);
});

test('ordinary browser sessions continue using browser storage without native secure storage', async () => {
  const h = makeHarness({ native: false });
  await h.storage.setItem('sb-project-auth-token', 'browser-session');
  assert.equal(await h.storage.getItem('sb-project-auth-token'), 'browser-session');
  assert.equal(h.calls.set, 0);
  await h.storage.removeItem('sb-project-auth-token');
  assert.equal(h.local.has('sb-project-auth-token'), false);
});
