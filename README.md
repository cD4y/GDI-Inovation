# RAISE (Vercel)

Isi folder: index.html (web), api/analyze.js (backend), vercel.json.

Cara deploy
1. Taruh folder ini di repo GitHub, atau jalankan `npx vercel` di dalam folder ini.
2. Di Vercel: Project Settings > Environment Variables, tambahkan ANTHROPIC_API_KEY (buat di console.anthropic.com).
3. Deploy ulang. Tombol "Analisis dengan Claude" muncul otomatis jika key terbaca.

Uji lokal: `npx vercel dev` dengan file .env.local berisi ANTHROPIC_API_KEY.
Jangan commit API key. Pasang batas pengeluaran di console Anthropic.
