/**
 * GET /api/push/:userId — 推送文案
 */
const express = require('express');
const router = express.Router();
const astro = require('../engine/astronomy');
const aspects = require('../engine/aspects');
const prompt = require('../services/prompt');
const cache = require('../services/cache');

router.get('/:userId', (req, res) => {
  const cacheKey = `push_${new Date().toISOString().slice(0,10)}`;
  const cached = cache.get(cacheKey); if (cached) return res.json(cached);
  const positions = astro.getAllPositions(new Date());
  const aspectList = aspects.calculate(positions);
  const content = prompt.generateDaily(aspectList[0] || null);
  const result = { push: content.push };
  cache.set(cacheKey, result);
  res.json(result);
});

module.exports = router;
