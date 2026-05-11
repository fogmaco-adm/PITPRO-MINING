// UBAH VERSI CACHE MENJADI V2 AGAR HP MEMBUANG MEMORI LAMA
const CACHE_NAME = 'pitpro-cache-v19'; 

const urlsToCache = [
    './',
    './index.html',
    './logo.png',         // (Biarkan jika logo ini masih dipakai di dalam web/header)
    './icon-app.png',     // MASUKKAN NAMA GAMBAR ICON BARU ANDA DI SINI
    'https://unpkg.com/html5-qrcode'
];

self.addEventListener('fetch', event => {
  // 1. PENGECUALIAN UNTUK GOOGLE SCRIPT & REQUEST SELAIN 'GET' (POST/PUT dll)
  if (event.request.method !== 'GET' || event.request.url.includes('script.google.com')) {
    // Biarkan request lewat langsung ke internet tanpa campur tangan Service Worker
    return; 
  }

  // 2. PENGECUALIAN UNTUK FILE AUDIO EKSTERNAL (BEEP)
  if (event.request.url.includes('soundjay.com')) {
    return; 
  }

  // 3. CACHE STRATEGY UNTUK FILE LAINNYA (HTML, CSS, JS)
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Jika ada di cache, gunakan cache. Jika tidak, ambil dari internet
        return response || fetch(event.request).catch(() => {
            // Jika internet mati dan file tidak ada di cache, tampilkan pesan error ini di console
            console.log('Mode Offline Aktif, resource tidak tersedia: ', event.request.url);
        });
      })
  );
});