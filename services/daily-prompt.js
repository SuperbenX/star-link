/**
 * 日签 Prompt 构建器
 */

function buildDailyPrompt(transitPositions, natalPositions, aspects, ascendant, mc, moonPhase, targetDate, tomorrowTrend, houses) {
  const transitLines = transitPositions.map(p =>
    `  - ${p.name}: ${p.sign} ${p.degree}°`
  ).join('\n');

  const natalLines = natalPositions.map(p =>
    `  - ${p.name}: ${p.sign} ${p.degree}°`
  ).join('\n');

  const aspectLines = aspects.slice(0, 10).map((a, i) =>
    `  ${i+1}. 行运${a.transitBody} ${a.aspect} 本命${a.natalBody}（强度 ${a.score}）`
  ).join('\n');

  const systemPrompt = `你是一个冷静、一针见血的性格分析顾问。每天为用户生成一份"日签"。

风格：
1. 用第二人称"你"，像朋友早上发来的微信，简短但有力
2. 第一句必须有冲击力——让人截图发给朋友那种
3. 只说今天最重要的 1-2 件事，不列清单
4. 结合具体行星活动解释"为什么今天会有这种感觉"
5. 建议必须具体到"今天"可执行的动作
6. 不讨好、不恐吓。说真话
7. 禁止套用通用话术。必须基于今天具体的行运相位、行星位置、角度数据来写分析
8. 每天的推文必须完全不同角度。前一天写了恋爱能量，今天就写事业成长；前一天写了内心感受，今天就写外部行动。确保用户每天打开都有新鲜感
9. horoscope 字段第一句话要像一个人在对用户说话，而不是在描述星象`;

  const userPrompt = `今天是 ${targetDate}。
月相：${moonPhase}

请根据今日行运与用户本命盘的互动，生成一份简洁的日签。

要求返回严格的 JSON 格式，不要包含任何其他文字：

{
  "push": "今日最打动人的一句话（15字以内，像朋友对你说的一句话，而不是星象描述。每次角度都要不同：今天说事业，明天说情绪，后天说关系，不要重复同一套路）",
  "fortune": "今日运势（120-150字，一段完整流畅的运势分析。基于今天具体的行运相位和本命盘配置，从事业/财运/感情/健康中选2-3个方面展开，每一句都要有信息量，不要空话套话。最后一句落在行动建议上。）",
  "horoscope": "今日核心星象解读（2-3句，第一句就要有冲击力）",
  "tomorrowHook": "一句话明天预告，制造悬念（30字以内）",
  "domains": {
    "love": { "title": "爱情", "analysis": "今天爱情领域的星象影响（2-3句话）", "score": "高/中/低" },
    "friends": { "title": "友谊", "analysis": "今天社交/友谊领域的星象影响（2-3句话）", "score": "高/中/低" },
    "work": { "title": "事业", "analysis": "今天事业/工作领域的星象影响（2-3句话）", "score": "高/中/低" },
    "family": { "title": "家庭", "analysis": "今天家庭领域的星象影响（2-3句话）", "score": "高/中/低" },
    "growth": { "title": "个人成长", "analysis": "今天在个人成长/心灵层面的启示（2-3句话）", "score": "高/中/低" },
    "finance": { "title": "财务", "analysis": "今天财务/物质领域的星象影响（2-3句话）", "score": "高/中/低" },
    "health": { "title": "健康", "analysis": "今天健康/能量领域的星象提示（2-3句话）", "score": "高/中/低" }
  },
  "keywords": ["关键词1", "关键词2", "关键词3"],
  "advice": {
    "style": "穿搭/颜色/材质建议——结合今日星象说今天适合什么颜色和质感的衣物或配饰，让用户感受到你的能量流动。如果今天火元素活跃就提红色/暖色调，水元素活跃就提蓝色/黑色，风元素活跃就提白色/金属色，土元素活跃就提大地色系。只说颜色和材质给人的感受，不要说购买。语气像造型师不是销售。",
    "behavior": "行为建议——今天你应该注意的行为模式（一句话）",
    "psychology": "心理成长——今天容易陷入的思维陷阱（一句话）",
    "relationships": "关系建议——今天在关系中怎么做（一句话）",
    "career": "事业/创造力——今天工作的最佳打开方式（一句话）",
    "wellness": "能量管理——今天身体需要什么，包括佩戴什么材质或颜色的小物来补充能量——只说感受和效果，不说购买（一句话）"
  }
}

今日行运位置：
${transitLines}

你的本命盘：
- 太阳：${natalPositions.find(p=>p.body==='Sun').sign} ${natalPositions.find(p=>p.body==='Sun').degree}°
- 月亮：${natalPositions.find(p=>p.body==='Moon').sign} ${natalPositions.find(p=>p.body==='Moon').degree}°
- 上升：${ascendant.sign} ${ascendant.degree}°
- 中天：${mc.sign} ${mc.degree}°

本命行星：
${natalLines}

行运-本命活跃相位：
${aspectLines}

你的宫位分布（本命盘宫头星座）：
${houses && Array.isArray(houses) ? houses.map(h => `  ${h.cn}：${h.sign} ${h.degree}°`).join('\n') : '  宫位数据不可用'}

明天趋势：
${tomorrowTrend}

请严格使用 JSON 格式输出。不要添加 markdown 代码块标记。`;

  return { system: systemPrompt, user: userPrompt };
}

module.exports = { buildDailyPrompt };
