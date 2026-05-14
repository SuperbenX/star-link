/**
 * POST /api/void/ask — AI 问答系统
 * 用户提出关于特定领域的问题，AI 结合用户本命盘给出个性化回答
 */
const express = require('express');
const router = express.Router();
const astro = require('../engine/astronomy');
const houses = require('../engine/houses');
const { callDeepSeek } = require('../services/deepseek');

const DOMAIN_CONTEXT = {
  love: '爱情与亲密关系',
  friends: '友谊与社交',
  work: '事业与职业发展',
  family: '家庭与内在安全感',
  growth: '个人成长与人生课题',
  finance: '财务与物质世界',
  health: '健康与身体能量',
};

const ASPECTS = [
  { name: '合相', angle: 0, orb: 8 },
  { name: '六分相', angle: 60, orb: 4 },
  { name: '四分相', angle: 90, orb: 6 },
  { name: '三分相', angle: 120, orb: 6 },
  { name: '对分相', angle: 180, orb: 8 },
];
const PRIORITY = { Sun:10, Moon:9, Mercury:7, Venus:8, Mars:7, Jupiter:5, Saturn:5, Uranus:3, Neptune:3, Pluto:2 };

function norm(d) { return ((d % 360) + 360) % 360; }

function calcTopAspects(positions) {
  const results = [];
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const dist = Math.abs(norm(positions[i].lon) - norm(positions[j].lon));
      const d = Math.min(dist, 360 - dist);
      for (const asp of ASPECTS) {
        const orb = Math.abs(d - asp.angle);
        if (orb <= asp.orb) {
          const w = (PRIORITY[positions[i].body] || 0) + (PRIORITY[positions[j].body] || 0);
          const score = Math.round(asp.orb * 0.25 * w * (1 - orb / asp.orb * 0.4) * 10) / 10;
          results.push({
            name: `${positions[i].name} ${asp.name} ${positions[j].name}`,
            score,
          });
          break;
        }
      }
    }
  }
  return results.sort((a, b) => b.score - a.score).slice(0, 4);
}

function fmtPositions(positions) {
  return positions.map(p => `  - ${p.name}: ${p.sign} ${p.degree}°（黄经 ${Math.round(p.lon)}°）`).join('\n');
}

function fmtAspects(aspects) {
  return aspects.map((a, i) => `  ${i+1}. ${a.name}`).join('\n');
}

router.post('/ask', async (req, res) => {
  try {
    const { question, domain, birthData } = req.body;
    if (!question || !domain || !birthData) {
      return res.status(400).json({ error: '请提供问题、领域和出生信息' });
    }

    const [h, m] = (birthData.birthTime || '12:00').split(':').map(Number);
    const birthUTC = new Date(Date.UTC(
      parseInt(birthData.birthDate.slice(0, 4)),
      parseInt(birthData.birthDate.slice(5, 7)) - 1,
      parseInt(birthData.birthDate.slice(8, 10)),
      h - 8, m, 0
    ));

    const positions = astro.getAllPositions(birthUTC);
    const sun = positions.find(p => p.body === 'Sun');
    const moon = positions.find(p => p.body === 'Moon');
    const aspects = calcTopAspects(positions);
    const { cusps: houseCusps, ramc } = houses.calcHousesFromDate(birthUTC, birthData.lat, birthData.lng);
    const houseList = houses.formatHouses(houseCusps);
    const domainLabel = DOMAIN_CONTEXT[domain] || domain;

    const systemPrompt = `你是一个冷静、一针见血的占星顾问。用户问关于「${domainLabel}」的问题，你要结合本命星盘回答。

风格要求：
1. 用第二人称"你"，第一句直接戳痛点
2. 回答必须结合用户星盘的具体配置（行星、星座、角度、宫位），用数据说话
3. 3-6 句内完成，不填充字数。不做通用套话
4. 结构：先点破核心模式，再展开，最后一句可执行建议
5. 犀利但有善意，不讨好不恐吓
6. 全文用中文`;

    const userPrompt = `用户的本命盘数据：
- 太阳：${sun.sign} ${sun.degree}°
- 月亮：${moon.sign} ${moon.degree}°

所有行星位置：
${fmtPositions(positions)}

关键相位：
${fmtAspects(aspects)}
	宫位分布：
	${houseList.map(h => `${h.cn}：${h.sign} ${h.degree}°`).join('\n')}


领域：${domainLabel}
用户的问题：${question}

请结合以上本命盘配置给出深度回答，直接回答即可，不要加 JSON 标记或引号包裹。`;

    const answer = await callDeepSeek([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { temperature: 0.85, maxTokens: 2048 });

    res.json({ answer: answer.trim(), domain, question });
  } catch (err) {
    console.error('AI问答失败:', err.message);
    res.status(500).json({ error: 'AI问答失败: ' + err.message });
  }
});

module.exports = router;
