/**
 * Star-Link · 观星者 — 技术演示
 * Star-Link · 观星者 — 天文数据驱动的星盘引擎
 *
 * 架构：astronomy-engine → 坐标转换 → 行星位置 → 相位计算 → 文案生成
 */

const Astronomy = require('astronomy-engine');

// ─── 常量 ───────────────────────────────────────────────────────────────

const OBLIQUITY_J2000 = 23.4392911; // 黄赤交角（度）

// 天体名称（astronomy-engine 内部枚举名 → 中文名）
const PLANET_NAMES = {
  Sun: '太阳', Moon: '月亮', Mercury: '水星', Venus: '金星', Mars: '火星',
  Jupiter: '木星', Saturn: '土星', Uranus: '天王星', Neptune: '海王星', Pluto: '冥王星',
};

// 星座边界（黄经度数）
const ZODIAC_SIGNS = [
  { name: '白羊座', min: 0, max: 30 }, { name: '金牛座', min: 30, max: 60 },
  { name: '双子座', min: 60, max: 90 }, { name: '巨蟹座', min: 90, max: 120 },
  { name: '狮子座', min: 120, max: 150 }, { name: '处女座', min: 150, max: 180 },
  { name: '天秤座', min: 180, max: 210 }, { name: '天蝎座', min: 210, max: 240 },
  { name: '射手座', min: 240, max: 270 }, { name: '摩羯座', min: 270, max: 300 },
  { name: '水瓶座', min: 300, max: 330 }, { name: '双鱼座', min: 330, max: 360 },
];

// 相位定义
const ASPECT_TYPES = [
  { name: '合相', angle: 0, orb: 8, intensity: 5 },
  { name: '对分相', angle: 180, orb: 8, intensity: 4 },
  { name: '三分相', angle: 120, orb: 6, intensity: 3 },
  { name: '四分相', angle: 90, orb: 6, intensity: 3 },
  { name: '六分相', angle: 60, orb: 4, intensity: 2 },
];

// Planet-to-Human 映射（用于文案生成）
const PLANET_TO_HUMAN = {
  Sun: { id: '身份', desc: '活力、ego、今天你想被看见的方式' },
  Moon: { id: '情绪', desc: '安全感、潜意识的反应、你累了需要什么' },
  Mercury: { id: '思维', desc: '沟通、你怎么说话、适合什么交流方式' },
  Venus: { id: '爱', desc: '美感、享受、今天什么会让你感到愉悦' },
  Mars: { id: '行动力', desc: '冲突、欲望、今天你被什么驱动' },
  Jupiter: { id: '扩张', desc: '"更多"，今天什么可以大胆一点' },
  Saturn: { id: '责任', desc: '限制、功课、你今天不能逃避的事' },
  Uranus: { id: '突变', desc: '自由、打破常规' },
  Neptune: { id: '梦幻', desc: '模糊、消融、今天需要保持清醒的领域' },
  Pluto: { id: '真相', desc: '控制、转化、不得不面对的东西' },
};

// Aspect mapping（用于文案生成）
const ASPECT_TO_EXPERIENCE = {
  '合相': { desc: '融合', feel: '两股力量融合，无法分开看待' },
  '三分相': { desc: '顺流', feel: '不费力就有结果' },
  '六分相': { desc: '机会', feel: '需要稍微伸一下手' },
  '四分相': { desc: '张力', feel: '不舒服但必要' },
  '对分相': { desc: '对立', feel: '需要平衡' },
};

// 行星优先级（太阳/月亮/个人行星权重更高）
const PLANET_PRIORITY = {
  Sun: 10, Moon: 9, Mercury: 7, Venus: 8, Mars: 7,
  Jupiter: 5, Saturn: 5, Uranus: 3, Neptune: 3, Pluto: 2,
};

// ─── 工具函数 ───────────────────────────────────────────────────────────

/** 赤道坐标 → 黄道坐标（经纬度） */
function equatorialToEcliptic(raHrs, decDeg, dist) {
  const raDeg = raHrs * 15;
  const oblRad = OBLIQUITY_J2000 * Math.PI / 180;
  const raRad = raDeg * Math.PI / 180;
  const decRad = decDeg * Math.PI / 180;

  const y = Math.sin(raRad) * Math.cos(oblRad) + Math.tan(decRad) * Math.sin(oblRad);
  const lon = Math.atan2(y, Math.cos(raRad));
  const lat = Math.asin(
    Math.sin(decRad) * Math.cos(oblRad) -
    Math.cos(decRad) * Math.sin(oblRad) * Math.sin(raRad)
  );

  return {
    lon: (lon * 180 / Math.PI + 360) % 360,
    lat: lat * 180 / Math.PI,
    dist: dist,
  };
}

