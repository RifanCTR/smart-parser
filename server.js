const express = require("express");
const path = require("path");
const dotenv = require("dotenv");
const { GoogleGenAI } = require("@google/genai");

// ========================================
// LOAD ENV
// ========================================

dotenv.config({
    path: path.join(__dirname, ".env")
});

// ========================================
// CHECK API KEY
// ========================================

if (!process.env.GEMINI_API_KEY) {
    console.error(
        "[ ERROR ] GEMINI_API_KEY tidak ditemukan di .env"
    );

    process.exit(1);
}

// ========================================
// EXPRESS
// ========================================

const app = express();
const PORT = 3000;

// ========================================
// GEMINI
// ========================================

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

// ========================================
// MIDDLEWARE
// ========================================

app.use(
    express.json({
        limit: "20mb"
    })
);

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);

// ========================================
// GEMINI RETRY
// ========================================

async function generateWithRetry(
    prompt,
    maxRetry = 3
) {
    for (
        let attempt = 1;
        attempt <= maxRetry;
        attempt++
    ) {
        try {
            console.log(
                `[ GEMINI ] Menghubungi Gemini... percobaan ${attempt}/${maxRetry}`
            );

            const response =
                await ai.models.generateContent({
                    model: "gemini-3.6-flash",
                    contents: prompt,
                    config: {
                        responseMimeType:
                            "application/json"
                    }
                });

            console.log(
                "[ GEMINI ] Response berhasil"
            );

            return response;

        } catch (error) {

            const status =
                error?.status ||
                error?.error?.status ||
                error?.code;

            console.error(
                `[ ERROR ] Percobaan ${attempt} gagal:`,
                status
            );

            // ========================================
            // QUOTA 429
            // ========================================

            if (
                status === 429 ||
                status === "RESOURCE_EXHAUSTED"
            ) {

                console.log("");
                console.log(
                    "┌────────────────────────────────────────┐"
                );
                console.log(
                    "│          ◆ SMART DATA PARSER           │"
                );
                console.log(
                    "├────────────────────────────────────────┤"
                );
                console.log(
                    `│  → http://localhost:${PORT}               │`
                );
                console.log(
                    "│  ● Gemini AI: AKTIF                    │"
                );
                console.log(
                    "├────────────────────────────────────────┤"
                );
                console.log(
                    "│  ! Batas pemakaian hari ini tercapai   │"
                );
                console.log(
                    "│  → Batas Free Tier: 20 kali/hari       │"
                );
                console.log(
                    "│  → Tersedia kembali dalam: 20 jam      │"
                );
                console.log(
                    "└────────────────────────────────────────┘"
                );
                console.log("");

                throw new Error(
                    "Batas pemakaian AI hari ini sudah tercapai."
                );
            }

            // ========================================
            // SERVICE UNAVAILABLE 503
            // ========================================

            if (
                status === 503 ||
                status === "UNAVAILABLE"
            ) {

                if (attempt < maxRetry) {

                    console.log(
                        "[ WAIT ] Gemini sedang sibuk."
                    );

                    console.log(
                        "[ WAIT ] Menunggu 3 detik..."
                    );

                    await new Promise(
                        resolve =>
                            setTimeout(
                                resolve,
                                3000
                            )
                    );

                    continue;
                }
            }

            throw error;
        }
    }
}

// ========================================
// API PARSER
// ========================================

