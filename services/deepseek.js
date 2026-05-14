const fs = require('fs');
const path = require('path');

function loadKey() {
  try {
    const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
    for (const line of env.split('\n')) {
      const m = line.match(/^DEEPSEEK_API_KEY=(.+)/);
      if (m) return m[1].trim();
    }
  } catch (_) {}
  return process.env.DEEPSEEK_API_KEY || '';
}

const API_KEY = loadKey();
const BASE_URL = 'https://api.deepseek.com/v1/chat/completions';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function callDeepSeek(messages, options = {}) {
  const { temperature = 0.7, maxTokens = 2048, retries = 2 } = options;

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages,
          temperature,
          max_tokens: maxTokens,
          stream: false,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`DeepSeek API ${res.status}: ${errText}`);
      }

      const data = await res.json();
      return data.choices[0].message.content;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(1500 * (attempt + 1));
    }
  }
  throw lastErr || new Error('DeepSeek API 调用失败');
}

module.exports = { callDeepSeek };
