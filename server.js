require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./src/routes/api');
const { initTelegramBot } = require('./src/services/telegramService');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Statik frontend fayllar
app.use(express.static(path.join(__dirname, 'public')));

// API Marshrutlar
app.use('/api', apiRoutes);

// Fallback marshrutlar
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Boshqa barcha so'rovlar uchun mijoz sahifasi
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serverless (Vercel) bo'lmagan holatda portni tinglash
const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

if (!isServerless) {
  app.listen(PORT, () => {
    console.log('==================================================');
    console.log(`💈 Sartaroshxona Bron Tizimi muvaffaqiyatli ishga tushdi!`);
    console.log(`🌐 Mijoz WebApp / TMA: http://localhost:${PORT}`);
    console.log(`🔑 Barber Admin Panel:  http://localhost:${PORT}/admin`);
    console.log(`⚡ Xavfsizlik PIN kodi: ${process.env.ADMIN_PIN || '7777'}`);
    console.log('==================================================');

    initTelegramBot();
  });
} else {
  // Vercel serverless konteynerida
  initTelegramBot();
}

// Vercel / Serverless funksiya uchun app eksporti (MANDATORY)
module.exports = app;
