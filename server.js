/**
 * Star-Link · 星·链 — Co-Star 中文克隆后端
 * Express 服务器 — Phase 1 MVP
 */
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3120;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API 路由
app.use('/api/daily', require('./routes/daily'));
app.use('/api/push', require('./routes/push'));
app.use('/api/synastry', require('./routes/synastry'));
app.use('/api/user', require('./routes/user'));
app.use('/api/natal', require('./routes/natal'));
app.use('/api/synastry-ds', require('./routes/synastry-deepseek'));
app.use('/api/void', require('./routes/void'));
app.use('/api/transits', require('./routes/transits'));
app.use('/api/predict', require('./routes/predict'));

// 健康检查
app.get('/api/health', (_, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// SPA fallback
app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`\n  ┌──────────────────────────────────────────┐`);
  console.log(`  │           星 · 链                      │`);
  console.log(`  │        Star-Link Server v1.0            │`);
  console.log(`  │                                          │`);
  console.log(`  │   http://localhost:${String(PORT).padEnd(5)}                      │`);
  console.log(`  └──────────────────────────────────────────┘\n`);
});
