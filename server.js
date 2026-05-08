const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const { exec } = require('child_process'); // <--- Mantra pemanggil browser dipindah ke atas

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
                tipe_unit: row.get('TIPE UNIT'),
                hm_terakhir: parseFloat(row.get('HM TERAKHIR')) || 0,
                row_reference: row 
            };
        });
        console.log('✅ Database Master Unit Siap! (Mode Memori Cepat Aktif)');
    } catch (err) {
        console.error('❌ Gagal sinkronisasi data master:', err);
    }
}
muatDataUnit();

io.on('connection', (socket) => {
    socket.on('inisialisasi_scan', async (data) => {
        const infoUnit = databaseUnit[data.barcode];

        if (infoUnit) {
            try {
                if (parseFloat(data.hm) < infoUnit.hm_terakhir) {
                    socket.emit('error_scan', `❌ HM MUNDUR! Unit ${infoUnit.no_lambung} terakhir tercatat di HM ${infoUnit.hm_terakhir}. Input Anda (${data.hm}) ditolak!`);
                    return; 
                }

                // --- GANTI DENGAN KODE TANGGAL OPERASIONAL INI ---
                const sekarang = new Date();
                const jamSaatIni = sekarang.toLocaleTimeString('id-ID'); 
                const jam = sekarang.getHours();

                // 1. Penentuan Shift Tambang
                // Shift 1: Jam 06:00 pagi s/d 17:59 sore
                // Shift 2: Jam 18:00 sore s/d 05:59 pagi
                let namaShift = (jam >= 6 && jam < 18) ? "Shift 1" : "Shift 2";

                // 2. Penentuan Tanggal Operasional (Production Date)
                let waktuOperasional = new Date(sekarang);
                // Jika pengisian terjadi antara jam 00:00 (tengah malam) sampai 05:59 pagi...
                if (jam >= 0 && jam < 6) {
                    // ...maka paksa tanggalnya mundur 1 hari (H-1)
                    waktuOperasional.setDate(waktuOperasional.getDate() - 1);
                }
                const tanggalPengisian = waktuOperasional.toLocaleDateString('id-ID');
                
                const dataBaru = {
                    tanggal: tanggalPengisian,
                    shift: namaShift,
                    lokasi: data.lokasi,
                    no_lambung: infoUnit.no_lambung,
                    tipe_unit: infoUnit.tipe_unit,
                    driver: data.driver, 
                    hm: data.hm,
                    qty_solar: data.qty,
                    jam_pengisian: jamSaatIni,
                    status: 'Selesai'
                };

                const doc = new GoogleSpreadsheet(ID_SPREADSHEET, auth);
                await doc.loadInfo();
                const sheetLog = doc.sheetsByIndex[0]; 

                await sheetLog.addRow({
                    'TANGGAL': dataBaru.tanggal,
                    'LOKASI': dataBaru.lokasi,
                    'SHIFT': dataBaru.shift,
                    'KODE UNIT': dataBaru.no_lambung,
                    'MODEL UNIT': dataBaru.tipe_unit,
                    'HM/KM': dataBaru.hm,
                    'QTY SOLAR': dataBaru.qty_solar,
                    'JAM': dataBaru.jam_pengisian,
                    'NAMA DRIVER': dataBaru.driver,
                    'NAMA FUELMAN': "Bot Realtime"
                });

                infoUnit.row_reference.set('HM TERAKHIR', dataBaru.hm);
                await infoUnit.row_reference.save();

                infoUnit.hm_terakhir = parseFloat(dataBaru.hm);

                socket.emit('update_monitor', dataBaru);
                console.log(`✅ Sukses: ${dataBaru.no_lambung} mengisi BBM. HM diupdate ke ${dataBaru.hm}!`);

            } catch (error) {
                console.error('❌ Error sistem:', error);
                socket.emit('error_scan', 'Terjadi kesalahan pada koneksi database saat mengirim.');
            }
        } else {
            socket.emit('error_scan', 'Peringatan: Barcode tidak terdaftar di Master Unit!');
        }
    });
});

server.listen(3000, () => {
    console.log('🚀 Server berjalan di http://localhost:3000');
    // --- Membuka browser otomatis setelah server nyala ---
    exec('start http://localhost:3000'); 
});