/** 获取某天体的黄经（度） */
function getEclipticLongitude(body, date) {
  try {
    const time = Astronomy.MakeTime(date);
    const obs = new Astronomy.Observer(0, 0, 0);
    const eq = Astronomy.Equator(body, time, obs, true, true);
    const ecl = equatorialToEcliptic(eq.ra, eq.dec, eq.dist);
    return ecl.lon;
  } catch (e) {
    return null;
  }
}

/** 角度归一化到 [0, 360) */
function normalizeAngle(deg) {
  return ((deg % 360) + 360) % 360;
}

/** 两点间最小夹角（度） */
function angularDistance(a, b) {
  const diff = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return Math.min(diff, 360 - diff);
}

/** 判断黄经在哪个星座 */
function getZodiacSign(longitude) {
  const norm = normalizeAngle(longitude);
  for (const sign of ZODIAC_SIGNS) {
    if (norm >= sign.min && norm < sign.max) return sign.name;
  }
  return ZODIAC_SIGNS[0].name;
}

/** 获取星座内的度数偏移 */
function getSignDegree(longitude) {
  const norm = normalizeAngle(longitude);
  for (const sign of ZODIAC_SIGNS) {
    if (norm >= sign.min && norm < sign.max) return Math.floor(norm - sign.min);
  }
  return Math.floor(norm - ZODIAC_SIGNS[0].min);
}

/** 格式化位置：eg. "太阳在狮子座 15°" */
function formatPosition(bodyName, longitude) {
  const sign = getZodiacSign(longitude);
  const deg = getSignDegree(longitude);
  return `${PLANET_NAMES[bodyName] || bodyName}在${sign}${deg}°`;
}

// ─── 核心计算引擎 ────────────────────────────────────────────────────────

/** 获取所有行星的黄经位置 */
function getAllPlanetPositions(date) {
  const bodies = Object.keys(PLANET_NAMES);
  const positions = [];

  for (const body of bodies) {
    const lon = getEclipticLongitude(body, date);
    if (lon !== null) {
      positions.push({ body, lon, name: PLANET_NAMES[body] });
    }
  }

  return positions.sort((a, b) => a.lon - b.lon);
}

/** 计算所有行星间的活跃相位 */
function calculateAspects(positions) {
  const aspects = [];

  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const p1 = positions[i];
      const p2 = positions[j];
      const dist = angularDistance(p1.lon, p2.lon);

      for (const aspect of ASPECT_TYPES) {
        const orb = Math.abs(dist - aspect.angle);
        if (orb <= aspect.orb) {
          const intensityWeight = PLANET_PRIORITY[p1.body] + PLANET_PRIORITY[p2.body];
          const orbPenalty = 1 - (orb / aspect.orb) * 0.4; // orb 越小越好，最高 1.0
          const score = Math.round(aspect.intensity * intensityWeight * orbPenalty * 10) / 10;

          aspects.push({
            p1: p1.body, p2: p2.body,
            name1: p1.name, name2: p2.name,
            angle: Math.round(dist),
            aspect: aspect.name,
            orb: Math.round(orb * 10) / 10,
            score: score,
            intensity: aspect.intensity,
            interpretation: ASPECT_TO_EXPERIENCE[aspect.name].desc,
          });
          break;
        }
      }
    }
  }

  return aspects.sort((a, b) => b.score - a.score);
}

/** 获取该日期的月相 */
function getMoonPhase(date) {
  const time = Astronomy.MakeTime(date);
  const phase = Astronomy.MoonPhase(time);
  const age = phase * 29.53058867 / 360; // 月龄（天）

  if (age < 1.5 || age > 28) return { name: '新月', age: Math.round(age) };
  if (age < 7) return { name: '蛾眉月', age: Math.round(age) };
  if (age < 9) return { name: '上弦月', age: Math.round(age) };
  if (age < 14) return { name: '盈凸月', age: Math.round(age) };
  if (age < 16) return { name: '满月', age: Math.round(age) };
  if (age < 22) return { name: '亏凸月', age: Math.round(age) };
  if (age < 24) return { name: '下弦月', age: Math.round(age) };
  return { name: '残月', age: Math.round(age) };
}

