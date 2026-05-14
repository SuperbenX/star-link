/**
 * SQLite 数据库服务 — 用户数据持久化
 */
const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '..', 'data', 'star-link.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nickname TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    token TEXT UNIQUE,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    data_key TEXT NOT NULL,
    data_value TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, data_key),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function generateToken() {
  return crypto.randomUUID();
}

module.exports = {
  register(nickname, password) {
    const hash = hashPassword(password);
    const token = generateToken();
    try {
      const stmt = db.prepare('INSERT INTO users (nickname, password_hash, token) VALUES (?, ?, ?)');
      stmt.run(nickname, hash, token);
      const user = db.prepare('SELECT id, nickname, token FROM users WHERE nickname = ?').get(nickname);
      return { ok: true, user };
    } catch (err) {
      if (err.message.includes('UNIQUE')) return { ok: false, error: '昵称已被使用' };
      return { ok: false, error: err.message };
    }
  },

  login(nickname, password) {
    const hash = hashPassword(password);
    const user = db.prepare('SELECT id, nickname, token FROM users WHERE nickname = ? AND password_hash = ?').get(nickname, hash);
    if (!user) return { ok: false, error: '昵称或密码错误' };
    const token = generateToken();
    db.prepare('UPDATE users SET token = ? WHERE id = ?').run(token, user.id);
    user.token = token;
    return { ok: true, user };
  },

  getUserByToken(token) {
    return db.prepare('SELECT id, nickname FROM users WHERE token = ?').get(token);
  },

  saveData(userId, key, value) {
    db.prepare(`
      INSERT INTO user_data (user_id, data_key, data_value, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, data_key) DO UPDATE SET
        data_value = excluded.data_value,
        updated_at = excluded.updated_at
    `).run(userId, key, JSON.stringify(value));
    return { ok: true };
  },

  getAllData(userId) {
    const rows = db.prepare('SELECT data_key, data_value FROM user_data WHERE user_id = ?').all(userId);
    const result = {};
    for (const row of rows) {
      try { result[row.data_key] = JSON.parse(row.data_value); } catch (_) { result[row.data_key] = row.data_value; }
    }
    return result;
  },

  close() { db.close(); },
};
