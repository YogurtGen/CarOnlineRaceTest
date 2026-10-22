# Couch Rally 3D

Game balapan 3D orisinal untuk main bareng di satu layar. Setiap HP menjadi controller melalui browser. Kamera mengikuti mobil dari belakang, dengan split-screen untuk 2–4 pemain. Maksimal 8 mobil termasuk AI.

Versi **1.1** memakai model GT yang lebih detail, cat metallic/clearcoat, interior dan roda beranimasi, tekstur aspal/beton dari foto, refleksi HDRI, serta lingkungan industri dengan pembatas, garasi, ventilasi dan pipa. Semua aset disertakan lokal dan tetap kompatibel dengan GitHub Pages tanpa build.

Tidak ada akun, langganan, iklan, atau timer sesi di kode aplikasi. Balapan biasa berakhir berdasarkan jumlah lap. Pilih **Free ride** untuk berkendara tanpa batas lap. Main ulang sesuka kamu.

## Pasang gratis di GitHub Pages

1. Gunakan repository **public** `YogurtGen/CarOnlineRaceTest`.
2. Upload **isi folder ini** ke root repository. Pastikan `index.html`, `style.css`, `src/`, `vendor/`, `assets/`, dan `.nojekyll` berada di root, bukan terbungkus folder tambahan. Folder tes dan dokumentasi boleh ikut.
3. Buka **Settings → Pages → Build and deployment**.
4. Pilih **Deploy from a branch**, branch **main**, folder **/(root)**, lalu **Save**.
5. Tunggu deployment GitHub selesai. Target alamatnya adalah `https://yogurtgen.github.io/CarOnlineRaceTest/`.

Tidak perlu npm, build, API key, database, atau server Node di hosting. Semua modul, model, dan library yang diperlukan sudah disertakan. Path relatif mendukung GitHub project Pages di subfolder.

GitHub Pages tersedia gratis untuk repository public, dengan kuota hosting milik GitHub. [Dokumentasi GitHub](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [batas penggunaan](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

## Main

1. Buka website di laptop/PC/TV dengan browser modern dan WebGL aktif.
2. Pilih **Buat room**. Tunggu status server sinyal siap.
3. Scan QR dengan kamera HP atau buka website yang sama di HP dan masukkan kode room.
4. Isi nama, lalu **Sambungkan HP**. Host melihat nama kamu di grid.
5. Pilih lintasan, jumlah lap, dan bot. Tekan **Mulai balapan**.

Gas otomatis aktif. Tekan kiri/kanan untuk berbelok, tahan **Rem** saat tikungan dan **Boost** di jalan lurus. Boost mengisi ulang setelah dipakai. Tombol **Kembali ke lintasan** memindahkan mobil ke checkpoint sah terakhir.

Layar host merender dunia 3D dan mengatur simulasi; HP mengirim input serta menerima posisi/lap/kecepatan. Pemain yang masuk saat balapan berlangsung menunggu balapan berikutnya. Host bisa jeda, kembali ke pit lane, atau balapan lagi.

### Coba tanpa HP

Pilih **Langsung coba pakai keyboard** untuk langsung balapan melawan AI. Di lobby, tombol **+ Pembalap keyboard** bisa dipakai dua kali untuk split-screen di satu komputer.

| Kontrol | Pemain 1 | Pemain 2 |
| --- | --- | --- |
| Belok | ← / → | A / D |
| Rem / mundur | ↓ | S |
| Boost | Spasi | Shift |
| Reset checkpoint | R | R |
| Jeda / lanjut | Escape | Escape |

## Koneksi gratis dan batas praktis

- Antara HP dan host: WebRTC DataChannel memakai [PeerJS](https://peerjs.com/) dan PeerServer Cloud gratis untuk signaling. Tidak ada kunci berbayar.
- Sesudah pairing, input dan status bergerak antarbrowser. Hosting GitHub hanya mengirim file website.
- Layanan signaling gratis adalah layanan eksternal dan dapat gangguan, berubah, atau membatasi pemakaian. Tidak ada jaminan uptime.
- Jaringan dengan symmetric NAT/firewall ketat kadang membutuhkan TURN. Paket ini tidak menyediakan TURN berbayar atau menjanjikan semua kombinasi jaringan bisa terhubung. Coba Wi-Fi rumah yang sama atau hotspot lain jika pairing gagal.
- Untuk tab di browser/perangkat yang sama tersedia fallback BroadcastChannel. Fallback ini **tidak** menghubungkan dua perangkat berbeda.
- Tetap buka layar host dan HP. Aplikasi menjeda balapan ketika tab host disembunyikan. Browser/perangkat dapat menidurkan tab meskipun aplikasi tidak memakai timer sesi.
- Satu room mendukung 4 manusia dengan kamera masing-masing. Jumlah total mobil dibatasi 8. Pengaturan 7 bot otomatis menyesuaikan sisa slot.
- WebGL dan hardware acceleration dibutuhkan di layar host. Aset lebih detail di v1.1 membuat unduhan awal lebih besar; biarkan model dan shader selesai dimuat. Tabrakan memakai proksi arcade sederhana; pemandangan di luar lintasan bersifat dekoratif.

## Jalankan lokal

Untuk uji desktop, buka terminal di folder ini dan jalankan:

```sh
python -m http.server 8080
```

Buka `http://localhost:8080`. Jangan buka `index.html` melalui `file://`, karena browser membatasi pemuatan modul dan model 3D. Untuk bermain dari HP, GitHub Pages HTTPS adalah jalur yang disarankan.

Tes tanpa dependency:

```sh
node --test tests/*.test.mjs
```

Lihat [QA.md](QA.md) untuk pemeriksaan yang benar-benar dijalankan, dan [RESEARCH.md](RESEARCH.md) untuk batas pemeriksaan referensi. Kredit dan lisensi ada di [THIRD_PARTY.md](THIRD_PARTY.md).
