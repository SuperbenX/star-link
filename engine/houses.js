/**
 * Placidus 宫位计算引擎
 * Munkasey 迭代算法，从 RAMC、纬度、黄赤交角计算 12 宫宫头
 */
const astro = require('./astronomy');

function norm(d) { return ((d % 360) + 360) % 360; }

function calcHouses(ramcDeg, latDeg, oblDeg, ascDeg, mcDeg) {
  const e = oblDeg * Math.PI / 180;
  const f = latDeg * Math.PI / 180;
  const ramc = ramcDeg * Math.PI / 180;

  // MC / ASC — 外部提供则使用，否则重新计算
  const mc = mcDeg != null ? mcDeg * Math.PI / 180 : Math.atan2(Math.sin(ramc) / Math.cos(e), Math.cos(ramc) / Math.cos(e));
  const asc = ascDeg != null ? ascDeg * Math.PI / 180 : Math.atan2(-Math.cos(ramc), -(Math.tan(f) * Math.sin(e) + Math.sin(ramc) * Math.cos(e)));

  const H = {};
  H[11] = (ramcDeg + 30) * Math.PI / 180;
  H[12] = (ramcDeg + 60) * Math.PI / 180;
  H[2]  = (ramcDeg + 120) * Math.PI / 180;
  H[3]  = (ramcDeg + 150) * Math.PI / 180;

  // F: 半昼/半夜弧比例（1/3 或 2/3）
  const F = { 11: 1/3, 12: 2/3, 2: 2/3, 3: 1/3 };
  const idxs = [11, 12, 2, 3];

  // 初始化 D（赤纬）
  const D = {};
  for (const i of idxs) D[i] = Math.asin(Math.sin(e) * Math.sin(H[i]));

  for (let iter = 0; iter < 3; iter++) {
    for (const i of idxs) {
      const A = F[i] * Math.asin(Math.tan(f) * Math.tan(D[i]));
      const M = Math.atan2(Math.sin(A), Math.cos(H[i]) * Math.tan(D[i]));
      const R = Math.atan2(Math.tan(H[i]) * Math.cos(M), Math.cos(M + e));
      D[i] = Math.asin(Math.sin(e) * Math.sin(R));
      H[i] = R;
    }
  }

  const cusps = new Array(13).fill(0);
  cusps[10] = norm(mc * 180 / Math.PI);
  cusps[1]  = norm(asc * 180 / Math.PI);
  cusps[4]  = norm(cusps[10] + 180);
  cusps[7]  = norm(cusps[1] + 180);

  for (const i of idxs) {
    cusps[i] = norm(H[i] * 180 / Math.PI);
    cusps[i + 6 > 12 ? i - 6 : i + 6] = norm(cusps[i] + 180 > 360 ? cusps[i] - 180 : cusps[i] + 180);
  }

  return cusps;
}

/**
 * 格式化宫位为 [{ num, cn, sign, degree, lon }]
 */
function formatHouses(cusps) {
  const cns = ['','一','二','三','四','五','六','七','八','九','十','十一','十二'];
  const result = [];
  for (let i = 1; i <= 12; i++) {
    const lon = cusps[i];
    result.push({ num: i, cn: cns[i] + '宫', sign: astro.getSign(lon), degree: astro.getSignDegree(lon), lon });
  }
  return result;
}

/**
 * 从日期、纬度、经度直接计算宫位 + 返回 RAMC
 */
function calcHousesFromDate(date, lat, lng) {
  const Astronomy = require('astronomy-engine');
  const t = Astronomy.MakeTime(date);
  const jd = t.ut;
  const jc = (jd - 2451545.0) / 36525.0;
  let gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0)
    + 0.000387933 * jc * jc - jc * jc * jc / 38710000.0;
  gmst = norm(gmst);
  const lst = norm(gmst + lng);
  const OBLIQUITY = 23.4392911;
  return { cusps: calcHouses(lst, lat, OBLIQUITY), ramc: lst };
}

module.exports = { calcHouses, formatHouses, calcHousesFromDate };
