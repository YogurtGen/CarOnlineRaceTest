# Referensi dan batas pemeriksaan

Tanggal pemeriksaan: 22 Oktober 2026. Brief: pengalaman ala AirConsole yang gratis, tanpa timer sesi aplikasi, kompatibel GitHub Pages, minimal game balapan 3D dengan kamera kejar dan split-screen. Permintaan 3D diperjelas lewat screenshot Burnin' Rubber.

## Observasi

- **OBS-01, browser Opera:** `https://www.airconsole.com/` menampilkan judul yang menjelaskan smartphone sebagai controller. DOM utama yang tersedia sangat terbatas dan memuat iframe. Ini bukan pemeriksaan kode internal game.
- **OBS-02, browser Opera:** `https://www.airconsole.com/games/racing-games` memuat tautan Burnin' Rubber 5 Air, PolyRacer, dan TankBall. Deskripsi Burnin' Rubber menyebut balapan dengan senjata dan smartphone sebagai gamepad.
- **OBS-03, dokumentasi resmi:** `https://www.airconsole.com/games/un-des-meilleurs-jeux-sur-airconsole-gokartgo-air` menjelaskan alur layar utama, kode koneksi, dan HP bergabung melalui browser.
- **OBS-04, screenshot pengguna:** tampilan game yang diinginkan adalah balapan 3D dengan kamera dari belakang mobil dan beberapa viewport. Screenshot digunakan sebagai petunjuk pengalaman, tidak disalin sebagai aset.
- **OBS-05, dokumentasi GitHub:** Pages menyajikan file statis dan tersedia di public repository dengan GitHub Free. Docs: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages .
- **OBS-06, dokumentasi PeerJS:** signaling PeerServer Cloud tersedia gratis; NAT tertentu memerlukan TURN. Sumber: https://peerjs.com/client/faq dan https://peerjs.com/server/cloud .

## Keputusan implementasi

Ini rekonstruksi pengalaman dengan kode orisinal, bukan salinan binari, source, model, atau lisensi game AirConsole. Room code dan HP sebagai controller diturunkan dari alur publik; pilihan Three.js, PeerJS, model/tekstur berlisensi terbuka, tiga lintasan, dan fisika arcade merupakan keputusan implementasi sendiri. Sumber aset yang aktif pada v1.1 dicatat di THIRD_PARTY.md dan assets/asset-manifest.json.

Simulasi otoritatif berjalan di layar host, sedangkan HP hanya mengirim kendali. Dunia divisualisasikan sebagai geometri 3D dengan kamera kejar; fisika kendaraan disederhanakan pada bidang datar. Tidak ada senjata seperti game dalam screenshot pada versi ini.

## Hal yang belum diketahui

- Source internal, protokol privat, physics, aset, dan aturan billing AirConsole tidak dianalisis.
- Tidak ada klaim bahwa perilaku fisika atau kualitas visual identik dengan Burnin' Rubber.
- Tool MCP REA tidak tersedia pada sesi ini. Percobaan `npx rea-agents doctor --client codex --json` gagal karena registry DNS di sandbox, sebelum diagnostik menghasilkan evidence. Tidak ada konfigurasi MCP yang diubah. OBS di atas adalah catatan browser/dokumentasi biasa, **bukan REA Evidence IDs**.
- Dukungan jaringan nyata tetap bergantung browser, NAT, dan layanan signaling. Pemeriksaan peranti fisik dicatat terpisah dalam QA.
