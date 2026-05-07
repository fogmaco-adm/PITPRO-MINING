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
app.use(express.static('public'));

// 2. SISTEM DATABASE DARI TAB 'MASTER_UNIT' GOOGLE SHEETS
let databaseUnit = {}; 

async function muatDataUnit() {
    try {
        const doc = new GoogleSpreadsheet(ID_SPREADSHEET, auth);
        await doc.loadInfo();
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
muatDataUnit();

// 3. LOGIKA WEBSOCKET (KOMUNIKASI DENGAN WEB DAN SHEETS)
io.on('connection', (socket) => {
    console.log('💻 Halaman Web Operator Terhubung');

    socket.on('inisialisasi_scan', async (data) => {
        await muatDataUnit();
        const infoUnit = databaseUnit[data.barcode];

        if (infoUnit) {
            // MENDAPATKAN WAKTU AKTUAL
            const sekarang = new Date();
            const tanggalPengisian = sekarang.toLocaleDateString('id-ID'); // Format DD/MM/YYYY
            const jamSaatIni = sekarang.toLocaleTimeString('id-ID'); // Format HH:MM:SS
            
            // LOGIKA PEMBAGIAN SHIFT
            const jam = sekarang.getHours();
            const menit = sekarang.getMinutes();
            const waktuDesimal = jam + (menit / 100); 

            let namaShift = "Shift 2"; // Default
            // Jika waktu antara 05.59 (5.59) sampai 18.00 (18.00)
            if (waktuDesimal >= 5.59 && waktuDesimal <= 18.00) {
                namaShift = "Shift 1";
            }
            
            const dataBaru = {
                tanggal: tanggalPengisian,
                shift: namaShift,
                no_lambung: infoUnit.no_lambung,
                tipe_unit: infoUnit.tipe_unit,
                driver: data.driver, 
                hm: data.hm,
                qty_solar: data.qty,
                jam_pengisian: jamSaatIni,
                status: 'Selesai'
            };

            socket.emit('update_monitor', dataBaru);

            try {
                const doc = new GoogleSpreadsheet(ID_SPREADSHEET, auth);
                await doc.loadInfo();
                const sheetLog = doc.sheetsByIndex[0]; 

                // Menyisipkan Tanggal dan Shift ke Google Sheets
                await sheetLog.addRow({
                    'TANGGAL': dataBaru.tanggal,
                    'SHIFT': dataBaru.shift,
                    'KODE UNIT': dataBaru.no_lambung,
                    'MODEL UNIT': dataBaru.tipe_unit,
                    'HM/KM': dataBaru.hm,
                    'QTY SOLAR': dataBaru.qty_solar,
                    'JAM': dataBaru.jam_pengisian,
                    'NAMA DRIVER': dataBaru.driver,
                    'NAMA FUELMAN': "Bot Realtime"
                });
                console.log(`✅ Data ${dataBaru.no_lambung} berhasil disimpan! (${namaShift})`);
            } catch (error) {
                console.error('❌ Error menulis ke Google Sheets:', error);
            }

        } else {
            socket.emit('error_scan', 'Peringatan: Barcode tidak dikenali di sistem (Master Unit)!');
        }
    });
});

server.listen(3000, () => {
    console.log('🚀 Server berjalan di http://localhost:3000');
});