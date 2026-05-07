const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// 1. PENGATURAN KREDENSIAL DAN ID SHEETS
const KREDENSIAL_BOT = require('./pitpro-mining-099fac71377a.json');
const ID_SPREADSHEET = '1k2hvrh71xRtbV0HfF2AYUCLj0Szy2ip3qViSHnVhxLI';

const auth = new JWT({
    email: KREDENSIAL_BOT.client_email,
    key: KREDENSIAL_BOT.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Folder untuk menyimpan index.html
app.use(express.static('public'));

// =========================================================
// 2. SISTEM DATABASE DARI TAB 'MASTER_UNIT' GOOGLE SHEETS
// =========================================================
let databaseUnit = {}; 

async function muatDataUnit() {
    try {
        const doc = new GoogleSpreadsheet(ID_SPREADSHEET, auth);
        await doc.loadInfo();
        
        // Ambil data dari Tab yang bernama 'MASTER_UNIT'
        const sheetMaster = doc.sheetsByTitle['MASTER_UNIT'];
        const rows = await sheetMaster.getRows();

        databaseUnit = {}; 
        rows.forEach(row => {
            databaseUnit[row.get('BARCODE')] = {
                no_lambung: row.get('NO LAMBUNG'),
                tipe_unit: row.get('TIPE UNIT')
            };
        });

        console.log('✅ Database berhasil disinkronisasi: ' + rows.length + ' unit.');
    } catch (err) {
        console.error('❌ Gagal sinkronisasi data master unit:', err);
    }
}

// Langsung muat data saat server pertama kali dihidupkan
muatDataUnit();


// =========================================================
// 3. LOGIKA WEBSOCKET (KOMUNIKASI DENGAN WEB DAN SHEETS)
// =========================================================
io.on('connection', (socket) => {
    console.log('💻 Halaman Web Operator Terhubung');

    socket.on('inisialisasi_scan', async (data) => {
        
        // Cek data terbaru dari Sheets sebelum memproses
        await muatDataUnit();

        // Cari apakah barcode yang discan ada di dalam database
        const infoUnit = databaseUnit[data.barcode];

        if (infoUnit) {
            const jamSaatIni = new Date().toLocaleTimeString('id-ID');
            
            // Susun data untuk dikirim kembali ke Web dan ke Sheets
            const dataBaru = {
                no_lambung: infoUnit.no_lambung,
                tipe_unit: infoUnit.tipe_unit,
                driver: data.driver, // <-- Nama Driver diambil dari inputan web
                hm: data.hm,
                qty_solar: data.qty,
                jam_pengisian: jamSaatIni,
                status: 'Selesai'
            };

            // Kirim notifikasi sukses ke Web agar muncul di tabel
            socket.emit('update_monitor', dataBaru);

            // Tulis hasil pengisian ke Google Sheets (Tab Utama / Index 0)
            try {
                const doc = new GoogleSpreadsheet(ID_SPREADSHEET, auth);
                await doc.loadInfo();
                const sheetLog = doc.sheetsByIndex[0]; // Tab pertama di file Anda

                await sheetLog.addRow({
                    'KODE UNIT': dataBaru.no_lambung,
                    'MODEL UNIT': dataBaru.tipe_unit,
                    'HM/KM': dataBaru.hm,
                    'QTY SOLAR': dataBaru.qty_solar,
                    'JAM': dataBaru.jam_pengisian,
                    'NAMA DRIVER': dataBaru.driver,
                    'NAMA FUELMAN': "Bot Realtime"
                });
                console.log(`✅ Data ${dataBaru.no_lambung} berhasil disimpan ke Sheets!`);
            } catch (error) {
                console.error('❌ Error menulis ke Google Sheets:', error);
            }

        } else {
            // Jika barcode tidak ada di Tab MASTER_UNIT
            socket.emit('error_scan', 'Peringatan: Barcode tidak dikenali di sistem (Master Unit)!');
        }
    });
});

// Menjalankan Server
server.listen(3000, () => {
    console.log('🚀 Server berjalan di http://localhost:3000');
});