'use strict';

/* ================= Where the game keeps its data =================
   Everything goes through this small layer instead of using localStorage directly. In a browser it is localStorage. In the phone apps a
   "mirror" can be added (see native/storage-native.js): every write is also copied to the phone's own storage, and if the web view ever
   loses its data the save is brought back from the mirror at start-up. A mirror is { get(key) -> Promise<string|null>, set(key, value), remove(key) }. */
const storage = {
  mirror: null,
  get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
  /* Returns false when the browser could not store it (for example because it is full). */
  set(key, value) {
    let ok = true;
    try { localStorage.setItem(key, value); } catch (e) { ok = false; }
    if (this.mirror) Promise.resolve().then(() => this.mirror.set(key, value)).catch(() => {});
    return ok;
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
    if (this.mirror) Promise.resolve().then(() => this.mirror.remove(key)).catch(() => {});
  },
  /* Brings back any of these keys the browser no longer has but the mirror does. Resolves to true if something was restored. */
  async restore(keys) {
    if (!this.mirror) return false;
    let restored = false;
    for (const key of keys) {
      if (this.get(key) !== null) continue;
      let value = null;
      try { value = await this.mirror.get(key); } catch (e) { value = null; }
      if (typeof value === 'string' && value) { try { localStorage.setItem(key, value); restored = true; } catch (e) { /* ignore */ } }
    }
    return restored;
  }
};
