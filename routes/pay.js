/**
 * POST /api/pay/create — 微信支付统一下单
 * POST /api/pay/verify — 验证用户会员状态
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// 微信商户配置（用户填好后我来配）
const WX_CONFIG = {
  appid: process.env.WX_APPID || '',
  mchid: process.env.WX_MCHID || '',
  key: process.env.WX_PAY_KEY || '',
};

// 会员价格（年付）
const MEMBER_PRICE = 99; // 元
const FREE_SLOTS = 1000;

// 模拟计数器（上线后替换成数据库）
const memberCount = { total: 0 };

// 前1000名免费
router.post('/check-free', (req, res) => {
  const remaining = Math.max(0, FREE_SLOTS - memberCount.total);
  res.json({
    isFree: memberCount.total < FREE_SLOTS,
    remaining,
    total: memberCount.total,
    price: MEMBER_PRICE,
  });
});

// 创建支付订单
router.post('/create', async (req, res) => {
  try {
    const { openid } = req.body;
    if (!openid) return res.status(400).json({ error: '缺少用户标识' });

    if (!WX_CONFIG.appid || !WX_CONFIG.mchid || !WX_CONFIG.key) {
      return res.status(400).json({ error: '支付尚未配置，请联系管理员' });
    }

    const outTradeNo = `SL${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const totalFee = memberCount.total < FREE_SLOTS ? 1 : MEMBER_PRICE * 100; // 1分 vs 99元

    // 统一下单参数
    const params = {
      appid: WX_CONFIG.appid,
      mch_id: WX_CONFIG.mchid,
      nonce_str: crypto.randomBytes(16).toString('hex'),
      body: '星链会员年费',
      out_trade_no: outTradeNo,
      total_fee: totalFee,
      spbill_create_ip: req.ip || '127.0.0.1',
      notify_url: `https://${req.hostname}/api/pay/notify`,
      trade_type: 'JSAPI',
      openid,
    };

    // 签名
    const signStr = Object.keys(params)
      .sort()
      .map(k => `${k}=${params[k]}`)
      .join('&') + `&key=${WX_CONFIG.key}`;
    params.sign = crypto.createHash('md5').update(signStr).digest('hex').toUpperCase();

    // 调用微信统一下单
    const xml = buildXML(params);
    const resp = await fetch('https://api.mch.weixin.qq.com/pay/unifiedorder', {
      method: 'POST', body: xml,
      headers: { 'Content-Type': 'text/xml' },
    });
    const result = await parseXML(await resp.text());

    if (result.return_code !== 'SUCCESS' || result.result_code !== 'SUCCESS') {
      return res.status(500).json({ error: result.err_code_des || '下单失败' });
    }

    // 返回小程序调起支付所需的参数
    const prepayId = result.prepay_id;
    const payParams = {
      appId: WX_CONFIG.appid,
      timeStamp: String(Math.floor(Date.now() / 1000)),
      nonceStr: crypto.randomBytes(16).toString('hex'),
      package: `prepay_id=${prepayId}`,
      signType: 'MD5',
    };
    const paySign = Object.keys(payParams)
      .sort()
      .map(k => `${k}=${payParams[k]}`)
      .join('&') + `&key=${WX_CONFIG.key}`;
    payParams.paySign = crypto.createHash('md5').update(paySign).digest('hex').toUpperCase();

    res.json({ payParams, outTradeNo, isFree: totalFee === 1 });
  } catch (err) {
    console.error('支付下单失败:', err.message);
    res.status(500).json({ error: '下单失败' });
  }
});

// 支付结果通知
router.post('/notify', (req, res) => {
  res.send('<xml><return_code><![CDATA[SUCCESS]]></return_code></xml>');
});

// 验证会员状态
router.post('/verify', (req, res) => {
  const { openid } = req.body;
  res.json({ isMember: false, expireDate: null });
});

function buildXML(obj) {
  let xml = '<xml>';
  for (const k of Object.keys(obj)) {
    xml += `<${k}><![CDATA[${obj[k]}]]></${k}>`;
  }
  xml += '</xml>';
  return xml;
}

async function parseXML(xml) {
  const obj = {};
  const reg = /<(\w+)><!\[CDATA\[(.*?)\]\]><\/\1>/g;
  let m;
  while ((m = reg.exec(xml)) !== null) obj[m[1]] = m[2];
  return obj;
}

module.exports = router;
