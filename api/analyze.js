// RAISE — Vercel Serverless Function
// OpenAI Responses API. API key hanya berada di server.

const MODEL = process.env.OPENAI_MODEL || 'gpt-6-luna';
const MAX_PROMPT = 16000;
const MAX_CHAT_MESSAGES = 12;
const MAX_CHAT_MESSAGE_CHARS = 5000;
const MAX_MEDIA_PAYLOAD = 3000000;
const MAX_IMAGES = 6;
const MAX_IMAGE_DATA = 550000;
const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 20;
const hits = new Map();

function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > LIMIT;
}

function extractText(data) {
  if (typeof data?.output_text === 'string' && data.output_text) return data.output_text;
  const parts = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('');
}

function fail(res, status, error) {
  return res.status(status).json({error});
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    return res.status(200).json({ok: true, enabled: !!process.env.OPENAI_API_KEY, provider: 'openai', model: MODEL});
  }
  if (req.method !== 'POST') return fail(res, 405, 'Metode tidak didukung');

  const key = process.env.OPENAI_API_KEY;
  if (!key) return fail(res, 503, 'Server belum dikonfigurasi dengan OPENAI_API_KEY');

  const origin = req.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host) return fail(res, 403, 'Origin ditolak');
    } catch (_) { return fail(res, 403, 'Origin ditolak'); }
  }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return fail(res, 429, 'Terlalu banyak permintaan, coba lagi nanti');

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = null; }
  }
  if (!body || !['content','chat'].includes(body.mode)) return fail(res, 400, 'Mode permintaan tidak valid');

  let input;
  let instructions;
  let maxTokens = 1800;

  if (body.mode === 'content') {
    const prompt = body.prompt;
    const images = Array.isArray(body.images) ? body.images : [];
    if (typeof prompt !== 'string' || prompt.length < 20 || prompt.length > MAX_PROMPT) return fail(res, 400, 'Prompt tidak valid atau terlalu panjang');
    if (images.length > MAX_IMAGES) return fail(res, 400, 'Maksimal 6 gambar/frame per analisis');
    const totalMedia = images.reduce((n, x) => n + (typeof x === 'string' ? x.length : 0), 0);
    const badMedia = images.some(x => typeof x !== 'string' || !/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(x) || x.length > MAX_IMAGE_DATA);
    if (totalMedia > MAX_MEDIA_PAYLOAD || badMedia) return fail(res, 400, 'Data gambar terlalu besar atau format tidak didukung');

    const content = [{type: 'input_text', text: prompt}];
    for (const image of images) content.push({type: 'input_image', image_url: image, detail: 'high'});
    input = [{role: 'user', content}];
    instructions = 'Anda adalah analis transparansi konten untuk aplikasi RAISE. Ikuti format JSON yang diminta pengguna. Jangan menambahkan markdown atau teks di luar JSON.';
    maxTokens = 1800;
  } else {
    const messages = Array.isArray(body.messages) ? body.messages.slice(-MAX_CHAT_MESSAGES) : [];
    if (!messages.length) return fail(res, 400, 'Pesan chat kosong');
    if (messages.some(m => !m || !['user','assistant'].includes(m.role) || typeof m.content !== 'string' || !m.content.trim() || m.content.length > MAX_CHAT_MESSAGE_CHARS)) {
      return fail(res, 400, 'Format pesan chat tidak valid');
    }
    input = messages.map(m => ({role: m.role, content: m.content}));
    instructions = 'Anda adalah AI Assistant untuk RAISE. Jawab dalam bahasa yang digunakan pengguna, utamakan bahasa Indonesia jika pengguna menggunakan bahasa Indonesia. Berikan jawaban yang jelas, membantu, jujur, dan tidak mengarang fakta. Jika informasi bisa berubah atau membutuhkan sumber terbaru, jelaskan keterbatasan pengetahuan Anda dan sarankan verifikasi. Jangan mengaku memiliki akses ke perangkat, akun, atau data pengguna yang tidak diberikan.';
    maxTokens = 2200;
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 55000);

  try {
    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: ac.signal,
      headers: {'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({model: MODEL, instructions, input, max_output_tokens: maxTokens})
    });
    const data = await r.json().catch(() => null);
    if (!r.ok || !data) {
      console.error('OpenAI API error:', r.status, data);
      return fail(res, 502, 'Layanan OpenAI gagal merespons');
    }
    const text = extractText(data);
    if (!text) {
      console.error('OpenAI returned no text:', data);
      return fail(res, 502, 'OpenAI tidak mengembalikan hasil teks');
    }
    return res.status(200).json({text});
  } catch (e) {
    if (e?.name === 'AbortError') return fail(res, 504, 'Permintaan OpenAI melewati batas waktu');
    console.error('OpenAI request error:', e);
    return fail(res, 502, 'Gagal menghubungi OpenAI');
  } finally {
    clearTimeout(timer);
  }
};
