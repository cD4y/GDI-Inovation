const $ = (s) => document.querySelector(s);
const esc = (t = '') => String(t).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

let mediaData = null;
let mediaObjectUrl = null;
let chatHistory = [];
let chatBusy = false;

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('raise-theme', theme);
  $('#themeBtn').textContent = theme === 'light' ? 'Mode gelap' : 'Mode terang';
}

function initTheme() {
  const saved = localStorage.getItem('raise-theme');
  setTheme(saved || 'dark');
}

async function apiRequest(body) {
  const r = await fetch('/api/analyze', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Permintaan gagal');
  return data;
}

function imageToDataURL(file, maxSide = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Gambar tidak dapat dibaca')); };
    img.src = url;
  });
}

function seekVideo(video, time) {
  return new Promise((resolve) => {
    if (time <= 0.05) { video.currentTime = 0; resolve(); return; }
    const done = () => { video.removeEventListener('seeked', done); resolve(); };
    video.addEventListener('seeked', done, {once: true});
    video.currentTime = time;
    setTimeout(() => { video.removeEventListener('seeked', done); resolve(); }, 3500);
  });
}

async function extractVideoFrames(file) {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  const url = URL.createObjectURL(file);
  video.src = url;
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = () => reject(new Error('Video tidak dapat dibaca'));
  });

  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  if (!duration) throw new Error('Durasi video tidak dapat dibaca');
  const count = Math.min(6, Math.max(3, Math.ceil(duration / 8)));
  const frames = [];
  const canvas = document.createElement('canvas');
  const maxSide = 960;
  const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const ctx = canvas.getContext('2d');

  for (let i = 0; i < count; i++) {
    const time = count === 1 ? 0 : Math.min(duration - 0.05, (duration * i) / (count - 1));
    await seekVideo(video, Math.max(0, time));
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    frames.push(canvas.toDataURL('image/jpeg', 0.68));
  }

  URL.revokeObjectURL(url);
  return {frames, duration, width: video.videoWidth, height: video.videoHeight};
}

async function prepareMedia(file) {
  if (!file) return null;
  const type = file.type.toLowerCase();
  if (type.startsWith('image/')) {
    const data = await imageToDataURL(file);
    return {kind: 'image', name: file.name, type, images: [data]};
  }
  if (type.startsWith('video/')) {
    const out = await extractVideoFrames(file);
    return {kind: 'video', name: file.name, type, images: out.frames, duration: out.duration, width: out.width, height: out.height};
  }
  throw new Error('Format file tidak didukung');
}

async function handleMedia(file) {
  if (!file) return;
  $('#c_media_status').textContent = 'Menyiapkan media...';
  $('#contentBtn').disabled = true;
  try {
    mediaData = await prepareMedia(file);
    if (mediaObjectUrl) URL.revokeObjectURL(mediaObjectUrl);
    mediaObjectUrl = URL.createObjectURL(file);
    const isImage = mediaData.kind === 'image';
    $('#c_pv').hidden = !isImage;
    $('#c_vp').hidden = isImage;
    if (isImage) $('#c_pv').src = mediaObjectUrl;
    else $('#c_vp').src = mediaObjectUrl;
    $('#c_media_status').textContent = isImage
      ? `Gambar siap dianalisis: ${file.name}`
      : `Video siap: ${file.name} · ${mediaData.images.length} frame representatif akan dianalisis.`;
  } catch (e) {
    mediaData = null;
    $('#c_media').value = '';
    $('#c_pv').hidden = true;
    $('#c_vp').hidden = true;
    $('#c_media_status').textContent = e.message;
  } finally {
    $('#contentBtn').disabled = false;
  }
}

function clearContent() {
  $('#c_txt').value = '';
  $('#c_media').value = '';
  $('#c_src').checked = false;
  $('#c_dis').checked = false;
  mediaData = null;
  if (mediaObjectUrl) URL.revokeObjectURL(mediaObjectUrl);
  mediaObjectUrl = null;
  $('#c_pv').hidden = true;
  $('#c_vp').hidden = true;
  $('#c_pv').removeAttribute('src');
  $('#c_vp').removeAttribute('src');
  $('#c_media_status').textContent = 'Belum ada media.';
  $('#contentResult').innerHTML = `<div class="empty"><div class="empty-icon">◌</div><strong>Hasil analisis akan muncul di sini.</strong><span>Masukkan teks atau media lalu tekan Analisis dengan OpenAI.</span></div>`;
}