// ─── 文案生成引擎 ──────────────────────────────────────────────────────

function getPhaseContent(aspectName, p1, p2) {
  const c = ASPECT_TO_EXPERIENCE[aspectName];
  const h1 = PLANET_TO_HUMAN[p1] || { id: '能量', desc: '未知' };
  const h2 = PLANET_TO_HUMAN[p2] || { id: '能量', desc: '未知' };

  switch (aspectName) {
    case '三分相':
      return `${PLANET_NAMES[p1]}（${h1.id}）和${PLANET_NAMES[p2]}（${h2.id}）正形成三分相——这意味着你最近在「${h1.desc}」和「${h2.desc}」之间找到了自然的平衡。你不需要刻意做什么，事情会自己流向该去的地方。建议：趁这股顺流，把拖了很久的一件事做了。注意：顺流不等于躺平——你仍需在场。`;
    case '四分相':
      return `${PLANET_NAMES[p1]}（${h1.id}）和${PLANET_NAMES[p2]}（${h2.id}）正在打架——四分相意味着你在「${h1.desc}」和「${h2.desc}」之间感到拉扯。这种不舒服是必要的：它逼你看到自己一直在回避的东西。建议：选一边，先行动再调整。注意：原地纠结比选错更消耗。`;
    case '合相':
      return `${PLANET_NAMES[p1]}（${h1.id}）和${PLANET_NAMES[p2]}（${h2.id}）在你的星盘上合相——这两股能量正在你体内融合，无法分开看待。你在「${h1.desc}」上的变化会直接影响「${h2.desc}」。建议：留意今天第一次让你感到"不对"的直觉。注意：融合期不适合做重大决定——等能量分开再回头看。`;
    case '对分相':
      return `${PLANET_NAMES[p1]}（${h1.id}）和${PLANET_NAMES[p2]}（${h2.id}）在对面对你——对分相让你不得不在「${h1.desc}」和「${h2.desc}」之间做选择。没有完美方案，只有此刻更适合的。建议：找一个人把你在想的事情说出来——说着说着答案就会出现。注意：不要为了"不伤和气"吞下自己的真实感受。`;
    case '六分相':
      return `${PLANET_NAMES[p1]}（${h1.id}）和${PLANET_NAMES[p2]}（${h2.id}）给你递了一个机会——六分相意味着如果你愿意伸一下手，机会就在那里。它不强迫你，但也不会等你太久。建议：今天做一件你一直"想过但没做"的小事。注意：机会不会敲门两次——它只敲一次，而且很轻。`;
    default:
      return `今天${PLANET_NAMES[p1]}和${PLANET_NAMES[p2]}之间的能量值得关注。留意它们在你生活中对应的领域——${h1.desc}和${h2.desc}。建议：花五分钟安静下来，问问自己这两个领域最近怎么样。`;
  }
}

function getPushContent(aspectName, p1, p2) {
  const samples = {
    '合相': `"${PLANET_NAMES[p1]}和${PLANET_NAMES[p2]}在你体内合体了。今天你藏不住任何东西。"`,
    '三分相': `"今天的事，不用力也能做成。别搞砸了。"`,
    '四分相': `"你感到的不舒服，不是坏事。是东西在长。"`,
    '对分相': `"你不需要选一边。你只需要知道你在中间。"`,
    '六分相': `"机会不是来了——是经过。伸手还是缩手，选一个。"`,
  };
  return samples[aspectName] || '"今天天上发生了一件事，和你有关。"';
}

function getKeyword(p1, p2, aspectName) {
  const map = {
    'Sun': '自我', 'Moon': '情绪', 'Mercury': '沟通', 'Venus': '关系',
    'Mars': '行动', 'Jupiter': '扩展', 'Saturn': '责任', 'Uranus': '突破',
    'Neptune': '直觉', 'Pluto': '转化',
  };
  const moodMap = {
    '三分相': '顺流 · ', '四分相': '张力 · ', '合相': '融合 · ',
    '对分相': '平衡 · ', '六分相': '机会 · ',
  };
  const a = map[p1] || '';
  const b = map[p2] || '';
  return (moodMap[aspectName] || '· ') + a + ' · ' + b;
}

