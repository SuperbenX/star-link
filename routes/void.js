/**
 * POST /api/void/ask — AI 问答系统
 * 用户提出关于特定领域的问题，AI 结合用户本命盘给出个性化回答
 */
const express = require('express');
const router = express.Router();
const astro = require('../engine/astronomy');
const houses = require('../engine/houses');
const { callDeepSeek, strHash } = require('../services/deepseek');
const cache = require('../services/cache');

const stableKey = o => JSON.stringify(o, Object.keys(o).sort());

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
const PRESET_QUESTIONS = {
  love: ['我容易吸引什么样的人？','我在关系中最大的模式是什么？','我的真爱会在什么时候出现？','如何判断 ta 是否适合我？','我在爱情中最大的弱点是什么？','前任教会了我什么？','什么样的相处方式最适合我？','我的显化力和吸引力如何？','我这段时间的感情运势如何？','我该如何提升自己的爱情能量？'],
  friends: ['我在友谊中扮演什么角色？','什么样的朋友最适合我？','我的社交模式有什么特点？','我该如何吸引同频的朋友？','旧友和新人哪个更适合现在的我？','我在友谊中需要什么？','如何维护远距离友谊？','我在群体中的位置是什么？','这段时间的社交运势如何？','如何建立更深层的友谊？'],
  work: ['我的职业天赋是什么？','什么样的工作最适合我？','我该如何提升事业运势？','我现在的职业方向对吗？','我在工作中最大的优势是什么？','什么阻碍了我的事业发展？','我适合创业还是打工？','贵人运对我的事业发展有何助力？','这段时间的事业走向如何？','我该如何找到自己的事业使命？'],
  family: ['我的家庭模式对我有什么影响？','我该如何与家人更好地相处？','我的内在安全感来源是什么？','家庭对我的感情模式有什么影响？','我该如何疗愈原生家庭课题？','我在家庭中的角色是什么？','如何建立自己的家庭？','这段时间的家庭能量如何？','什么让我感到真正的安全？','我该如何平衡独立与依赖？'],
  growth: ['我这一生的核心课题是什么？','我该如何突破当前的困境？','我的灵魂在成长什么？','这段经历带给我的意义是什么？','我该放下什么？','我的弱点中有哪些隐藏的力量？','我如何才能更爱自己？','宇宙在通过什么方式提醒我？','这段时间的成长机会在哪里？','我该如何活出最高的自我版本？'],
  finance: ['我与金钱的关系是什么？','我的财运趋势如何？','我该如何提升财富能量？','什么限制了我的财务增长？','我值得拥有财富吗？','天生的财富天赋对我的帮助？','这段时间的财务状况如何？','如何平衡赚钱和享受生活？','什么样的理财方式适合我？','我该如何破除贫穷思维？'],
  health: ['我的身体能量特点是什么？','我需要留意哪些健康领域？','如何通过身体觉察成长？','我的身体在说什么？','什么活动对我的能量最有滋养？','情绪如何影响我的身体？','我该如何建立健康的节奏？','休息对我意味着什么？','这段时间的身体能量如何？','我该如何倾听身体的需求？'],
};
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

    const isPreset = PRESET_QUESTIONS[domain] && PRESET_QUESTIONS[domain].includes(question);
    const cacheKey = `void_${stableKey(birthData)}_${domain}_${strHash(question)}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

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

    const temp = isPreset ? 0.0 : 0.3;
    const seed = isPreset
      ? strHash(`${domain}_${stableKey(birthData)}`)
      : strHash(`${question}_${stableKey(birthData)}`);

    const answer = await callDeepSeek([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { temperature: temp, maxTokens: 2048, seed });

    const result = { answer: answer.trim(), domain, question };
    cache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error('AI问答失败:', err.message);
    res.status(500).json({ error: 'AI问答失败: ' + err.message });
  }
});
module.exports = router;
