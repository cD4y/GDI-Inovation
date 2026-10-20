<<<<<<< HEAD
# RAISE (Vercel)

Isi folder: index.html (web), api/analyze.js (backend), vercel.json.

Cara deploy
1. Taruh folder ini di repo GitHub, atau jalankan `npx vercel` di dalam folder ini.
2. Di Vercel: Project Settings > Environment Variables, tambahkan ANTHROPIC_API_KEY (buat di console.anthropic.com).
3. Deploy ulang. Tombol "Analisis dengan Claude" muncul otomatis jika key terbaca.

Uji lokal: `npx vercel dev` dengan file .env.local berisi ANTHROPIC_API_KEY.
Jangan commit API key. Pasang batas pengeluaran di console Anthropic.
=======
# RAISE — OpenAI Content Transparency + AI Chat

RAISE sekarang difokuskan pada dua fitur utama:

1. **AI Content Transparency** — menganalisis teks, gambar, dan video dengan OpenAI.
2. **Tanya AI** — chat langsung dengan OpenAI dari dalam RAISE.

Fitur Ethics Audit, Decision Transparency, Privacy Scanner, risk dashboard, dan report lama dihapus dari versi ini.

## AI Content Transparency
- Teks/caption opsional.
- Gambar dianalisis langsung dengan OpenAI Vision.
- Video tidak dikirim sebagai video native; browser mengambil maksimal 6 frame representatif dan mengirim frame tersebut sebagai gambar.
- Hasil klasifikasi: `Kemungkinan AI`, `Kemungkinan asli`, atau `Tidak dapat ditentukan`.
- Menampilkan confidence, indikator, temuan, dan keterbatasan.
- Hasil bersifat probabilistik, bukan bukti forensik 100%.

## Tanya AI
- Percakapan langsung dengan OpenAI Responses API.
- Riwayat percakapan terbaru dikirim untuk menjaga konteks.
- Tombol percakapan baru.
- Pertanyaan cepat.
- Enter untuk mengirim, Shift+Enter untuk baris baru.

## Environment lokal
Buat `.env.local`:

```env
OPENAI_API_KEY=API_KEY_OPENAI_ANDA
OPENAI_MODEL=gpt-6-luna
```

Jangan masukkan API key ke `index.html` atau `js/app.js`.

Jalankan:

```bash
npx vercel dev
```

Buka alamat localhost yang ditampilkan Vercel.

## Vercel
Tambahkan Environment Variables:

- `OPENAI_API_KEY`
- `OPENAI_MODEL` = `gpt-6-luna`

Lalu deploy ulang.
>>>>>>> 90f82de (Initial RAISE project)
