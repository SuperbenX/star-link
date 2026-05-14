/**
 * 用户系统 — 注册/登录/数据同步
 */
const express = require('express');
const router = express.Router();
const db = require('../services/database');

function auth(req, res, next) {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: '未登录' });
  const user = db.getUserByToken(token);
  if (!user) return res.status(401).json({ error: '登录已过期' });
  req.user = user;
  next();
}

router.post('/register', (req, res) => {
  const { nickname, password } = req.body;
  if (!nickname || !password) return res.status(400).json({ error: '请提供昵称和密码' });
  if (password.length < 4) return res.status(400).json({ error: '密码至少4位' });
  const result = db.register(nickname, password);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json({ token: result.user.token, nickname: result.user.nickname });
});

router.post('/login', (req, res) => {
  const { nickname, password } = req.body;
  if (!nickname || !password) return res.status(400).json({ error: '请提供昵称和密码' });
  const result = db.login(nickname, password);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json({ token: result.user.token, nickname: result.user.nickname });
});

router.post('/sync', auth, (req, res) => {
  const { data } = req.body;
  if (!data || typeof data !== 'object') return res.status(400).json({ error: '请提供数据' });
  for (const [key, value] of Object.entries(data)) {
    db.saveData(req.user.id, key, value);
  }
  res.json({ ok: true });
});

router.get('/data', auth, (req, res) => {
  const data = db.getAllData(req.user.id);
  res.json({ data });
});

module.exports = router;
