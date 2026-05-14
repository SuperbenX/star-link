/**
 * POST /api/synastry/deepseek — DeepSeek 合盘解读
 * 输入两人出生信息，计算合盘相位并生成 LLM 解读
 */
const express = require('express');
const router = express.Router();
const astro = require('../engine/astronomy');
const houses = require('../engine/houses');
const { callDeepSeek, strHash } = require('../services/deepseek');
const cache = require('../services/cache');

const Astronomy = require('astronomy-engine');
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
  const mcLon = Math.atan2(Math.tan(lst * Math.PI / 180), Math.cos(obr)) * 180 / Math.PI;
  const houseCusps = houses.calcHouses(lst, lat, OBLIQUITY, norm(ascLon), norm(mcLon));
  return { ascLon: norm(ascLon), houses: houses.formatHouses(houseCusps) };
}

// 合盘相位计算（A 行星 vs B 行星）
const ASPECTS = [
  { name: '合相', angle: 0, orb: 8, intensity: 5 },
  { name: '六分相', angle: 60, orb: 4, intensity: 2 },
  { name: '四分相', angle: 90, orb: 6, intensity: 3 },
  { name: '三分相', angle: 120, orb: 6, intensity: 3 },
  { name: '对分相', angle: 180, orb: 8, intensity: 4 },
];
const PRIORITY = { Sun: 10, Moon: 9, Mercury: 7, Venus: 8, Mars: 7, Jupiter: 5, Saturn: 5, Uranus: 3, Neptune: 3, Pluto: 2 };
const RELATION_LABELS = { love: '恋人', friend: '朋友', colleague: '同事/合伙人', family: '家人', ambiguous: '暧昧探索' };
const RELATION_FRAMES = {
  love: '你将这段关系按「恋人」分析。关注情感吸引、化学反应、亲密相容性。解读语气偏向浪漫关系。',
  friend: '你将这段关系按「朋友」分析。关注沟通共鸣、共同兴趣、情感支持、个人成长。降低爱情/性吸引力的权重，聚焦友谊动力。',
  colleague: '你将这段关系按「同事/合伙人」分析。关注工作配合度、决策互补、执行力、职业成长。淡化情感层面，聚焦火星/土星/中天的互动。',
  family: '你将这段关系按「家人」分析。关注安全感、情感羁绊、责任模式、成长底色。用家庭动力学角度解读，强调月亮/四宫/土星的互动。',
  ambiguous: '你将这段关系按「暧昧探索」分析。保留吸引力分析，但侧重「是否适合进一步发展」。给出客观评估，不默认关系走向。'
};
const GENDER_LABELS = { male: '男', female: '女', neutral: '不限' };
const GROUP_LABELS = { friend: '朋友群', work: '工作群', family: '家庭群', interest: '兴趣群' };
const GROUP_FRAMES = {
  friend: '你将这个群组按「朋友群」分析。关注社交氛围、情感支持、共同娱乐、友谊动力。',
  work: '你将这个群组按「工作群」分析。关注协作效率、决策模式、角色分工、目标达成。强化火星/土星/中天的权重，淡化纯社交层面。',
  family: '你将这个群组按「家庭群」分析。关注情感羁绊、安全感模式、代际动力、责任分配。用家庭动力学角度解读。',
  interest: '你将这个群组按「兴趣群」分析。关注共同热情、创造性能量、知识交流、社群氛围。'
};



