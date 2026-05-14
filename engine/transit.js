/**
 * 行运-本命相位计算器
 * 对比今天天体位置与出生盘位置，找出活跃相位
 */
const ASPECTS = [
  { name:'合相', angle:0, orb:8, intensity:5 },
  { name:'六分相', angle:60, orb:4, intensity:2 },
  { name:'四分相', angle:90, orb:6, intensity:3 },
  { name:'三分相', angle:120, orb:6, intensity:3 },
  { name:'对分相', angle:180, orb:8, intensity:4 },
];

const PRIORITY = {
  Sun:10, Moon:9, Mercury:7, Venus:8, Mars:7,
  Jupiter:5, Saturn:5, Uranus:3, Neptune:3, Pluto:2,
};

function norm(d) { return ((d % 360) + 360) % 360; }
function angDist(a, b) { const d = Math.abs(norm(a) - norm(b)); return Math.min(d, 360 - d); }

/**
 * 计算今日行运与本命星盘之间的相位
 * @param {Array} transitPositions - [{ body, name, lon, sign, degree }]
 * @param {Array} natalPositions   - [{ body, name, lon, sign, degree }]
 * @param {Object} extra           - { ascendant: { lon }, mc: { lon } }
 * @returns {Array} 按强度降序排列
 */
function calcTransitNatal(transitPositions, natalPositions, extra = {}) {
  const results = [];

  for (const tp of transitPositions) {
    for (const np of natalPositions) {
      const dist = angDist(tp.lon, np.lon);
      for (const a of ASPECTS) {
        const orb = Math.abs(dist - a.angle);
        if (orb <= a.orb) {
          const weight = PRIORITY[tp.body] + PRIORITY[np.body];
          const penalty = 1 - (orb / a.orb) * 0.4;
          results.push({
            type: '行星 × 行星',
            transitBody: tp.name, natalBody: np.name,
            transitSign: tp.sign, natalSign: np.sign,
            aspect: a.name,
            orb: Math.round(orb * 10) / 10,
            score: Math.round(a.intensity * weight * penalty * 10) / 10,
          });
          break;
        }
      }
    }

    if (extra.ascendant) {
      const dist = angDist(tp.lon, extra.ascendant.lon);
      for (const a of ASPECTS) {
        const orb = Math.abs(dist - a.angle);
        if (orb <= a.orb) {
          const weight = PRIORITY[tp.body] + 8;
          const penalty = 1 - (orb / a.orb) * 0.4;
          results.push({
            type: '行星 × 上升', transitBody: tp.name, natalBody: '上升',
            transitSign: tp.sign, natalSign: '—',
            aspect: a.name, orb: Math.round(orb * 10) / 10,
            score: Math.round(a.intensity * weight * penalty * 10) / 10,
          });
          break;
        }
      }
    }

    if (extra.mc) {
      const dist = angDist(tp.lon, extra.mc.lon);
      for (const a of ASPECTS) {
        const orb = Math.abs(dist - a.angle);
        if (orb <= a.orb) {
          const weight = PRIORITY[tp.body] + 6;
          const penalty = 1 - (orb / a.orb) * 0.4;
          results.push({
            type: '行星 × 中天', transitBody: tp.name, natalBody: '中天',
            transitSign: tp.sign, natalSign: '—',
            aspect: a.name, orb: Math.round(orb * 10) / 10,
            score: Math.round(a.intensity * weight * penalty * 10) / 10,
          });
          break;
        }
      }
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

module.exports = { calcTransitNatal };
