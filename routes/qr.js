/**
 * GET /api/qr — QR 码生成
 */
const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');

router.get('/', async (req, res) => {
  try {
    const url = req.query.url || 'https://xinglian.online';
    const size = parseInt(req.query.size) || 200;
    const png = await QRCode.toBuffer(url, {
      width: size, margin: 1, color: { dark: '#a78bfa', light: '#ffffff' }
    });
    res.set('Content-Type', 'image/png');
    res.send(png);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