// ─── Prompt 格式化器 ──────────────────────────────────────────────────

function formatForPrompt(positions, aspects, userName, birthData) {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10);
  const moonPhase = getMoonPhase(date);

  const posLines = positions.map(p =>
    `  - ${formatPosition(p.body, p.lon)}`
  ).join('\n');

  const aspectLines = aspects.slice(0, 5).map((a, i) => {
    const deg = getSignDegree(getEclipticLongitude(a.p1, date) || 0);
    return `  ${i + 1}. ${a.name1}在${getZodiacSign(getEclipticLongitude(a.p1, date) || 0)} ${a.aspect} ${a.name2}在${getZodiacSign(getEclipticLongitude(a.p2, date) || 0)}\n     解读：${a.interpretation}（强度 ${a.score}）`;
  }).join('\n');

  return `
===== 日签 Prompt =====

# Input Data
今天日期：${dateStr}
用户：${userName || '用户'}
出生信息：${birthData || '未知'}
今日行星位置：
${posLines}

今日活跃相位（按强度排序）：
${aspectLines}

当前月相：${moonPhase.name}（月龄 ${moonPhase.age} 天）

===== 推送 Prompt =====

今日最强单相位：${aspects[0] ? aspects[0].aspect + '——' + aspects[0].name1 + '×' + aspects[0].name2 : '无活跃相位'}
`;
}

// ─── 内容生成 ──────────────────────────────────────────────────────────

function generateCoStarContent(positions, aspects, userName) {
  const date = new Date();
  const moonPhase = getMoonPhase(date);
  const top = aspects[0];

  // 没有相位时的备选
  if (!top) {
    return {
      push: '"今天天上很安静。但你未必是。"',
      horoscope: `今天没有显著的相位活动。月亮在${moonPhase.name}阶段。这意味着外部推动力较弱，今天更多是靠你的内在驱动力。建议：列一个"今天只做三件事"的清单。注意：没有外力推动的日子，反而最容易看清楚自己真正想做什么。`,
      synastry: '暂无活跃合盘数据。',
      keyword: '安静 · 内观',
    };
  }

  const push = getPushContent(top.aspect, top.p1, top.p2);
  const horoscope = getPhaseContent(top.aspect, top.p1, top.p2);
  const keyword = getKeyword(top.p1, top.p2, top.aspect);

  // 合盘（使用两个最强的相位）
  const second = aspects[1];
  let synastry = '';
  if (second) {
    const h1 = PLANET_TO_HUMAN[top.p1] || { id: '' };
    const h2 = PLANET_TO_HUMAN[second.p2] || { id: '' };
    synastry = `你的${top.name1}（${h1.id}）在${getZodiacSign(getEclipticLongitude(top.p1, date) || 0)}与${top.name2}形成${top.aspect}。`;
    if (second) {
      const sh = PLANET_TO_HUMAN[second.p1] || { id: '' };
      synastry += `同时，你的${second.name1}（${sh.id}）与${second.name2}形成${second.aspect}。`;
    }
    synastry += `今天的关系动态：你在「${h1.id || ''}」和「${h2.id || ''}」的交叉点上。`;
  } else {
    synastry = getPhaseContent(top.aspect, top.p1, top.p2).slice(0, 60) + '……';
  }

  return { push, horoscope, synastry, keyword };
}

// ─── 显示函数 ──────────────────────────────────────────────────────────

function displayPlanetTable(positions) {
  const sep = '─'.repeat(60);
  console.log(`\n  ${'行星位置表'.padStart(25)}`);
  console.log(`  ${sep}`);
  console.log(`  ${'天体'.padEnd(10)} ${'中文'.padEnd(8)} ${'黄经'.padEnd(8)} ${'星座'.padEnd(8)} ${'度数'}`);
  console.log(`  ${sep}`);
  for (const p of positions) {
    const sign = getZodiacSign(p.lon);
    const deg = getSignDegree(p.lon);
    console.log(`  ${p.body.padEnd(10)} ${p.name.padEnd(8)} ${p.lon.toFixed(2).padEnd(8)} ${sign.padEnd(8)} ${deg}°`);
  }
  console.log(`  ${sep}\n`);
}

