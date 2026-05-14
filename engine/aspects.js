/**
 * 相位计算引擎 — 行星间角度差 → 活跃相位排序
 */
const ASPECTS = [
  { name:'合相', angle:0, orb:8, intensity:5 },
  { name:'对分相', angle:180, orb:8, intensity:4 },
  { name:'三分相', angle:120, orb:6, intensity:3 },
  { name:'四分相', angle:90, orb:6, intensity:3 },
  { name:'六分相', angle:60, orb:4, intensity:2 },
];

const PRIORITY = {
  Sun:10, Moon:9, Mercury:7, Venus:8, Mars:7,
  Jupiter:5, Saturn:5, Uranus:3, Neptune:3, Pluto:2,
};

const ASPECT_EXP = ['融合，无法分开','对立，需要平衡','顺流，不费力','张力，不舒服但必要','机会，伸手就有'];

function norm(d) { return ((d % 360) + 360) % 360; }
function angDist(a, b) { const d = Math.abs(norm(a) - norm(b)); return Math.min(d, 360 - d); }

/**
 * 计算所有活跃相位，按强度降序排列
 * @param {Array} positions - [{ body, name, lon }]
 * @returns {Array} [{ p1, p2, n1, n2, angle, aspect, orb, score, exp }]
 */
function calculate(positions) {
  const aspects = [];

  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const dist = angDist(positions[i].lon, positions[j].lon);

      for (const a of ASPECTS) {
        const orb = Math.abs(dist - a.angle);
        if (orb <= a.orb) {
          const weight = PRIORITY[positions[i].body] + PRIORITY[positions[j].body];
          const penalty = 1 - (orb / a.orb) * 0.4;
          aspects.push({
            p1: positions[i].body, p2: positions[j].body,
            n1: positions[i].name, n2: positions[j].name,
            angle: Math.round(dist),
            aspect: a.name,
            orb: Math.round(orb * 10) / 10,
            score: Math.round(a.intensity * weight * penalty * 10) / 10,
            exp: ASPECT_EXP[ASPECTS.indexOf(a)],
          });
          break;
        }
      }
    }
  }

  aspects.sort((a, b) => b.score - a.score);
  return aspects;
}

module.exports = { calculate };
