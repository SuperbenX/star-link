/**
 * 天文引擎 — 行星位置计算
 * 基于 astronomy-engine (Swiss Ephemeris 等价)
 */
const Astronomy = require('astronomy-engine');

const OBLIQUITY = 23.4392911;

const PLANETS = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto'];

const PLANET_CN = {
  Sun:'太阳',Moon:'月亮',Mercury:'水星',Venus:'金星',Mars:'火星',
  Jupiter:'木星',Saturn:'土星',Uranus:'天王星',Neptune:'海王星',Pluto:'冥王星',
};

const ZODIAC = [
  {name:'白羊座',min:0,max:30},{name:'金牛座',min:30,max:60},{name:'双子座',min:60,max:90},
  {name:'巨蟹座',min:90,max:120},{name:'狮子座',min:120,max:150},{name:'处女座',min:150,max:180},
  {name:'天秤座',min:180,max:210},{name:'天蝎座',min:210,max:240},{name:'射手座',min:240,max:270},
  {name:'摩羯座',min:270,max:300},{name:'水瓶座',min:300,max:330},{name:'双鱼座',min:330,max:360},
];

function norm(d) { return ((d % 360) + 360) % 360; }

function getSign(lon) {
  const n = norm(lon);
  for (const s of ZODIAC) if (n >= s.min && n < s.max) return s.name;
  return ZODIAC[0].name;
}

function getSignDegree(lon) {
  const n = norm(lon);
  for (const s of ZODIAC) if (n >= s.min && n < s.max) return Math.floor(n - s.min);
  return 0;
}

function equatorialToEcliptic(raHrs, decDeg) {
  const raDeg = raHrs * 15;
  const obr = OBLIQUITY * Math.PI / 180;
  const r = raDeg * Math.PI / 180;
  const d = decDeg * Math.PI / 180;
  const y = Math.sin(r) * Math.cos(obr) + Math.tan(d) * Math.sin(obr);
  return { lon: (Math.atan2(y, Math.cos(r)) * 180 / Math.PI + 360) % 360 };
}

/** 获取所有行星当日的黄经位置 */
function getAllPositions(date) {
  const time = Astronomy.MakeTime(date);
  const obs = new Astronomy.Observer(0, 0, 0);
  const positions = [];

  for (const body of PLANETS) {
    try {
      const eq = Astronomy.Equator(Astronomy.Body[body], time, obs, true, true);
      const ecl = equatorialToEcliptic(eq.ra, eq.dec);
      positions.push({
        body, name: PLANET_CN[body], lon: ecl.lon,
        sign: getSign(ecl.lon), degree: getSignDegree(ecl.lon),
      });
    } catch (_) {}
  }

  positions.sort((a, b) => a.lon - b.lon);
  return positions;
}

/** 获取月相 */
function getMoonPhase(date) {
  const time = Astronomy.MakeTime(date);
  const phase = Astronomy.MoonPhase(time);
  const age = phase * 29.53058867 / 360;
  const names = ['新月','蛾眉月','上弦月','盈凸月','满月','亏凸月','下弦月','残月'];
  let idx = Math.round(age / 3.69) % 8;
  if (age < 1.5 || age > 28) idx = 0;
  return { name: names[idx], age: Math.round(age) };
}

function formatPosition(body, lon) {
  return `${PLANET_CN[body]||body}在${getSign(lon)}${getSignDegree(lon)}°`;
}

module.exports = { getAllPositions, getMoonPhase, getSign, getSignDegree, formatPosition, PLANET_CN, ZODIAC };