app.post(
    "/api/parse",
    async (req, res) => {

        try {

            const text =
                req.body.text;

            if (
                !text ||
                !text.trim()
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Teks OCR kosong"
                });
            }

            console.log("");
            console.log(
                "========================================"
            );
            console.log(
                "[ INPUT ] DATA OCR DITERIMA"
            );
            console.log(
                "========================================"
            );

            const prompt = `

Kamu adalah AI parser dokumen administrasi
yang sangat teliti.

Tugas kamu adalah membaca teks OCR mentah
dan mengubahnya menjadi data tabel terstruktur.

OCR bisa berantakan.

Contohnya:

- label bisa terpisah dari nilainya
- satu data bisa berada di beberapa baris
- spasi bisa salah
- urutan informasi bisa tidak konsisten
- beberapa orang bisa berada dalam satu paragraf
- hasil OCR bisa menggabungkan beberapa field

ATURAN UTAMA:

1. Pahami struktur berdasarkan konteks,
   bukan hanya berdasarkan posisi baris.

2. Satu orang harus menjadi satu object.

3. Jika terdapat beberapa orang,
   pisahkan menjadi object yang berbeda.

4. NIK Indonesia biasanya terdiri dari
   tepat 16 digit.

5. Jangan pernah menggabungkan NIK
   dengan nama, alamat, atau field lainnya.

6. Jika menemukan pola:
   NIK 1234567890123456
   maka angka tersebut harus dimasukkan
   ke field NIK.

7. Pisahkan:
   NAMA
   NIK
   TEMPAT LAHIR
   TANGGAL LAHIR
   ALAMAT
   RT
   RW
   TPS
   dan informasi lainnya
   jika tersedia.

8. Jika terdapat:
   Tempat lahir Jakarta
   Tanggal lahir 12 Januari 2000
   maka:
   TEMPAT LAHIR = Jakarta
   TANGGAL LAHIR = 12 Januari 2000

9. Jika ada field yang tidak dikenal,
   jangan dibuang.
   Masukkan ke field tambahan
   yang sesuai.

10. Jangan mengarang data.

11. Jika sebuah field tidak tersedia,
    gunakan string kosong.

12. Jangan mengubah isi informasi
    menjadi informasi baru.

13. Pertahankan nomor kasus,
    nomor urut, atau identifier lainnya
    jika memang ada.

14. Jika satu kasus mempunyai beberapa orang,
    buat object terpisah untuk setiap orang.

15. Jika ada kata "dengan" yang menunjukkan
    orang kedua atau orang berikutnya,
    periksa konteks dan pisahkan orang tersebut
    menjadi object berbeda.

16. Jangan membuang informasi OCR.

17. Jika informasi tidak dapat dipastikan
    masuk ke field standar,
    simpan sebagai field tambahan.

18. Output HARUS berupa JSON ARRAY.

CONTOH FORMAT:

[
    {
        "NAMA": "Nama Orang",
        "NIK": "1234567890123456",
        "TEMPAT LAHIR": "Jakarta",
        "TANGGAL LAHIR": "01 Januari 2000",
        "ALAMAT": "Contoh alamat",
        "RT": "001",
        "RW": "002",
        "TPS": "10"
    }
]

Jangan memberikan penjelasan.
Jangan menggunakan Markdown.
Hanya kembalikan JSON ARRAY.

==============================
TEKS OCR
==============================

${text}

==============================
SELESAI
==============================

`;

            const response =
                await generateWithRetry(
                    prompt
                );

            const hasilText =
                response.text;

            if (!hasilText) {

                throw new Error(
                    "Gemini tidak memberikan hasil"
                );
            }

            let hasil;

            try {

                hasil =
                    JSON.parse(
                        hasilText
                    );

            } catch (jsonError) {

                console.error(
                    "[ ERROR ] Response Gemini bukan JSON valid:"
                );

                console.error(
                    hasilText
                );

                throw new Error(
                    "Response Gemini bukan JSON valid"
                );
            }

            res.json({
                success: true,
                data: hasil
            });

            console.log(
                "[ SUCCESS ] Data berhasil diproses"
            );

            console.log(
                "========================================"
            );
            console.log("");

        } catch (error) {

            console.error("");
            console.error(
                "[ ERROR ] ERROR:"
            );
            console.error(
                error.message ||
                error
            );

            res.status(500).json({
                success: false,
                error:
                    error.message ||
                    "Terjadi kesalahan pada server"
            });
        }
    }
);

// ========================================
// START SERVER
// ========================================

app.listen(
    PORT,
    () => {

        console.log("");

        console.log(
            "┌────────────────────────────────────────┐"
        );

        console.log(
            "│          ◆ SMART DATA PARSER           │"
        );

        console.log(
            "├────────────────────────────────────────┤"
        );

        console.log(
            `│  → http://localhost:${PORT}               │`
        );

        console.log(
            "│  ● Gemini AI: AKTIF                    │"
        );

        console.log(
            "└────────────────────────────────────────┘"
        );

        console.log("");
    }
);