/**
 * 命盘解读 Prompt 构建器
 * DeepSeek → JSON 格式人格分析报告
 */

function buildNatalPrompt(natalData) {
  const { positions, ascendant, mc, aspects, moonPhase } = natalData;

  const planetLines = positions.map(p =>
    `  - ${p.name}: ${p.sign} ${p.degree}°（黄经 ${p.lon.toFixed(1)}°）`
  ).join('\n');

  const aspectLines = aspects.slice(0, 8).map((a, i) =>
    `  ${i+1}. ${a.n1} ${a.aspect} ${a.n2}（强度 ${a.score}）`
  ).join('\n');

  const sun = positions.find(p => p.body === 'Sun');
  const moon = positions.find(p => p.body === 'Moon');
  const mercury = positions.find(p => p.body === 'Mercury');
  const venus = positions.find(p => p.body === 'Venus');
  const mars = positions.find(p => p.body === 'Mars');
  const jupiter = positions.find(p => p.body === 'Jupiter');
  const saturn = positions.find(p => p.body === 'Saturn');
  const uranus = positions.find(p => p.body === 'Uranus');
  const neptune = positions.find(p => p.body === 'Neptune');
  const pluto = positions.find(p => p.body === 'Pluto');

  const systemPrompt = `你是一个冷静、一针见血的性格分析顾问。你的风格：

1. 用第二人称"你"，像朋友凌晨三点跟你说的大实话
2. 每段只说最重要的一件事，一句点破，绝不填充字数
3. 优先指出性格画像中最尖锐的矛盾和张力点——越痛越值得说
4. 避免任何听起来可以套用给任何人的话，必须基于具体数据
5. 可以残忍。说痛处比说好听话更有价值
6. 输出必须使用中文`;

  const userPrompt = `请根据以下个人性格数据，生成一份人格分析报告。

要求返回严格的 JSON 格式，每个 analysis 字段严格限制在 1-2 句：

{
  "sun": {
    "title": "太阳 — 核心自我",
    "position": "${sun.sign} ${sun.degree}°",
    "analysis": "一句点破核心模式",
    "keyword": "三个关键词"
  },
  "moon": {
    "title": "月亮 — 情绪本质",
    "position": "${moon.sign} ${moon.degree}°",
    "analysis": "一句点破情绪模式",
    "keyword": "三个关键词"
  },
  "rising": {
    "title": "上升 — 外在面具",
    "position": "${ascendant.sign} ${ascendant.degree}°",
    "analysis": "一句点破外在表现及与太阳的矛盾",
    "keyword": "三个关键词"
  },
  "mercury": {
    "title": "水星 — 思维与沟通",
    "position": "${mercury.sign} ${mercury.degree}°",
    "analysis": "一句点破思维方式",
    "keyword": "三个关键词"
  },
  "venus": {
    "title": "金星 — 爱与审美",
    "position": "${venus.sign} ${venus.degree}°",
    "analysis": "一句点破爱情模式",
    "keyword": "三个关键词"
  },
  "mars": {
    "title": "火星 — 行动与欲望",
    "position": "${mars.sign} ${mars.degree}°",
    "analysis": "一句点破行动模式",
    "keyword": "三个关键词"
  },
  "jupiter": {
    "title": "木星 — 扩张与幸运",
    "position": "${jupiter.sign} ${jupiter.degree}°",
    "analysis": "一句点破幸运方向",
    "keyword": "三个关键词"
  },
  "saturn": {
    "title": "土星 — 责任与功课",
    "position": "${saturn.sign} ${saturn.degree}°",
    "analysis": "一句点破人生功课",
    "keyword": "三个关键词"
  },
  "uranus": {
    "title": "天王星 — 突变与自由",
    "position": "${uranus.sign} ${uranus.degree}°",
    "analysis": "一句点破反叛领域",
    "keyword": "三个关键词"
  },
  "neptune": {
    "title": "海王星 — 梦幻与灵感",
    "position": "${neptune.sign} ${neptune.degree}°",
    "analysis": "一句点破幻想领域",
    "keyword": "三个关键词"
  },
  "pluto": {
    "title": "冥王星 — 转化与真相",
    "position": "${pluto.sign} ${pluto.degree}°",
    "analysis": "一句点破蜕变力量",
    "keyword": "三个关键词"
  },
  "stellium": {
    "title": "星群聚集",
    "description": "多颗行星集中在同一星座",
    "insight": "一句有冲击力的总结"
  },
  "houses": [
    {"num": 1, "sign": "", "interpretation": "这个宫位配置对你的核心影响，一句点破"}
  ],
  "topAspects": [
    {"pair": "行星A × 行星B", "aspect": "相位类型", "meaning": "一句点破"}
  ],
  "domains": {
    "love": { "title": "爱情", "analysis": "结合性格画像点破你在爱情中的核心模式，一句" },
    "friends": { "title": "友谊", "analysis": "一句点破你的社交模式" },
    "work": { "title": "事业", "analysis": "一句点破你的职业天赋" },
    "family": { "title": "家庭", "analysis": "一句点破你的家庭模式" },
    "growth": { "title": "个人成长", "analysis": "一句点破人生的核心课题" },
    "finance": { "title": "财务", "analysis": "一句点破你的财富模式" },
    "health": { "title": "健康", "analysis": "一句点破你的健康倾向" }
  },
  "advice": {
    "style": "穿搭和颜色建议——结合你性格画像元素偏性（火土风水），给出适合你的颜色、材质、配饰方向。比如火元素重的人适合冷色调中和，水元素重的人适合暖色加持。只说颜色和材质给人的感受和能量效果，语气像造型师，不提购买。一句话有画面感。",
    "behavior": "行为建议——你长期应该注意的行为模式（一句话，直击弱点）",
    "psychology": "心理成长——你容易陷入的思维陷阱及突破方向（一句话）",
    "relationships": "关系建议——你在关系中的模式和建议（一句话）",
    "career": "事业/创造力——你的天赋在工作中的打开方式（一句话）",
    "wellness": "能量管理——你的身体和精力需要什么，包括用什么颜色/材质的随身小物来平衡能量（一句话具体）"
  }
}

命盘数据：
- 太阳：${sun.sign} ${sun.degree}°
- 月亮：${moon.sign} ${moon.degree}°
- 上升：${ascendant.sign} ${ascendant.degree}°
- 中天：${mc.sign} ${mc.degree}°
- 月相：${moonPhase}

行星位置：
${planetLines}

主要相位：
${aspectLines}

宫位分布（每个宫位宫头星座）：
${natalData.houses ? natalData.houses.map(h => `  ${h.cn}：${h.sign} ${h.degree}°`).join('\n') : '  宫位数据不可用'}

请严格使用 JSON 格式输出，不要添加 markdown 代码块标记。`;

  return { system: systemPrompt, user: userPrompt };
}

module.exports = { buildNatalPrompt };
