const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// ==========================================
// 1. PENGATURAN GOOGLE SHEETS (UBAH BAGIAN INI)
// ==========================================

// Ganti nama file ini dengan nama file JSON Anda yang asli!
const KREDENSIAL_BOT = require('./pitpro-mining-099fac71377a.json'); 

// Ini adalah ID Spreadsheet Anda yang kita ambil dari URL tadi
const ID_SPREADSHEET = '1k2hvrh71xRtbV0HfF2AYUCLj0Szy2ip3qViSHnVhxLI'; 

// ==========================================

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Mengarahkan folder 'public' sebagai tempat file frontend (HTML/JS)
app.use(express.static('public'));

// Simulasi Database Unit berdasarkan Barcode
const databaseUnit = {
    "123456789": { no_lambung: "DT-001", tipe_unit: "Dump Truck", driver: "Budi Santoso" },
    "987654321": { no_lambung: "EX-015", tipe_unit: "Excavator", driver: "Agus Supriyadi" }
};

// Fungsi untuk menghubungkan dan menulis ke Google Sheets
async function tulisKeSheets(dataBaru) {
    try {
        // Otentikasi Bot
        const jwtClient = new JWT({
            email: KREDENSIAL_BOT.client_email,
            key: KREDENSIAL_BOT.private_key,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const doc = new GoogleSpreadsheet(ID_SPREADSHEET, jwtClient);
        await doc.loadInfo(); // Memuat info dokumen
        const sheet = doc.sheetsByIndex[0]; // Memilih tab (sheet) pertama

        // Menambahkan baris baru.
        // PENTING: Nama properti (sebelah kiri titik dua) HARUS SAMA PERSIS 
        // dengan teks Header (Baris 1) yang Anda tulis di Google Sheets!
        await sheet.addRow({
        
            'KODE UNIT': dataBaru.no_lambung,
            'MODEL UNIT': dataBaru.tipe_unit,
            'HM/KM': dataBaru.hm,
            'QTY SOLAR': dataBaru.qty_solar,
            'JAM': dataBaru.jam_pengisian,
            'NAMA DRIVER': dataBaru.driver,
            'NAMA FUELMAN': "Bot Realtime" // Saya isi default karena tidak ada inputannya
        });

        console.log('Data berhasil disimpan ke Google Sheets!');
    } catch (error) {
        console.error('Gagal menulis ke Google Sheets:', error);
    }
}

// Mendengarkan koneksi WebSocket dari frontend
io.on('connection', (socket) => {
    console.log('Dashboard Monitor Terhubung');

    // Menerima data hasil scan barcode dari operator pitstop
    socket.on('inisialisasi_scan', async (data) => {
        const unit = databaseUnit[data.barcode];
        
        if (unit) {
            // Gabungkan data unit dengan data dinamis (Waktu, HM, dll)
            const dataRefueling = {
                no_lambung: unit.no_lambung,
                tipe_unit: unit.tipe_unit,
                driver: unit.driver,
                jam_pengisian: new Date().toLocaleTimeString('id-ID'),
                hm: data.hm,             
                qty_solar: data.qty,     
                status: "Selesai"
            };

            // 1. BROADCAST: Kirim data ke layar monitor web (Realtime)
            io.emit('update_monitor', dataRefueling);

            // 2. SIMPAN: Kirim data ke Google Sheets
            await tulisKeSheets(dataRefueling);

        } else {
            // Kirim pesan error kembali ke operator jika unit tidak terdaftar
            socket.emit('error_scan', 'Barcode tidak dikenali di sistem!');
        }
    });
});

server.listen(3000, () => {
    console.log('Server berjalan di http://localhost:3000');
});