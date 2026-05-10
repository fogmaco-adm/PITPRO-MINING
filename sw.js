// UBAH VERSI CACHE MENJADI V2 AGAR HP MEMBUANG MEMORI LAMA
const CACHE_NAME = 'pitpro-cache-v6'; 

const urlsToCache = [
    './',
    './index.html',
    './logo.png',         // (Biarkan jika logo ini masih dipakai di dalam web/header)
    './icon-app.png',     // MASUKKAN NAMA GAMBAR ICON BARU ANDA DI SINI
    'https://unpkg.com/html5-qrcode'
];

// Tahap 1: Install & Simpan ke Memori HP
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Membuka cache dan menyimpan aset...');
                return cache.addAll(urlsToCache);
            })
    );
});

// Tahap 2: Gunakan Memori HP jika Internet Mati
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Jika file ada di memori HP (cache), pakai itu!
                if (response) {
                    return response; 
                }
                // Jika tidak ada, coba ambil dari internet
                return fetch(event.request); 
            })
    );
});

// Tahap 3: Hapus Memori Lama jika ada Update Aplikasi
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});