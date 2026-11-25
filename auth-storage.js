(function (root) {
  'use strict';

  function createStorage(options) {
    const config = options || {};
    const isNative = typeof config.isNative === 'function' ? config.isNative : function () { return false; };
    const secureStorage = config.secureStorage || root.FurnitureSecureStorage;
    const localStorage = config.localStorage || root.localStorage;
    const migrations = new Map();

    function nativeStore() {
      if (!isNative()) return null;
      if (!secureStorage || typeof secureStorage.getItem !== 'function' || typeof secureStorage.setItem !== 'function' || typeof secureStorage.removeItem !== 'function') {
        throw new Error('Безопасное хранилище Android не загружено. Авторизация не будет сохранена в открытом виде.');
      }
      return secureStorage;
    }

    async function readSecure(store, key) {
      const value = await store.getItem(key);
      if (value === null || value === undefined) return null;
      if (typeof value !== 'string') throw new TypeError('Защищённое хранилище вернуло значение с неверным типом.');
      return value;
    }

    async function migrateLegacyValue(store, key, legacyValue) {
      const existing = await readSecure(store, key);
      if (existing !== null) return existing;
      await store.setItem(key, legacyValue);
      const verified = await readSecure(store, key);
      if (verified !== legacyValue) throw new Error('Не удалось проверить перенос сохранённой сессии в защищённое хранилище.');
      // Remove only this migrated Supabase auth key, and only after the secure copy was verified.
      localStorage.removeItem(key);
      return verified;
    }

    return Object.freeze({
      async getItem(key) {
        const store = nativeStore();
        if (!store) return localStorage.getItem(key);
        const secureValue = await readSecure(store, key);
        if (secureValue !== null) return secureValue;
        const legacyValue = localStorage.getItem(key);
        if (legacyValue === null) return null;
        if (!migrations.has(key)) {
          const migration = migrateLegacyValue(store, key, legacyValue);
          migrations.set(key, migration);
          migration.finally(function () { if (migrations.get(key) === migration) migrations.delete(key); }).catch(function () {});
        }
        return migrations.get(key);
      },
      async setItem(key, value) {
        const store = nativeStore();
        if (store) await store.setItem(key, value);
        else localStorage.setItem(key, value);
      },
      async removeItem(key) {
        const store = nativeStore();
        if (store) await store.removeItem(key);
        localStorage.removeItem(key);
      }
    });
  }

  root.FurnitureAuthStorage = Object.freeze({ create: createStorage });
})(typeof globalThis !== 'undefined' ? globalThis : window);
