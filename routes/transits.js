const express = require('express');
const router = express.Router();
const astro = require('../engine/astronomy');
const transit = require('../engine/transit');
const cache = require('../services/cache');

router.post('/week', async (req, res) => {
  try {
    const { birthDate, birthTime, lat, lng } = req.body;
    if (!birthDate || lat == null || lng == null) {
      return res.status(400).json({ error: '请提供出生信息' });
    }

    const cacheKey = 'week_' + birthDate + '_' + (birthTime || '12:00');
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const [h, m] = (birthTime || '12:00').split(':').map(Number);
    const birthUTC = new Date(Date.UTC(
      parseInt(birthDate.slice(0,4)), parseInt(birthDate.slice(5,7))-1,
      parseInt(birthDate.slice(8,10)), h-8, m, 0
    ));
    const natalPos = astro.getAllPositions(birthUTC);
    const today = new Date(); today.setHours(12,0,0,0);
    const days = [], E = ['quiet','moderate','active'];
    const W = ['周日','周一','周二','周三','周四','周五','周六'];

    for (let i = 0; i < 7; i++) {
      const d = new Date(today); d.setDate(d.getDate() + i);
      const tPos = astro.getAllPositions(d);
      const asp = transit.calcTransitNatal(tPos, natalPos, {});
      const moon = astro.getMoonPhase(d);
      const mp = tPos.find(p => p.body === 'Moon');
      const top = asp.slice(0, 2).map(a => ({ aspect: a.aspect, body: a.transitBody, natal: a.natalBody, score: a.score }));
      const max = asp.length > 0 ? asp[0].score : 0;
      days.push({
        date: d.toISOString().slice(0,10),
        weekday: W[d.getDay()],
        moon: mp ? mp.sign + mp.degree + '°' : '',
        moonPhase: moon.name,
        topAspects: top,
        aspectCount: asp.length,
        energy: max >= 60 ? 'active' : max >= 25 ? 'moderate' : 'quiet',
        energyLabel: max >= 60 ? '活跃' : max >= 25 ? '有影响' : '平稳',
      });
    }

    cache.set(cacheKey, { days });
    res.json({ days });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
