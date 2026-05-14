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

  const systemPrompt = `你是一个冷静、一针见血的占星解读师。每天为用户生成一份"日签"。

风格：
1. 用第二人称"你"，像朋友早上发来的微信，简短但有力
2. 第一句必须有冲击力——让人截图发给朋友那种
3. 只说今天最重要的 1-2 件事，不列清单
4. 结合具体行星活动解释"为什么今天会有这种感觉"
5. 建议必须具体到"今天"可执行的动作
6. 不讨好、不恐吓。说真话`;

  const userPrompt = `今天是 ${targetDate}。
月相：${moonPhase}

请根据今日行运与用户本命盘的互动，生成一份简洁的日签。

要求返回严格的 JSON 格式，不要包含任何其他文字：

{
  "push": "一句话推送，15字以内，有冲击力",
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
    "style": "穿搭风格建议（一句话，有画面感）",
    "behavior": "行为建议——今天你应该注意的行为模式（一句话）",
    "psychology": "心理成长——今天容易陷入的思维陷阱（一句话）",
    "relationships": "关系建议——今天在关系中怎么做（一句话）",
    "career": "事业/创造力——今天工作的最佳打开方式（一句话）",
    "wellness": "能量管理——今天身体需要什么（一句话）"
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
