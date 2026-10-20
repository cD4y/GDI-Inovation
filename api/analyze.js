// Fungsi serverless Vercel: meneruskan prompt RAISE ke Claude API.
// API key hanya ada di server (environment variable), tidak pernah dikirim ke browser.
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const MAX_CHARS = 12000;          // batas panjang input
const WINDOW_MS = 10 * 60 * 1000; // jendela pembatasan
const LIMIT = 10;                 // maks permintaan per IP per jendela
const hits = new Map();           // pembatas sederhana (per instance, bukan jaminan mutlak)

function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > LIMIT;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, enabled: !!process.env.ANTHROPIC_API_KEY });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metode tidak didukung' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: 'Server belum dikonfigurasi' });

  const origin = req.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'Origin ditolak' });
    } catch (e) {
      return res.status(403).json({ error: 'Origin ditolak' });
    }
  }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return res.status(429).json({ error: 'Terlalu banyak permintaan, coba lagi nanti' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const prompt = body && body.prompt;
  if (typeof prompt !== 'string' || prompt.length < 20 || prompt.length > MAX_CHARS) {
    return res.status(400).json({ error: 'Input tidak valid atau terlalu panjang' });
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 55000);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ac.signal,
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 1500, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await r.json().catch(() => null);
    if (!r.ok || !data) return res.status(502).json({ error: 'Layanan AI gagal merespons' });
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(504).json({ error: 'Permintaan melewati batas waktu' });
  } finally {
    clearTimeout(timer);
  }
};
