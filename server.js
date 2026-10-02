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

// Boshqa barcha so'rovlar uchun mijoz sahifasi (Express 5 mos)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serverni ishga tushirish
app.listen(PORT, () => {
  console.log('==================================================');
  console.log(`💈 Sartaroshxona Bron Tizimi muvaffaqiyatli ishga tushdi!`);
  console.log(`🌐 Mijoz WebApp / TMA: http://localhost:${PORT}`);
  console.log(`🔑 Barber Admin Panel:  http://localhost:${PORT}/admin`);
  console.log(`⚡ Xavfsizlik PIN kodi: ${process.env.ADMIN_PIN || '7777'}`);
  console.log('==================================================');

  // Telegram botni ishga tushirish (agar token berilgan bo'lsa)
  initTelegramBot();
});