function demoContent() {
  $('#c_txt').value = 'Video ini menampilkan seseorang yang berbicara di depan kamera. Caption menyebutkan bahwa video dibuat menggunakan teknologi AI untuk demonstrasi.';
  $('#c_src').checked = true;
  $('#c_dis').checked = false;
  $('#contentResult').innerHTML = `<div class="demo-note">Contoh sudah diisi. Untuk analisis visual, unggah gambar atau video lalu jalankan analisis.</div>`;
}

function contentPrompt() {
  const text = $('#c_txt').value.trim();
  const sourceKnown = $('#c_src').checked;
  const aiDisclosure = $('#c_dis').checked;
  const media = mediaData;
  return `Anda adalah analis transparansi konten untuk aplikasi RAISE. Analisis materi yang diberikan secara hati-hati dan probabilistik.

Tugas:
1. Tentukan salah satu klasifikasi: "Kemungkinan AI", "Kemungkinan asli", atau "Tidak dapat ditentukan".
2. Berikan confidence 0-100 sebagai tingkat keyakinan terhadap klasifikasi, bukan bukti kepastian.
3. Jelaskan indikator yang terlihat dari teks/gambar/frame video. Perhatikan anatomi, wajah/tangan, teks dan logo, geometri, refleksi, bayangan, pencahayaan, tekstur, pengulangan detail, tepi objek, artefak kompresi/editing, serta konsistensi antar-frame jika video.
4. Bedakan indikasi konten sintetis/manipulasi dari bukti bahwa konten benar-benar dibuat AI.
5. Jangan mengarang metadata, watermark, reverse image search, sumber asli, atau fakta yang tidak tersedia.
6. Berikan keterbatasan analisis dan saran verifikasi.

Konteks teks/caption: ${text || '(tidak ada)'}
Sumber/pembuat diketahui: ${sourceKnown ? 'ya' : 'tidak'}
Ada disclosure penggunaan AI: ${aiDisclosure ? 'ya' : 'tidak'}
Jenis media: ${media ? media.kind : 'teks saja'}
${media?.kind === 'video' ? `Video berdurasi sekitar ${media.duration.toFixed(1)} detik dan dianalisis dari ${media.images.length} frame representatif.` : ''}

Keluarkan JSON VALID saja dengan struktur:
{
  "classification":"Kemungkinan AI|Kemungkinan asli|Tidak dapat ditentukan",
  "confidence":0,
  "summary":"ringkasan 2-3 kalimat",
  "evidence":["bukti 1","bukti 2"],
  "limitations":["keterbatasan 1"],
  "findings":[{"s":"High|Medium|Low","t":"judul","w":"penjelasan","r":"saran"}]
}`;
}

