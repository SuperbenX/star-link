/**
 * 文案引擎 — Co-Star 风格内容生成
 * MVP 阶段用模板引擎，后续可切换为 LLM API
 */
const planetHuman = {
  Sun:{id:'身份',d:'活力、ego、你想被看见的方式'},Moon:{id:'情绪',d:'安全感、你累了需要什么'},
  Mercury:{id:'思维',d:'沟通、你怎么说话'},Venus:{id:'爱',d:'美感、什么让你愉悦'},
  Mars:{id:'行动力',d:'冲突、欲望、驱动'},Jupiter:{id:'扩张',d:'什么可以大胆'},
  Saturn:{id:'责任',d:'不能逃避的事'},Uranus:{id:'突变',d:'打破常规'},
  Neptune:{id:'梦幻',d:'需要清醒的领域'},Pluto:{id:'真相',d:'不得不面对的东西'},
};
const kwMap = {Sun:'自我',Moon:'情绪',Mercury:'沟通',Venus:'关系',Mars:'行动',Jupiter:'扩展',Saturn:'责任',Uranus:'突破',Neptune:'直觉',Pluto:'转化'};
const moodMap = {合相:'融合',三分相:'顺流',四分相:'张力',对分相:'平衡',六分相:'机会'};

const pushes = {
  合相: (n1,n2) => `"${n1}和${n2}在你体内合体了。今天你藏不住任何东西。"`,
  三分相: () => '"今天的事，不用力也能做成。别搞砸了。"',
  四分相: () => '"你感到的不舒服，不是坏事。是东西在长。"',
  对分相: () => '"你不需要选一边。你只需要知道你在中间。"',
  六分相: () => '"机会不是来了——是经过。伸手还是缩手，选一个。"',
};

function getHoroscope(top) {
  if (!top) return { body:'今天没有显著的相位活动。外部推动力较弱，更多靠你的内在驱动力。', detail:'建议：列一个"今天只做三件事"的清单。注意：没有外力推动的日子，反而最容易看清楚自己。' };
  const h1 = planetHuman[top.p1] || {id:'能量',d:''}, h2 = planetHuman[top.p2] || {id:'能量',d:''};
  const n1 = top.n1, n2 = top.n2;
  let body, detail;
  switch (top.aspect) {
    case '合相':
      body = `${n1}（${h1.id}）和${n2}（${h2.id}）在你的星盘上合相——这两股能量正在你体内融合。你在「${h1.d}」上的变化会直接影响「${h2.d}」。`;
      detail = '建议：留意今天第一次让你感到"不对"的直觉。注意：融合期不适合做重大决定。';
      break;
    case '三分相':
      body = `${n1}（${h1.id}）和${n2}（${h2.id}）正形成三分相——你最近在「${h1.d}」和「${h2.d}」之间找到了自然的平衡。`;
      detail = '建议：趁这股顺流，把拖了很久的一件事做了。注意：顺流不等于躺平。';
      break;
    case '四分相':
      body = `${n1}（${h1.id}）和${n2}（${h2.id}）正在打架——你在「${h1.d}」和「${h2.d}」之间感到拉扯。`;
      detail = '建议：选一边，先行动再调整。注意：原地纠结比选错更消耗。';
      break;
    case '对分相':
      body = `${n1}（${h1.id}）和${n2}（${h2.id}）在对面对你——你不得不在「${h1.d}」和「${h2.d}」之间做选择。`;
      detail = '建议：找一个人把你在想的事情说出来。注意：不要为了"不伤和气"吞下真实感受。';
      break;
    default:
      body = `${n1}（${h1.id}）和${n2}（${h2.id}）给你递了一个机会。它不强迫你，但也不会等你太久。`;
      detail = '建议：今天做一件你一直"想过但没做"的小事。';
  }
  return { body, detail };
}

function generateDaily(top) {
  const h = getHoroscope(top);
  const a = top ? (kwMap[top.p1]||'') : '';
  const b = top ? (kwMap[top.p2]||'') : '';
  const mood = top ? (moodMap[top.aspect]||'·') : '安静';
  return {
    body: h.body, detail: h.detail,
    keyword: [mood, a, b].filter(Boolean).join(' · '),
    push: top ? (pushes[top.aspect] ? pushes[top.aspect](top.n1, top.n2) : '"今天天上发生了一件事。"') : '"今天天上很安静。但你未必是。"',
  };
}

/** 构建 LLM Prompt（后续启用 LLM 时用） */
function buildPrompt(positions, aspects, userName, birthInfo) {
  const now = new Date();
  const posLines = positions.map(p => `  - ${p.name}在${p.sign}${p.degree}°`).join('\n');
  const aspLines = aspects.slice(0, 5).map((a, i) => `  ${i+1}. ${a.n1} ${a.aspect} ${a.n2}（强度 ${a.score}）`).join('\n');
  return `今天日期：${now.toISOString().slice(0,10)}\n用户：${userName||'用户'}\n出生信息：${birthInfo||'未知'}\n今日行星位置：\n${posLines}\n今日活跃相位：\n${aspLines}`;
}

module.exports = { generateDaily, buildPrompt };
