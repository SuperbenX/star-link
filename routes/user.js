/**
 * POST /api/user/register — 注册
 * GET  /api/user/:id — 获取用户信息
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const DATA_FILE = path.join(__dirname, '..', 'data', 'users.json');

function readUsers() { try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (_) { return []; } }
function writeUsers(u) { fs.writeFileSync(DATA_FILE, JSON.stringify(u, null, 2), 'utf8'); }

router.post('/register', (req, res) => {
  const { name, birthDate, birthTime, birthPlace } = req.body;
  if (!name) return res.status(400).json({ error: '请提供姓名' });
  const users = readUsers();
  const id = String(Date.now());
  users.push({ id, name, birthDate: birthDate||'', birthTime: birthTime||'', birthPlace: birthPlace||'', createdAt: new Date().toISOString() });
  writeUsers(users);
  res.json({ id, name });
});

router.get('/:id', (req, res) => {
  const user = readUsers().find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json(user);
});

module.exports = router;