function calcSynastryAspects(posA, posB) {
  const results = [];
  for (const a of posA) {
    for (const b of posB) {
      const dist = Math.abs(norm(a.lon) - norm(b.lon));
      const d = Math.min(dist, 360 - dist);
      for (const asp of ASPECTS) {
        const orb = Math.abs(d - asp.angle);
        if (orb <= asp.orb) {
          results.push({
            bodyA: a.name, bodyB: b.name, aspect: asp.name,
            orb: Math.round(orb * 10) / 10,
            score: Math.round(asp.intensity * (PRIORITY[a.body] + PRIORITY[b.body]) * (1 - orb / asp.orb * 0.4) * 10) / 10,
          });
          break;
        }
      }
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 12);
}

router.post('/deepseek', async (req, res) => {
  try {
    const { birthDataA, birthDataB, nameA, nameB, relationshipType = 'love', genderA = 'neutral', genderB = 'neutral' } = req.body;
    if (!birthDataA || !birthDataB) {
      return res.status(400).json({ error: '请提供两人的出生信息' });
    }

    const stableKey = o => JSON.stringify(o, Object.keys(o).sort());
    const cacheKey = `synastry_ds_${stableKey(birthDataA)}_${stableKey(birthDataB)}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    // 计算 A 的本命盘
    const [hA, mA] = (birthDataA.birthTime || '12:00').split(':').map(Number);
    const birthA = new Date(Date.UTC(parseInt(birthDataA.birthDate.slice(0, 4)), parseInt(birthDataA.birthDate.slice(5, 7)) - 1, parseInt(birthDataA.birthDate.slice(8, 10)), hA - 8, mA, 0));
    const posA = astro.getAllPositions(birthA);
    const ascA = calcAscendant(birthA, birthDataA.lat, birthDataA.lng);
    const housesA = ascA.houses;

    // 计算 B 的本命盘
    const [hB, mB] = (birthDataB.birthTime || '12:00').split(':').map(Number);
    const birthB = new Date(Date.UTC(parseInt(birthDataB.birthDate.slice(0, 4)), parseInt(birthDataB.birthDate.slice(5, 7)) - 1, parseInt(birthDataB.birthDate.slice(8, 10)), hB - 8, mB, 0));
    const posB = astro.getAllPositions(birthB);
    const ascB = calcAscendant(birthB, birthDataB.lat, birthDataB.lng);
    const housesB = ascB.houses;

    // 合盘相位
    const aspectsAB = calcSynastryAspects(posA, posB);
    const aspectsBA = calcSynastryAspects(posB, posA);

    // 格式化数据用于 prompt
    const fmt = ps => ps.map(p => `  - ${p.name}: ${p.sign} ${p.degree}°`).join('\n');
    const fmtAspects = asp => asp.slice(0, 8).map((a, i) =>
      `  ${i + 1}. ${a.bodyA} ${a.aspect} ${a.bodyB}（强度 ${a.score}）`
    ).join('\n');

    const sunA = posA.find(p => p.body === 'Sun');
    const moonA = posA.find(p => p.body === 'Moon');
    const sunB = posB.find(p => p.body === 'Sun');
    const moonB = posB.find(p => p.body === 'Moon');

    const typeLabel = RELATION_LABELS[relationshipType] || '恋人';
    const genderLabelA = GENDER_LABELS[genderA] || '不限';
    const genderLabelB = GENDER_LABELS[genderB] || '不限';
    const frameNote = RELATION_FRAMES[relationshipType] || RELATION_FRAMES.love;

    const systemPrompt = `你是一个冷静、一针见血的占星师，专门分析两人之间的合盘关系。你的风格：

1. 用第三人称描述两人的互动模式
2. 第一句必须有冲击力——让人截图发给对方那种
3. 基于双方星盘的具体配置，点破他们为什么会有这种化学反应
4. 说真话。指出痛处比说好听话更有价值
5. 全文用中文，别绕弯子

本次分析的关系类型：「${typeLabel}」。${frameNote}`;

    const userPrompt = `请分析以下两人的合盘关系。

要求返回严格的 JSON 格式：

{
  "push": "一句话推送，15字以内，有冲击力",
  "summary": "两人关系的核心本质（3句话内点破）",
  "domains": {
    "emotional": {
      "title": "情感共鸣",
      "analysis": "结合双方月亮和金星的互动分析情感层面的连接（2-3句话）",
      "score": "高/中/低"
    },
    "intellectual": {
      "title": "心智交流",
      "analysis": "结合双方水星和太阳的互动分析沟通和心智层面（2-3句话）",
      "score": "高/中/低"
    },
    "action": {
      "title": "行动节奏",
      "analysis": "结合双方火星和上升的互动分析行动力和生活方式（2-3句话）",
      "score": "高/中/低"
    },
    "growth": {
      "title": "共同成长",
      "analysis": "这段关系带给双方最大的成长课题是什么（2-3句话）",
      "score": "高/中/低"
    },
    "challenge": {
      "title": "需要留意",
      "analysis": "这段关系中最容易产生摩擦的领域（2-3句话）",
      "score": "高/中/低"
    },
    "business": {
      "title": "共事合作",
      "analysis": "结合双方火星、土星和事业宫位的互动，分析他们在工作合作中的默契度、互补性和潜在冲突（2-3句话）",
      "score": "高/中/低"
    }
  },
  "keywords": ["关键词1", "关键词2", "关键词3"],
  "strengths": ["优势1", "优势2", "优势3"],
  "challenges": ["挑战1", "挑战2", "挑战3"],
  "advice": {
    "style": "穿搭风格建议——你们在一起时的形象提示（一句话，有画面感）",
    "behavior": "相处行为建议——你们最需要注意的互动模式（一句话）",
    "psychology": "各自需要觉察的思维陷阱（一句话）",
    "relationships": "关系建议——如何让这段关系更健康、更持久（一句话）",
    "date": "约会建议——适合你们一起做的活动（一句话，有画面感）",
    "wellness": "能量管理——在一起时注意什么（一句话）"
  }
}

${nameA || 'Person A'} 的本命盘：
- 太阳：${sunA.sign} ${sunA.degree}°
- 月亮：${moonA.sign} ${moonA.degree}°
行星：
${fmt(posA)}
宫位分布：
${housesA.map(h => `  ${h.cn}：${h.sign} ${h.degree}°`).join('\n')}

${nameB || 'Person B'} 的本命盘：
- 太阳：${sunB.sign} ${sunB.degree}°
- 月亮：${moonB.sign} ${moonB.degree}°
行星：
${fmt(posB)}
宫位分布：
${housesB.map(h => `  ${h.cn}：${h.sign} ${h.degree}°`).join('\n')}

${nameA || 'A'} 对 ${nameB || 'B'} 的活跃相位：
${fmtAspects(aspectsAB)}

${nameB || 'B'} 对 ${nameA || 'A'} 的活跃相位：
${fmtAspects(aspectsBA)}

请严格使用 JSON 格式输出。不要添加 markdown 代码块标记。`;

    const raw = await callDeepSeek([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { temperature: 0.0, maxTokens: 4096, seed: strHash(`${stableKey(birthDataA)}_${stableKey(birthDataB)}_${relationshipType}`) });

    let reading;
    try { reading = JSON.parse(raw); } catch (_) {
      const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (m) reading = JSON.parse(m[1]);
      else throw new Error('DeepSeek 响应格式错误');
    }

    const result = {
      nameA: nameA || 'Person A',
      nameB: nameB || 'Person B',
      relationshipType: relationshipType || 'love',
      genderA: genderA || 'neutral',
      genderB: genderB || 'neutral',
      reading,
      aspects: aspectsAB.slice(0, 6),
    };

    cache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error('合盘生成失败:', err.message);
    res.status(500).json({ error: '合盘生成失败: ' + err.message });
  }
});

/* ═══ 群组分析 ═══ */
router.post('/group', async (req, res) => {
  try {
    const { members, groupName, groupType = 'friend' } = req.body;
    if (!members || members.length < 2) {
      return res.status(400).json({ error: '请至少选择 2 个成员' });
    }

    // 每个成员的本命盘
    const charts = [];
    for (const m of members) {
      const [h, mm] = (m.birthTime || '12:00').split(':').map(Number);
      const birthUTC = new Date(Date.UTC(
        parseInt(m.birthDate.slice(0, 4)),
        parseInt(m.birthDate.slice(5, 7)) - 1,
        parseInt(m.birthDate.slice(8, 10)),
        h - 8, mm, 0
      ));
      const pos = astro.getAllPositions(birthUTC);
      charts.push({ name: m.name || '未知', positions: pos });
    }

    const fmt = ps => ps.map(p => `  - ${p.name}: ${p.sign} ${p.degree}°`).join('\n');

    // 元素分布统计
    const ELEMENTS = { 白羊:'火', 狮子:'火', 射手:'火', 金牛:'土', 处女:'土', 摩羯:'土', 双子:'风', 天秤:'风', 水瓶:'风', 巨蟹:'水', 天蝎:'水', 双鱼:'水' };
    const elementCount = { 火: 0, 土: 0, 风: 0, 水: 0 };
    const signCounts = {};
    for (const c of charts) {
      for (const p of c.positions) {
        const sign = p.sign.replace('座', '');
        const el = ELEMENTS[sign];
        if (el) elementCount[el]++;
        signCounts[sign] = (signCounts[sign] || 0) + 1;
      }
    }
    const total = elementCount.火 + elementCount.土 + elementCount.风 + elementCount.水;
    const elPct = total > 0
      ? `  火 ${Math.round(elementCount.火/total*100)}% · 土 ${Math.round(elementCount.土/total*100)}% · 风 ${Math.round(elementCount.风/total*100)}% · 水 ${Math.round(elementCount.水/total*100)}%`
      : '';

    const memberCharts = charts.map(c =>
      `${c.name} 的本命盘：\n${fmt(c.positions)}`
    ).join('\n\n');

    const signSummary = Object.entries(signCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([s, n]) => `${s} ×${n}`).join(' · ');

    const groupTypeLabel = GROUP_LABELS[groupType] || '朋友群';
    const groupFrame = GROUP_FRAMES[groupType] || GROUP_FRAMES.friend;

    const systemPrompt = `你是一个冷静、洞察力极强的占星师，专门分析群体星盘互动。你的风格：

1. 分析群组成员之间的能量互动和动态平衡
2. 指出谁在什么位置发挥什么作用
3. 结合具体星盘配置解释为什么群组会有这种氛围
4. 给出的建议要具体、可操作
5. 不讨好、不恐吓——只说观察和洞见
6. 全文用中文

本次分析的群组类型：「${groupTypeLabel}」。${groupFrame}`;

    const userPrompt = `请分析以下群组的星盘配置，生成一份群组动力分析报告。

群组名称：${groupName || '未命名群组'}
成员数量：${members.length} 人

元素分布概况：${elPct}
星座分布 TOP：${signSummary}

成员详细星盘：
${memberCharts}

要求返回严格的 JSON 格式，不要包含任何其他文字：

{
  "push": "一句话群组能量描述（15字以内，有冲击力）",
  "summary": "群组整体能量和氛围的深度描述（3-5句话，结合成员星盘解释为什么会有这种群组动力）",
  "elements": {
    "dominant": "主导元素是什么，占比多少，如何影响群组氛围",
    "missing": "缺失或薄弱元素是什么，需要注意什么",
    "balance": "元素分布是否平衡，对群组的影响（2-3句话）"
  },
  "roles": [
    { "member": "成员名", "role": "在群组中的天然角色", "why": "基于星盘配置的解释（1-2句话）" }
  ],
  "strengths": ["群组最强大的3个优势", "优势2", "优势3"],
  "challenges": ["群组最容易出现的3个问题", "挑战2", "挑战3"],
  "keywords": ["关键词1", "关键词2", "关键词3"],
  "advice": {
    "collaboration": "协作建议——这群人怎么合作最高效，谁适合负责什么角色（2-3句话，给出具体分工和协作方式）",
    "decision": "决策建议——如何避免因星盘配置导致的决策偏见，谁适合最后拍板（2-3句话）",
    "conflict": "冲突处理建议——成员之间最容易因什么起冲突，具体在什么场景下爆发，怎么化解（2-3句话）",
    "growth": "共同成长建议——这个群组可以一起做的成长方向，适合一起尝试什么活动或挑战（2-3句话，有画面感）"
  }
}

  "domains": {
    "emotional": {
      "title": "情感氛围",
      "analysis": "群组整体的情感能量如何，成员之间在情绪上能否互相理解和支持（2-3句话）",
      "score": "高/中/低"
    },
    "intellectual": {
      "title": "沟通效率",
      "analysis": "群组内沟通是否顺畅，谁的表达方式和谁的接收方式最匹配（2-3句话）",
      "score": "高/中/低"
    },
    "action": {
      "title": "行动力",
      "analysis": "群组整体的行动节奏如何，谁负责推进，谁负责稳住（2-3句话）",
      "score": "高/中/低"
    },
    "challenge": {
      "title": "潜在摩擦",
      "analysis": "群组最容易在什么场景下产生内耗或分歧（2-3句话）",
      "score": "高/中/低"
    },
    "business": {
      "title": "合作效能",
      "analysis": "这个群组在工作或项目合作中的整体效能如何，谁适合决策，谁适合执行（2-3句话）",
      "score": "高/中/低"
    }
  },
  "roles": [
    { "member": "成员名", "role": "在群组中的天然角色", "why": "基于星盘配置的解释（1-2句话）" }
  ],
  "strengths": ["群组最强大的3个优势", "优势2", "优势3"],
  "challenges": ["群组最容易出现的3个问题", "挑战2", "挑战3"],
  "keywords": ["关键词1", "关键词2", "关键词3"],
  "advice": {
    "collaboration": "协作建议——这群人怎么合作最高效，谁适合负责什么角色（2-3句话，给出具体分工和协作方式）",
    "decision": "决策建议——如何避免因星盘配置导致的决策偏见，谁适合最后拍板（2-3句话）",
    "conflict": "冲突处理建议——成员之间最容易因什么起冲突，具体在什么场景下爆发，怎么化解（2-3句话）",
    "growth": "共同成长建议——这个群组可以一起做的成长方向，适合一起尝试什么活动或挑战（2-3句话，有画面感）"
  }
}

评分说明：分析应基于每个成员的太阳、月亮、上升、火星、金星等关键行星的位置和互动。`;

    const raw = await callDeepSeek([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { temperature: 0.0, maxTokens: 4096, seed: strHash(`${groupName || 'group'}_${groupType}_${members.length}`) });

    let reading;
    try { reading = JSON.parse(raw); } catch (_) {
      const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (m) reading = JSON.parse(m[1]);
      else throw new Error('DeepSeek 响应格式错误');
    }

    res.json({ groupName: groupName || '未命名群组', memberCount: members.length, reading });
  } catch (err) {
    console.error('群组分析失败:', err.message);
    res.status(500).json({ error: '群组分析失败: ' + err.message });
  }
});

module.exports = router;
