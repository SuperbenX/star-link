/**
 * POST /api/natal/reading — 命盘深度解读
 * Body: { birthDate, birthTime, lat, lng, name }
 * 返回：天文数据 + DeepSeek 生成的人格分析
 */
const express = require('express');
const router = express.Router();
const astro = require('../engine/astronomy');
const aspects = require('../engine/aspects');
const houses = require('../engine/houses');
const cache = require('../services/cache');
const { callDeepSeek, strHash } = require('../services/deepseek');
const { buildNatalPrompt } = require('../services/natal-prompt');

const OBLIQUITY = 23.4392911;

function norm(d) { return ((d % 360) + 360) % 360; }
function getSign(lon) { return astro.ZODIAC[Math.floor(norm(lon) / 30)].name; }
function getSignDegree(lon) { return Math.floor(norm(lon) % 30); }

function calcAscendant(date, lat, lng) {
  const Astronomy = require('astronomy-engine');
  const t = Astronomy.MakeTime(date);
  const jd = t.ut;
  const jc = (jd - 2451545.0) / 36525.0;
  let gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0)
    + 0.000387933 * jc * jc - jc * jc * jc / 38710000.0;
  gmst = norm(gmst);
  const lst = norm(gmst + lng);
  const obr = OBLIQUITY * Math.PI / 180;
  const lstRad = lst * Math.PI / 180;
  const latRad = lat * Math.PI / 180;

  const ascLon = Math.atan2(
    -Math.cos(lstRad),
    Math.sin(obr) * Math.tan(latRad) + Math.cos(obr) * Math.sin(lstRad)
  ) * 180 / Math.PI;
  const asc = norm(ascLon);

  const mcLon = Math.atan2(Math.tan(lstRad), Math.cos(obr)) * 180 / Math.PI;
  const mc = norm(mcLon);

  const ramc = lst;
  const cuspsArr = houses.calcHouses(ramc, lat, OBLIQUITY, asc, mc);
  const houseList = houses.formatHouses(cuspsArr);
  return {
    ascendant: { lon: asc, sign: getSign(asc), degree: getSignDegree(asc) },
    mc: { lon: mc, sign: getSign(mc), degree: getSignDegree(mc) },
    houses: houseList,
  };
}

router.post('/reading', async (req, res) => {
  try {
    const { birthDate, birthTime, lat, lng, name } = req.body;
    if (!birthDate || lat == null || lng == null) {
      return res.status(400).json({ error: '请提供出生日期、纬度和经度' });
    }

    const timeStr = birthTime || '12:00';
    const [h, m] = timeStr.split(':').map(Number);
    const birthUTC = new Date(Date.UTC(
      parseInt(birthDate.slice(0, 4)),
      parseInt(birthDate.slice(5, 7)) - 1,
      parseInt(birthDate.slice(8, 10)),
      h - 8, m, 0
    ));

    const cacheKey = `natal_${birthDate}_${birthTime}_${lat}_${lng}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const positions = astro.getAllPositions(birthUTC);
    const { ascendant, mc, houses: houseList } = calcAscendant(birthUTC, lat, lng);
    const aspectList = aspects.calculate(positions);
    const moon = astro.getMoonPhase(birthUTC);

    const natalData = {
      positions,
      ascendant,
      mc,
      houses: houseList,
      aspects: aspectList,
      moonPhase: `${moon.name} · 月龄 ${moon.age} 天`,
    };

    const { system, user } = buildNatalPrompt(natalData);
    const raw = await callDeepSeek([
      { role: 'system', content: system },
      { role: 'user', content: user },
    ], { temperature: 0.0, maxTokens: 4096, seed: strHash(`${birthDate}_${birthTime || '12:00'}_${lat}_${lng}`) });

    let reading;
    try {
      reading = JSON.parse(raw);
    } catch (_) {
      let jsonStr = null;
      const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (m) jsonStr = m[1];
      else {
        const braceIdx = raw.indexOf('{');
        if (braceIdx >= 0) {
          let depth = 0, end = -1;
          for (let i = braceIdx; i < raw.length; i++) {
            if (raw[i] === '{') depth++;
            else if (raw[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
          }
          if (end > braceIdx) jsonStr = raw.slice(braceIdx, end);
        }
      }
      if (jsonStr) { try { reading = JSON.parse(jsonStr); } catch (_2) { throw new Error('DeepSeek 响应不是有效的 JSON'); } }
      else throw new Error('DeepSeek 响应不是有效的 JSON');
    }

    const result = {
      name: name || '',
      date: birthDate,
      time: birthTime || '12:00',
      ascendant,
      mc,
      houses: houseList,
      positions,
      aspects: aspectList.slice(0, 5),
      moon,
      reading,
    };

    cache.set(cacheKey, result);
    res.json(result);

  } catch (err) {
    console.error('命盘计算失败:', err.message);
    res.status(500).json({ error: '命盘计算失败: ' + err.message });
  }
});

/* ═══ 出生时间校正 ═══ */
router.post('/ascendants', (req, res) => {
  try {
    const { birthDate, lat, lng } = req.body;
    if (!birthDate || lat == null || lng == null) {
      return res.status(400).json({ error: '请提供出生信息' });
    }

    const ranges = [
      { key: '凌晨', label: '凌晨 (0:00-5:59)', time: '03:00' },
      { key: '早上', label: '早上 (6:00-11:59)', time: '09:00' },
      { key: '下午', label: '下午 (12:00-17:59)', time: '15:00' },
      { key: '晚上', label: '晚上 (18:00-23:59)', time: '21:00' },
    ];

    const results = ranges.map(r => {
      const [h, m] = r.time.split(':').map(Number);
      const birthUTC = new Date(Date.UTC(
        parseInt(birthDate.slice(0, 4)),
        parseInt(birthDate.slice(5, 7)) - 1,
        parseInt(birthDate.slice(8, 10)),
        h - 8, m, 0
      ));
      const { ascendant } = calcAscendant(birthUTC, lat, lng);
      return {
        key: r.key,
        label: r.label,
        time: r.time,
        ascendant,
      };
    });

    res.json({ ranges: results });
  } catch (err) {
    console.error('上升计算失败:', err.message);
    res.status(500).json({ error: '上升计算失败: ' + err.message });
  }
});

module.exports = router;
