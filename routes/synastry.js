/**
 * POST /api/synastry — 合盘计算
 * Body: { nameA, sunA, moonA, nameB, sunB, moonB }
 */
const express = require('express');
const router = express.Router();

const SIGNS = ['白羊','金牛','双子','巨蟹','狮子','处女','天秤','天蝎','射手','摩羯','水瓶','双鱼'];
const LABELS = ['合','','','三合','','六合','对宫','六合','','三合','','合'];
const TEXTS = [
  '同一类人，互相镜映。','能玩到一起，也能聊到一起。','有吸引力但也有不同。',
  '互相尊重又彼此独立。','看到对方就像看到另一个版本。','轻松，不需要解释太多。',
  '吸引力最强，但也最难相处。','互补，你有的他没有。','互相欣赏但不容易靠近。',
  '像老朋友一样自然。','有火花，但不是易燃的那种。','第一眼就认出了对方。',
];

router.post('/', (req, res) => {
  const { nameA, sunA, moonA, nameB, sunB, moonB } = req.body;
  if (!sunA || !sunB) return res.status(400).json({ error: '请提供双方太阳星座' });

  const diff = Math.abs(SIGNS.indexOf(sunA) - SIGNS.indexOf(sunB));
  const relation = diff <= 1 || diff >= 11 ? '热烈相吸' : diff <= 3 || diff >= 9 ? '舒服自在' : diff <= 5 || diff >= 7 ? '需要磨合' : '灵魂感';

  res.json({
    title: `${nameA||'你'} × ${nameB||'Ta'}`, relation,
    sunA, sunB, aspect: LABELS[diff] || '', description: TEXTS[diff] || '',
    moonMatch: moonA === moonB ? '你们的月亮在同一星座——情绪上天然理解对方。' : '你们的月亮在不同星座——需要学习对方的情绪语言。',
    advice: '今晚选一部你们都没看过的老电影，从头看到尾不碰手机。',
  });
});

module.exports = router;
