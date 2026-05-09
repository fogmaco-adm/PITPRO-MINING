const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// Pastikan file ini ikut di-upload ke GitHub Anda nanti!
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

// --- SISTEM ANTREAN MASSAL (MENCEGAH GOOGLE SHEETS CRASH) ---
let antreanPengisian = [];
let sedangMemproses = false;

async function prosesAntrean() {
    if (sedangMemproses || antreanPengisian.length === 0) return;
    sedangMemproses = true;

    const tugas = antreanPengisian.shift(); // Ambil antrean paling depan
    try {
        await tugas(); // Eksekusi pengiriman data
    } catch (error) {
        console.error('❌ Error pada antrean:', error);
    }

    sedangMemproses = false;
    prosesAntrean(); // Lanjut ke antrean berikutnya
}
// -------------------------------------------------------------

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
        console.log('✅ Database Master Unit Siap! (Sistem Antrean Aktif)');
    } catch (err) {
        console.error('❌ Gagal sinkronisasi data master:', err);
    }
}
muatDataUnit();

io.on('connection', (socket) => {
    socket.on('inisialisasi_scan', async (data) => {
        const infoUnit = databaseUnit[data.barcode];

        if (!infoUnit) {
            socket.emit('error_scan', 'Peringatan: Barcode tidak terdaftar di Master Unit!');
            return;
        }

        // 1. TENTUKAN WAKTU & SHIFT
        const sekarang = new Date();
        const jamSaatIni = sekarang.toLocaleTimeString('id-ID'); 
        const jam = sekarang.getHours();
        let namaShift = (jam >= 6 && jam < 18) ? "Shift 1" : "Shift 2";

        let waktuOperasional = new Date(sekarang);
        if (jam >= 0 && jam < 6) { waktuOperasional.setDate(waktuOperasional.getDate() - 1); }
        const tanggalPengisian = waktuOperasional.toLocaleDateString('id-ID');

        // 2. VALIDASI GANJIL/GENAP (KHUSUS DT & HD)
        const noLambung = infoUnit.no_lambung.toUpperCase();
        if (noLambung.includes('DT') || noLambung.includes('HD')) {
            const angkaSaja = noLambung.replace(/\D/g, ''); 
            if (angkaSaja.length > 0) {
                const digitTerakhir = parseInt(angkaSaja.slice(-1)); 
                const isGenap = (digitTerakhir % 2 === 0);

                if (!data.izin_shift) {
                    if (isGenap && namaShift === "Shift 1") {
                        socket.emit('error_scan', `❌ DITOLAK: Unit GENAP (${infoUnit.no_lambung}) hanya boleh isi di Shift 2!\n\nCentang kotak 'Izinkan Bypass' jika ada instruksi khusus.`);
                        return;
                    }
                    if (!isGenap && namaShift === "Shift 2") {
                        socket.emit('error_scan', `❌ DITOLAK: Unit GANJIL (${infoUnit.no_lambung}) hanya boleh isi di Shift 1!\n\nCentang kotak 'Izinkan Bypass' jika ada instruksi khusus.`);
                        return;
                    }
                }
            }
        }

        // 3. AUDIT HM HISTORIS
        if (parseFloat(data.hm) < infoUnit.hm_terakhir) {
            socket.emit('error_scan', `❌ HM MUNDUR! Unit ${infoUnit.no_lambung} terakhir tercatat di HM ${infoUnit.hm_terakhir}. Input ditolak!`);
            return; 
        }

        // 4. SUSUN DATA
        const dataBaru = {
            tanggal: tanggalPengisian,
            shift: namaShift,
            lokasi: data.lokasi,
            no_lambung: infoUnit.no_lambung,
            tipe_unit: infoUnit.tipe_unit,
            driver: data.driver, 
            fuelman: data.fuelman, 
            hm: data.hm,
            qty_solar: data.qty,
            jam_pengisian: jamSaatIni,
            status: data.izin_shift ? 'Selesai (Bypass Shift)' : 'Selesai' 
        };

        // 5. MASUKKAN KE DALAM ANTREAN EKSUSI
        antreanPengisian.push(async () => {
            try {
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
                    'NAMA FUELMAN': dataBaru.fuelman 
                });

                infoUnit.row_reference.set('HM TERAKHIR', dataBaru.hm);
                await infoUnit.row_reference.save();
                infoUnit.hm_terakhir = parseFloat(dataBaru.hm);

                // Kirim notifikasi sukses ke HP Operator
                socket.emit('update_monitor', dataBaru);
                console.log(`✅ Sukses: ${dataBaru.no_lambung} (Antrean Diproses)`);
            } catch (err) {
                console.error('Gagal menulis ke Google Sheets:', err);
                socket.emit('error_scan', 'Gagal menyimpan ke database. Coba lagi.');
            }
        });

        // Panggil mesin antrean untuk mulai bekerja
        prosesAntrean();
    });
});

// Port akan otomatis menyesuaikan dengan server Render.com
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server berjalan di port ${PORT}`);
});