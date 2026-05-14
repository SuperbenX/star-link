/**
 * POST /api/predict/timeline — 未来行运预测时间线
 * 计算未来 N 天的行运-本命相位，聚类成活跃时段
 */
const express = require('express');
const router = express.Router();
const astro = require('../engine/astronomy');
const transit = require('../engine/transit');
const houses = require('../engine/houses');
const cache = require('../services/cache');
const { callDeepSeek, strHash } = require('../services/deepseek');

const Astronomy = require('astronomy-engine');
const OBLIQUITY = 23.4392911;
function norm(d) { return ((d % 360) + 360) % 360; }
function getSign(lon) { return astro.ZODIAC[Math.floor(norm(lon) / 30)].name; }
function getSignDegree(lon) { return Math.floor(norm(lon) % 30); }

function calcAsc(date, lat, lng) {
  const t = Astronomy.MakeTime(date);
  const jd = t.ut;
  const jc = (jd - 2451545.0) / 36525.0;
  let gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * jc * jc - jc * jc * jc / 38710000.0;
  gmst = norm(gmst);
  const lst = norm(gmst + lng);
  const ascLon = Math.atan2(-Math.cos(lst * Math.PI / 180), Math.sin(OBLIQUITY * Math.PI / 180) * Math.tan(lat * Math.PI / 180) + Math.cos(OBLIQUITY * Math.PI / 180) * Math.sin(lst * Math.PI / 180)) * 180 / Math.PI;
  const mcLon = Math.atan2(Math.tan(lst * Math.PI / 180), Math.cos(OBLIQUITY * Math.PI / 180)) * 180 / Math.PI;
  const houseCusps = houses.calcHouses(lst, lat, OBLIQUITY, norm(ascLon), norm(mcLon));
  return { asc: { lon: norm(ascLon), sign: getSign(ascLon), degree: getSignDegree(ascLon) }, mc: { lon: norm(mcLon), sign: getSign(mcLon), degree: getSignDegree(mcLon) }, houses: houses.formatHouses(houseCusps) };
}