function displayAspectTable(aspects) {
  const sep = '═'.repeat(68);
  console.log(`\n  ${'活跃相位（按强度排序）'.padStart(28)}`);
  console.log(`  ${sep}`);
  console.log(`  ${'强度'.padEnd(8)} ${'相位'.padEnd(10)} ${'行星1'.padEnd(8)} ${'行星2'.padEnd(8)} ${'角度'.padEnd(6)} ${'容许度'.padEnd(8)} ${'解读'}`);
  console.log(`  ${sep}`);
  for (const a of aspects.slice(0, 10)) {
    console.log(`  ${String(a.score).padEnd(8)} ${a.aspect.padEnd(10)} ${a.name1.padEnd(8)} ${a.name2.padEnd(8)} ${String(a.angle).padEnd(6)} ${String(a.orb).padEnd(8)} ${a.interpretation}`);
  }
  console.log(`  ${sep}\n`);
}

// ─── 主函数 ────────────────────────────────────────────────────────────

function main() {
  console.log('\n');
  console.log('  ┌──────────────────────────────────────────┐');
  console.log('  │                                          │');
  console.log('  │          观 · 星 · 者                    │');
  console.log('  │       Star-Link                          │');
  console.log('  │                                          │');
  console.log('  │   "天上的事，说给人听。"                  │');
  console.log('  │                                          │');
  console.log('  └──────────────────────────────────────────┘');
  console.log('\n  Star-Link · 观星者 — 演示引擎 v1.0');
  console.log('  ==========================================\n');

  // 日期
  const now = new Date();
  const moonPhase = getMoonPhase(now);
  console.log(`  📍 日期：${now.toISOString().slice(0, 10)}`);
  console.log(`  🌙 月相：${moonPhase.name}（月龄 ${moonPhase.age} 天）\n`);

  // 1. 计算行星位置
  console.log('  ═══ Step 1: 天文计算（astronomy-engine）═══');
  const positions = getAllPlanetPositions(now);
  displayPlanetTable(positions);

  // 2. 计算相位
  console.log('  ═══ Step 2: 相位计算 ═══');
  const aspects = calculateAspects(positions);
  displayAspectTable(aspects);

  // 3. 生成 Co-Star 风格文案
  console.log('  ═══ Step 3: Co-Star 风格文案 ═══');
  const content = generateCoStarContent(positions, aspects, '用户');

  console.log(`  📌 推送通知`);
  console.log(`  ┌─────────────────────────────────────┐`);
  console.log(`  │ 星图                                 │`);
  console.log(`  │                                     │`);
  console.log(`  │  ${content.push.slice(0, 34).padEnd(34)}│`);
  console.log(`  │                                     │`);
  console.log(`  │  现在    关闭                        │`);
  console.log(`  └─────────────────────────────────────┘\n`);

  console.log(`  📖 今日日签`);
  console.log(`  ┌─────────────────────────────────────┐`);
  console.log(`  │   你今天的星图                       │`);
  console.log(`  │   ───────────────                    │`);
  const lines = content.horoscope.split('\n');
  for (const line of lines) {
    const wrapped = line.match(/.{1,34}/g) || [''];
    for (const w of wrapped) {
      console.log(`  │   ${w.padEnd(35)}│`);
    }
  }
  console.log(`  │                                     │`);
  console.log(`  │   ───                               │`);
  console.log(`  │   关键字：${content.keyword.padEnd(20)}│`);
  console.log(`  └─────────────────────────────────────┘\n`);

  // 4. 输出 Prompt（供 LLM 使用）
  console.log('  ═══ Step 4: Prompt 模版输出 ═══');
  const promptOutput = formatForPrompt(positions, aspects, '用户', '太阳狮子 月亮双鱼 上升天秤');
  console.log(promptOutput);

  // 5. 运行说明
  console.log('  ═══ 下一步：接入 LLM ═══');
  console.log(`  将上方 "日签 Prompt" 或 "推送 Prompt" 发送给 Claude/GPT 即可生成最终文案。`);
  console.log(`  每日 00:00 批量预生成 → 缓存 24h → 用户打开时秒开。`);
  console.log(`  1000 DAU 成本估算：¥300-900/月（LLM API 费用）\n`);
}

main();
