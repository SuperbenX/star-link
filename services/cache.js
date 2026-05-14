/**
 * 简单内存缓存 — 24h TTL
 */
const store = new Map();
const TTL = 24 * 60 * 60 * 1000;

function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL) { store.delete(key); return null; }
  return entry.data;
}

function set(key, data) {
  store.set(key, { data, ts: Date.now() });
}

function flush() { store.clear(); }

module.exports = { get, set, flush };