router.post('/timeline', async (req, res) => {
  try {
    const { birthDate, birthTime, lat, lng, days: numDays = 30 } = req.body;
    if (!birthDate || lat == null || lng == null) {
      return res.status(400).json({ error: '请提供出生信息' });
    }

    const cacheKey = `timeline_${birthDate}_${birthTime || '12:00'}_${lat}_${lng}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const [h, m] = (birthTime || '12:00').split(':').map(Number);
    const birthUTC = new Date(Date.UTC(
      parseInt(birthDate.slice(0, 4)),
      parseInt(birthDate.slice(5, 7)) - 1,
      parseInt(birthDate.slice(8, 10)),
      h - 8, m, 0
    ));
    const natalPos = astro.getAllPositions(birthUTC);
    const ascInfo = calcAsc(birthUTC, lat, lng);

    const today = new Date();
    today.setHours(12, 0, 0, 0);

    // 逐天计算行运
    const dayScores = [];
    for (let d = 0; d < numDays; d++) {
      const date = new Date(today);
      date.setDate(date.getDate() + d);
      const transitPos = astro.getAllPositions(date);
      const aspects = transit.calcTransitNatal(transitPos, natalPos, { ascendant: ascInfo.asc, mc: ascInfo.mc });
      const top = aspects.slice(0, 5);
      const totalScore = top.reduce((s, a) => s + a.score, 0);
      dayScores.push({
        date: date.toISOString().slice(0, 10),
        score: Math.round(totalScore * 10) / 10,
        aspects: top.slice(0, 3),
      });
    }

    // 聚类：用相对阈值找真正的高强度时段
    const scores = dayScores.map(d => d.score);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const stdDev = Math.sqrt(scores.reduce((sq, s) => sq + (s - mean) ** 2, 0) / scores.length);
    const THRESHOLD = Math.max(mean + stdDev * 0.8, 50);

    const periods = [];
    let current = null;

    for (const day of dayScores) {
      if (day.score >= THRESHOLD) {
        if (!current) {
          current = { start: day.date, end: day.date, peakScore: day.score, days: [day] };
        } else {
          current.end = day.date;
          current.days.push(day);
          if (day.score > current.peakScore) current.peakScore = day.score;
        }
      } else {
        if (current) {
          // 至少连续 2 天活跃才算一个时段
          if (current.days.length >= 2) {
            periods.push(current);
          }
          current = null;
        }
      }
    }
    if (current && current.days.length >= 2) periods.push(current);

    // 合并间隔 <= 5 天的相邻时段
    const merged = [];
    for (const p of periods) {
      if (merged.length > 0) {
        const last = merged[merged.length - 1];
        const gap = (new Date(p.start) - new Date(last.end)) / 86400000;
        if (gap <= 5) {
          last.end = p.end;
          last.days = last.days.concat(p.days);
          last.peakScore = Math.max(last.peakScore, p.peakScore);
          continue;
        }
      }
      merged.push(p);
    }

    // 格式化输出
    const result = merged.map(p => {
      const topGlobal = p.days.reduce((best, d) => {
        const t = d.aspects[0];
        return t && (!best || t.score > best.score) ? t : best;
      }, null);

      const dominant = {};
      for (const d of p.days) {
        for (const a of d.aspects) {
          const key = `${a.transitBody}×${a.natalBody}`;
          dominant[key] = (dominant[key] || 0) + a.score;
        }
      }
      const sortedDom = Object.entries(dominant).sort((a, b) => b[1] - a[1]).slice(0, 3);

      const peakScore = p.peakScore;
      const intensity = peakScore >= 80 ? '高' : peakScore >= 50 ? '中' : '低';

      return {
        start: p.start,
        end: p.end,
        peakScore,
        intensity,
        topAspect: topGlobal ? { transitBody: topGlobal.transitBody, natalBody: topGlobal.natalBody, aspect: topGlobal.aspect, score: topGlobal.score } : null,
        dominantAspects: sortedDom.map(([k, v]) => ({ key: k, score: Math.round(v * 10) / 10 })),
      };
    }).filter(p => p.peakScore >= 50 && p.start !== p.end);

    // LLM 生成各时段领域预测
    let domainPredictions = null;
    if (result.length > 0) {
      const sun = natalPos.find(p => p.body === 'Sun');
      const moon = natalPos.find(p => p.body === 'Moon');
      const periodsDesc = result.map((p, i) =>
        `时段${i+1}：${p.start} 至 ${p.end}（${p.intensity}强度）\n` +
        `核心行运：${p.topAspect ? p.topAspect.transitBody + p.topAspect.aspect + p.topAspect.natalBody : '多重相位活跃'}`
      ).join('\n\n');

      const domainPrompt = `你是一个专业的占星预测师。用户的本命盘信息：
- 太阳：${sun ? sun.sign + sun.degree + '°' : '未知'}
- 月亮：${moon ? moon.sign + moon.degree + '°' : '未知'}

未来90天有${result.length}个重要行运时段：

${periodsDesc}

请为每个时段生成针对以下5个领域的预测和建议：
1. 事业/工作（career）
2. 财务（finance）
3. 感情/关系（love）
4. 健康/能量（health）
5. 心理/成长（growth）

要求：
- 每个领域1-2句话，结合行运星象解释原因
- 包含具体的时间节点（如果有）
- 给出可执行的建议
- 语气冷静、专业，不说套话
- 如果某个领域没有明显影响，写"无明显影响"

返回严格的 JSON 格式（不要 markdown 标记）：
{"periods":[{"start":"日期","domains":{"career":"...","finance":"...","love":"...","health":"...","growth":"..."}}]}`;

      try {
        const raw = await callDeepSeek([
          { role: 'system', content: '你是一个冷静、专业的占星预测师。只输出 JSON，不要多余内容。' },
          { role: 'user', content: domainPrompt },
        ], { temperature: 0.0, maxTokens: 4096, seed: strHash(`predict_${birthDate}_${birthTime || '12:00'}`) });

        const parsed = JSON.parse(raw);
        if (parsed.periods && Array.isArray(parsed.periods)) {
          domainPredictions = parsed.periods;
        }
      } catch (_) {
        // LLM 失败不影响基础数据返回
      }
    }

    // 合并预测
    if (domainPredictions) {
      for (const p of result) {
        const match = domainPredictions.find(dp => dp.start === p.start);
        if (match && match.domains) {
          p.domains = match.domains;
        }
      }
    }

    const output = { periods: result, totalDays: numDays };
    cache.set(cacheKey, output);
    res.json(output);
  } catch (err) {
    console.error('预测时间线失败:', err.message);
    res.status(500).json({ error: '预测时间线失败: ' + err.message });
  }
});

module.exports = router;
