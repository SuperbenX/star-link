/**
 * GET /api/daily/:userId — 当日日签
 */
const express = require('express');
const router = express.Router();
const astro = require('../engine/astronomy');
const aspects = require('../engine/aspects');
const houses = require('../engine/houses');
const prompt = require('../services/prompt');
const cache = require('../services/cache');

/* ═══ 推送文案（访客/未登录）═══ */
router.get('/guest', (req, res) => {
  const cacheKey = 'push_guest_' + new Date().toISOString().slice(0,10);
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);
  const positions = astro.getAllPositions(new Date());
  const aspectList = aspects.calculate(positions);
  const content = prompt.generateDaily(aspectList[0] || null);
  cache.set(cacheKey, { push: content.push });
  res.json({ push: content.push });
});

router.get('/:userId', (req, res) => {
  const { userId } = req.params;
  const cacheKey = `daily_${userId}_${new Date().toISOString().slice(0,10)}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  const now = new Date();
  const positions = astro.getAllPositions(now);
  const aspectList = aspects.calculate(positions);
  const top = aspectList[0] || null;
  const moon = astro.getMoonPhase(now);
  const content = prompt.generateDaily(top);

  const result = {
    date: now.toISOString().slice(0,10), moon,
    positions: positions.map(p => ({ name: p.name, sign: p.sign, degree: p.degree })),
    topAspect: top ? { n1: top.n1, n2: top.n2, aspect: top.aspect, score: top.score } : null,
    horoscope: content.body, detail: content.detail,
    keyword: content.keyword, push: content.push,
  };

  cache.set(cacheKey, result);
  res.json(result);
});

/* ═══ 行运-本命日签（DeepSeek 生成）═══ */
const Astronomy = require('astronomy-engine');
const transit = require('../engine/transit');
const { callDeepSeek, strHash } = require('../services/deepseek');
const { buildDailyPrompt } = require('../services/daily-prompt');

const OBLIQUITY = 23.4392911;
function norm(d) { return ((d % 360) + 360) % 360; }
function getSign(lon) { return astro.ZODIAC[Math.floor(norm(lon) / 30)].name; }
function getSignDegree(lon) { return Math.floor(norm(lon) % 30); }

function calcAscendant(date, lat, lng) {
  const t = Astronomy.MakeTime(date);
  const jd = t.ut;
  const jc = (jd - 2451545.0) / 36525.0;
  let gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * jc * jc - jc * jc * jc / 38710000.0;
  gmst = norm(gmst);
  const lst = norm(gmst + lng);
  const obr = OBLIQUITY * Math.PI / 180;
  const ascLon = Math.atan2(-Math.cos(lst * Math.PI / 180), Math.sin(obr) * Math.tan(lat * Math.PI / 180) + Math.cos(obr) * Math.sin(lst * Math.PI / 180)) * 180 / Math.PI;
  const asc = norm(ascLon);
  const mcLon = Math.atan2(Math.tan(lst * Math.PI / 180), Math.cos(obr)) * 180 / Math.PI;
  const mc = norm(mcLon);
  const houseCusps = houses.calcHouses(lst, lat, OBLIQUITY, asc, mc);
  const houseList = houses.formatHouses(houseCusps);
  return { ascendant: { lon: asc, sign: getSign(asc), degree: getSignDegree(asc) }, mc: { lon: mc, sign: getSign(mc), degree: getSignDegree(mc) }, houses: houseList };
}

router.post('/reading', async (req, res) => {
  try {
    const { birthDate, birthTime, lat, lng, date } = req.body;
    if (!birthDate || lat == null || lng == null) {
      return res.status(400).json({ error: '请提供出生日期、纬度和经度' });
    }

    // 支持任意日期查询，默认今天
    const targetDate = date || new Date().toISOString().slice(0,10);
    const target = new Date(targetDate + 'T12:00:00Z');

    const [h, m] = (birthTime || '12:00').split(':').map(Number);
    const birthUTC = new Date(Date.UTC(parseInt(birthDate.slice(0,4)), parseInt(birthDate.slice(5,7))-1, parseInt(birthDate.slice(8,10)), h-8, m, 0));
    const cacheKey = `daily_reading_${birthDate}_${targetDate}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const transitPositions = astro.getAllPositions(target);
    const natalPositions = astro.getAllPositions(birthUTC);
    const { ascendant, mc, houses: houseList } = calcAscendant(birthUTC, lat, lng);
    const transitAspects = transit.calcTransitNatal(transitPositions, natalPositions, { ascendant, mc });
    const moon = astro.getMoonPhase(target);

    // 计算明天趋势（用于生成 tomorrowHook）
    const tomorrowDate = new Date(target);
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowPos = astro.getAllPositions(tomorrowDate);
    const tomorrowAspects = transit.calcTransitNatal(tomorrowPos, natalPositions, { ascendant, mc });
    const topTomorrow = tomorrowAspects[0];
    let tomorrowTrend = "无明显活跃相位";
    if (topTomorrow) {
      tomorrowTrend = `最强相位：行运${topTomorrow.transitBody} ${topTomorrow.aspect} 本命${topTomorrow.natalBody}（强度 ${topTomorrow.score}）`;
    }

    const { system, user } = buildDailyPrompt(transitPositions, natalPositions, transitAspects, ascendant, mc, `${moon.name} · 月龄${moon.age}天`, targetDate, tomorrowTrend, houseList);
    const raw = await callDeepSeek([
      { role: 'system', content: system },
      { role: 'user', content: user },
    ], { temperature: 0.0, maxTokens: 4096, seed: strHash(`${birthDate}_${targetDate}`) });

    let reading;
    try { reading = JSON.parse(raw); }
    catch (_) {
      const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) reading = JSON.parse(match[1]);
      else throw new Error('DeepSeek 响应不是有效的 JSON');
    }

    const result = {
      date: targetDate,
      moon: { name: moon.name, age: moon.age },
      transitPositions,
      natalPositions,
      ascendant, mc,
      transitAspects: transitAspects.slice(0, 6),
      reading,
    };

    cache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error('日签生成失败:', err.message);
    res.status(500).json({ error: '日签生成失败: ' + err.message });
  }
});