function renderContentResult(raw) {
  let data;
  try {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    data = JSON.parse(cleaned);
  } catch (_) {
    $('#contentResult').innerHTML = `<div class="error-box"><strong>OpenAI mengembalikan format yang tidak terduga.</strong><pre>${esc(raw)}</pre></div>`;
    return;
  }
  const valid = ['Kemungkinan AI','Kemungkinan asli','Tidak dapat ditentukan'];
  const classification = valid.includes(data.classification) ? data.classification : 'Tidak dapat ditentukan';
  const confidence = Math.max(0, Math.min(100, Number(data.confidence) || 0));
  const evidence = Array.isArray(data.evidence) ? data.evidence : [];
  const limitations = Array.isArray(data.limitations) ? data.limitations : [];
  const findings = Array.isArray(data.findings) ? data.findings : [];
  const tone = classification === 'Kemungkinan AI' ? 'warn' : classification === 'Kemungkinan asli' ? 'good' : 'neutral';

  $('#contentResult').innerHTML = `
    <div class="result-title"><span class="label">HASIL OPENAI</span><span class="badge ${tone}">${esc(classification)}</span></div>
    <div class="confidence"><div><strong>${confidence}%</strong><span>confidence</span></div><div class="confidence-track"><i style="width:${confidence}%"></i></div></div>
    <p class="summary">${esc(data.summary || 'Tidak ada ringkasan.')}</p>
    <div class="result-section"><h4>Indikator yang ditemukan</h4>${evidence.length ? `<ul>${evidence.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="muted">Tidak ada indikator spesifik yang diberikan.</p>'}</div>
    ${findings.length ? `<div class="result-section"><h4>Temuan &amp; saran</h4>${findings.map(f => `<div class="finding ${esc(f.s || 'Low')}"><strong>${esc(f.t || 'Temuan')}</strong><span>${esc(f.w || '')}</span><em>→ ${esc(f.r || '')}</em></div>`).join('')}</div>` : ''}
    <div class="result-section"><h4>Keterbatasan</h4>${limitations.length ? `<ul>${limitations.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="muted">Hasil tetap perlu diverifikasi dengan sumber/provenance jika tersedia.</p>'}</div>
    <div class="disclaimer">Confidence menunjukkan keyakinan model terhadap klasifikasi, bukan bukti bahwa konten benar-benar AI atau asli.</div>`;
}

async function analyzeContent() {
  const text = $('#c_txt').value.trim();
  if (!text && !mediaData) {
    $('#contentResult').innerHTML = `<div class="error-box">Masukkan teks/caption atau unggah gambar/video terlebih dahulu.</div>`;
    return;
  }
  $('#contentBtn').disabled = true;
  $('#contentBtn').textContent = 'Menganalisis...';
  $('#contentResult').innerHTML = `<div class="loading"><div class="spinner"></div><strong>OpenAI sedang menganalisis...</strong><span>${mediaData?.kind === 'video' ? 'Memeriksa beberapa frame video.' : 'Menilai konteks dan indikator yang tersedia.'}</span></div>`;
  try {
    const response = await apiRequest({
      mode: 'content',
      prompt: contentPrompt(),
      images: mediaData?.images || []
    });
    renderContentResult(response.text || 'Tidak ada hasil.');
  } catch (e) {
    $('#contentResult').innerHTML = `<div class="error-box"><strong>Analisis gagal.</strong><span>${esc(e.message)}</span><small>Pastikan OPENAI_API_KEY sudah dipasang di environment Vercel atau .env.local.</small></div>`;
  } finally {
    $('#contentBtn').disabled = false;
    $('#contentBtn').textContent = '✨ Analisis dengan OpenAI';
  }
}

function addMessage(role, text, pending = false) {
  const el = document.createElement('div');
  el.className = `msg ${role}${pending ? ' pending' : ''}`;
  el.innerHTML = `<div class="avatar">${role === 'ai' ? '✦' : 'U'}</div><div class="bubble">${pending ? '<span class="typing"><i></i><i></i><i></i></span>' : esc(text).replace(/\n/g, '<br>')}</div>`;
  $('#messages').appendChild(el);
  $('#messages').scrollTop = $('#messages').scrollHeight;
  return el;
}

function setChatBusy(busy) {
  chatBusy = busy;
  $('#chatSend').disabled = busy;
  $('#chatInput').disabled = busy;
  $('#chatStatus').innerHTML = busy ? '<i class="busy"></i> AI sedang berpikir...' : '<i></i> Siap membantu';
}

async function sendChat(text) {
  if (chatBusy || !text.trim()) return;
  const userText = text.trim();
  $('#chatInput').value = '';
  addMessage('user', userText);
  chatHistory.push({role: 'user', content: userText});
  chatHistory = chatHistory.slice(-12);
  const pending = addMessage('ai', '', true);
  setChatBusy(true);
  try {
    const response = await apiRequest({mode: 'chat', messages: chatHistory});
    const answer = response.text || 'Maaf, AI tidak mengembalikan jawaban.';
    pending.remove();
    addMessage('ai', answer);
    chatHistory.push({role: 'assistant', content: answer});
    chatHistory = chatHistory.slice(-12);
  } catch (e) {
    pending.remove();
    addMessage('ai', `Maaf, terjadi kesalahan: ${e.message}`);
    chatHistory.pop();
  } finally {
    setChatBusy(false);
    $('#chatInput').focus();
  }
}

function newChat() {
  chatHistory = [];
  $('#messages').innerHTML = `<div class="msg ai"><div class="avatar">✦</div><div class="bubble">Percakapan baru dimulai. Ada yang ingin Anda tanyakan? 😊</div></div>`;
  $('#chatInput').value = '';
}

function updateNavMotion(target) {
  const nav = document.querySelector('.nav-links');
  const active = document.querySelector(`.nav-link[data-go="${target}"]`);
  if (!nav || !active) return;
  const navRect = nav.getBoundingClientRect();
  const itemRect = active.getBoundingClientRect();
  nav.style.setProperty('--nav-x', `${itemRect.left - navRect.left}px`);
  nav.style.setProperty('--nav-w', `${itemRect.width}px`);
}

function updateTabMotion(target) {
  const tabs = document.querySelector('.tabs');
  const active = document.querySelector(`.tab[data-tab="${target}"]`);
  if (!tabs || !active) return;
  const tabsRect = tabs.getBoundingClientRect();
  const itemRect = active.getBoundingClientRect();
  tabs.style.setProperty('--tab-x', `${itemRect.left - tabsRect.left}px`);
  tabs.style.setProperty('--tab-w', `${itemRect.width}px`);
}

function switchTab(tab, shouldScroll = true) {
  document.querySelectorAll('.tab').forEach(b => {
    const active = b.dataset.tab === tab;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.nav-link').forEach(b => {
    b.classList.toggle('active', b.dataset.go === tab);
  });
  $('#contentPanel').hidden = tab !== 'content';
  $('#chatPanel').hidden = tab !== 'chat';
  updateNavMotion(tab);
  updateTabMotion(tab);
  if (shouldScroll) document.getElementById('tool').scrollIntoView({behavior: 'smooth', block: 'start'});
  if (tab === 'chat') setTimeout(() => $('#chatInput').focus(), 250);
}

function init() {
  initTheme();
  document.querySelectorAll('[data-tab], [data-go]').forEach(el => el.addEventListener('click', () => switchTab(el.dataset.tab || el.dataset.go)));
  requestAnimationFrame(() => switchTab(document.querySelector('.tab.active')?.dataset.tab || 'content', false));
  window.addEventListener('resize', () => {
    const active = document.querySelector('.tab.active')?.dataset.tab || 'content';
    updateNavMotion(active);
    updateTabMotion(active);
  }, {passive:true});
  $('#themeBtn').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'));
  $('#c_media').addEventListener('change', e => handleMedia(e.target.files[0]));
  $('#dropzone').addEventListener('click', () => $('#c_media').click());
  $('#dropzone').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') $('#c_media').click(); });
  ['dragenter','dragover'].forEach(type => $('#dropzone').addEventListener(type, e => {e.preventDefault(); $('#dropzone').classList.add('drag');}));
  ['dragleave','drop'].forEach(type => $('#dropzone').addEventListener(type, e => {e.preventDefault(); $('#dropzone').classList.remove('drag');}));
  $('#dropzone').addEventListener('drop', e => handleMedia(e.dataTransfer.files[0]));
  $('#contentBtn').addEventListener('click', analyzeContent);
  $('#contentDemo').addEventListener('click', demoContent);
  $('#contentClear').addEventListener('click', clearContent);
  $('#chatClear').addEventListener('click', newChat);
  document.querySelectorAll('[data-suggest]').forEach(b => b.addEventListener('click', () => sendChat(b.dataset.suggest)));
  $('#chatForm').addEventListener('submit', e => {e.preventDefault(); sendChat($('#chatInput').value);});
  $('#chatInput').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#chatForm').requestSubmit(); } });
}

document.addEventListener('DOMContentLoaded', init);