/* ═══ AI 生成发布标题（综合 fortune + 星象 + 去重）═══ */
router.post('/title', async (req, res) => {
  try {
    const { birthDate, birthTime, lat, lng, date, historyTitles } = req.body;
    if (!birthDate || lat == null || lng == null) {
      return res.status(400).json({ error: '请提供出生日期、纬度和经度' });
    }

    // 复用日签生成逻辑拿当天数据（走 /reading 相同计算，缓存命中即快）
    const targetDate = date || new Date().toISOString().slice(0,10);
    const target = new Date(targetDate + 'T12:00:00Z');
    const [h, m] = (birthTime || '12:00').split(':').map(Number);
    const birthUTC = new Date(Date.UTC(parseInt(birthDate.slice(0,4)), parseInt(birthDate.slice(5,7))-1, parseInt(birthDate.slice(8,10)), h-8, m, 0));
    const cacheKey = `daily_reading_${birthDate}_${targetDate}`;
    let reading = cache.get(cacheKey);

    if (!reading) {
      const transitPositions = astro.getAllPositions(target);
      const natalPositions = astro.getAllPositions(birthUTC);
      const { ascendant, mc, houses: houseList } = calcAscendant(birthUTC, lat, lng);
      const transitAspects = transit.calcTransitNatal(transitPositions, natalPositions, { ascendant, mc });
      const moon = astro.getMoonPhase(target);
      const tomorrowDate = new Date(target);
      tomorrowDate.setDate(tomorrowDate.getDate() + 1);
      const tomorrowPos = astro.getAllPositions(tomorrowDate);
      const tomorrowAspects = transit.calcTransitNatal(tomorrowPos, natalPositions, { ascendant, mc });
      const topTomorrow = tomorrowAspects[0];
      let tomorrowTrend = "无明显活跃相位";
      if (topTomorrow) {
        tomorrowTrend = `最强相位：行运${topTomorrow.transitBody} ${topTomorrow.aspect} 本命${topTomorrow.natalBody}（强度 ${topTomorrow.score}）`;
      }
      const { system, user } = buildDailyPrompt(transitPositions, natalPositions, transitAspects, ascendant, mc, `${moon.name} · 月龄${moon.age}天`, targetDate, tomorrowTrend, houseList);
      const raw = await callDeepSeek([
        { role: 'system', content: system },
        { role: 'user', content: user },
      ], { temperature: 0.0, maxTokens: 4096, seed: strHash(`${birthDate}_${targetDate}`) });
      let parsed;
      try { parsed = JSON.parse(raw); }
      catch (_) {
        const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (match) parsed = JSON.parse(match[1]);
        else throw new Error('DeepSeek 响应不是有效的 JSON');
      }
      reading = {
        date: targetDate,
        transitPositions,
        natalPositions,
        ascendant, mc,
        transitAspects: transitAspects.slice(0, 6),
        reading: parsed,
      };
      cache.set(cacheKey, reading);
    }

    const r = reading.reading || {};
    const fortune = r.fortune || '';
    const horoscope = r.horoscope || '';
    const push = r.push || '';
    const aspectLines = (reading.transitAspects || []).slice(0, 5).map(a =>
      `行运${a.transitBody}(${a.transitSign}) ${a.aspect} 本命${a.natalBody}(${a.natalSign}) 强度${a.score}`
    ).join('；');
    const historyStr = Array.isArray(historyTitles) && historyTitles.length
      ? historyTitles.join('；')
      : '（无）';

    const sys = `你是一个小红书爆款标题专家。根据用户星座当天完整的日签内容，生成一条口语化、有冲突感、让人想点开的小红书标题。`;
    const usr = `星座日签内容：
【今日运势】${fortune}
【核心解读】${horoscope}
【金句】${push}
【行运相位】${aspectLines}

近7天已用标题（生成时必须避开，不能重复）：
${historyStr}

请只输出一条标题（18字以内，不要任何解释、不要带引号、不要带星座名、不要以"行运"或"合相"开头）：
要求：
1. 口语化，像朋友对你说的一句话，有冲突感或行动指令，让人想点开
2. 必须贴合今天的具体内容（结合上面的运势/星象），不能是放之四海皆准的鸡汤
3. 语序通顺自然，禁止病句。尤其注意：行星连接词必须用完整中文语序（"月亮合你的太阳""火星对分你的金星"），禁止省略"的"写成"合你太阳""对分你金星"这种别扭表达
4. 不能和近7天已用标题重复
5. 不要出现"行运""合相""相位"这类占星术语，用普通人能懂的话说`;

    const rawTitle = await callDeepSeek([
      { role: 'system', content: sys },
      { role: 'user', content: usr },
    ], { temperature: 0.8, maxTokens: 100, seed: strHash(`${birthDate}_${targetDate}_title`) });

    const clean = rawTitle.replace(/^["']|["']$/g, '').replace(/[。！!]$/g, '').trim();
    res.json({ title: clean, fortune, horoscope, push });
  } catch (err) {
    console.error('标题生成失败:', err.message);
    res.status(500).json({ error: '标题生成失败: ' + err.message });
  }
});

module.exports = router;
