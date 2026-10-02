# 💈 Yakkaxon Sartarosh (1 Barber) Bron Qilish Tizimi & Telegram WebApp (TMA)

Ushbu tizim **1 ta sartarosh (yakkaxon usta)** uchun ortiqcha murakkabliklarsiz, **tezkor slot generatsiyasi**, **ustma-ust tushishdan (overlap) 100% himoyalanish** va **Telegram orqali lahzali xabarnomalar** yuborishga mo‘ljallangan to‘liq tayyor veb-ilova va bot platformasidir.

---

## 🌟 Asosiy Imkoniyatlar

1. **Mijoz qismi (Telegram WebApp & Web):**
   - 💈 **Luxury Dark Barber dizayn:** Oltin tusdagi aksentlar, qulay kartalar va zamonaviy tipografiya.
   - ⚡ **Telegram WebApp (TMA) integratsiyasi:** Telegram ichida ochilganda foydalanuvchi ismini avtomatik aniqlaydi, vibratsiya (HapticFeedback) beradi.
   - ✂️ **Xizmatlar katalogi:** Har bir xizmatning davomiyligi (30, 45, 60 daqiqa), narxi va tavsifi.
   - 📅 **14 kunlik interaktiv kalendar:** Kun nomlari va sanalar o‘zbek tilida.
   - ⏰ **Aqlli slot generator:** Vaqtlarni *Ertalab*, *Tushdan keyin* va *Kechqurun* guruhlariga ajratib ko‘rsatish.
   - 🎫 **Muvaffaqiyat cheki (Ticket modal):** Bron qilinganidan so‘ng mijozga barcha tafsilotlar ko‘rsatiladi.

2. **Usta Admin Paneli (`/admin`):**
   - 🔐 **PIN-kod bilan himoyalangan:** (Boshlang‘ich PIN: `7777`).
   - 📅 **Kunlik Jadval:** Bugun navbatda kimlar borligini bir qarashda ko‘rish.
   - 📋 **Barcha Bronlar Tarixi:** Sana va holat bo‘yicha filtrlash (`Tasdiqlangan`, `Yakunlangan`, `Bekor qilingan`).
   - ➕ **Qo‘lda mijoz qo‘shish:** Ko‘chadan to‘g‘ridan-to‘g‘ri kirgan yoki telefon orqali yozilgan mijozlarni tizimga kiritish.
   - ⛔ **Vaqtni yopish (Tanaffus):** Kutilmagan ish chiqib qolganda ma’lum soat oralig‘ini tezkor bloklash.
   - 🏖️ **Maxsus dam olish kunlari:** Istalgan sanani bitta tugma bilan dam olish kuni deb e’lon qilish.
   - ⏱️ **Ish jadvali sozlamalari:** Haftaning har bir kuni uchun ish boshlanishi, tugashi va tanaffus (break) vaqtlarini tahrirlash.
   - ✂️ **Xizmatlar narxi va davomiyligini boshqarish:** Yangi xizmat qo‘shish yoki mavjudlarini o‘zgartirish.

3. **Telegram Bot Integratsiyasi:**
   - ✈️ **Yangi mijoz haqida darhol xabar:**
     ```text
     💈 YANGI BRON! (Yangi Navbat)
     👤 Mijoz: Sardor
     📞 Telefon: +998901234567
     ✂️ Xizmat: Soch olish (30 daqiqa)
     💰 Narxi: 60 000 so‘m
     📅 Sana: 2026-10-05
     ⏰ Vaqt: 15:00 - 15:30
     ```
   - 🔘 **Telegramdagi tezkor tugmalar:** Ustaga xabarning tagida `📞 Qo‘ng‘iroq qilish`, `✅ Yakunlandi` va `❌ Bekor qilish` tugmalari chiqadi.
   - 👉 `/today` buyrug‘i: Bugungi barcha navbatlarni Telegramda chiroyli ro‘yxat shaklida chiqarish.
   - 👉 `/stats` buyrug‘i: Bugungi jami mijozlar soni va kutilayotgan umumiy daromad.

---

## 📐 Bo‘sh Vaqtlarni Hisoblash Algoritmi (Slot Generator)

Tizim quyidagi 5 bosqichli formula asosida ishlaydi:

1. **Ish vaqti oraliqlari:** Haftaning tanlangan kuni uchun `work_schedule` jadvalidan ish vaqti (`work_start`, `work_end`) hamda tanaffus (`break_start`, `break_end`) olinadi.
2. **Dam olish kunlari tekshiruvi:** `special_off_days` jadvalidan sana tekshiriladi.
3. **Mavjud bronlar:** Bazadan shu kundagi faol (`status = 'confirmed'`) bronlar ro‘yxati olinadi.
4. **Overlap tekshiruvi (To‘qnashuvdan himoya):**
   Har bir potensial `[slot_start, slot_end]` uchun:
   - Slot ish vaqtiga to‘liq sig‘ishi kerak (`slot_start >= work_start` va `slot_end <= work_end`).
   - Tanaffus bilan to‘qnash kelmasligi kerak:
     `slot_start < break_end AND slot_end > break_start`
   - Mavjud bronlar bilan to‘qnash kelmasligi kerak:
     `slot_start < booking_end AND slot_end > booking_start`
5. **O‘tib ketgan soatlarni filtrlash:** Agar bugungi sana tanlangan bo‘lsa, serverning ayni paytdagi soatidan o‘tib ketgan slotlar yashiriladi.
6. **Atomar Race Condition himoyasi:** Agar bir vaqtning o‘zida ikki mijoz bitta slotni bosib yuborsa, SQLite tranzaksiyasi ichida tekshiruv o‘tkaziladi va ikkinchi so‘rovga darhol `409 Conflict` qaytariladi.

---

## 📁 Loyiha Tuzilishi

```text
barber/
├── data/
│   └── barber.db              # SQLite ma'lumotlar bazasi (WAL rejimida)
├── public/
│   ├── css/
│   │   ├── style.css          # Mijoz va TMA uchun Luxury Dark dizayn
│   │   └── admin.css          # Admin panel dizayni
│   ├── js/
│   │   ├── app.js             # Mijoz bron qilish logikasi & TMA SDK
│   │   └── admin.js           # Admin boshqaruv, statistika & modallar
│   ├── index.html             # Mijoz sahifasi (TMA tayyor)
│   └── admin.html             # Barber boshqaruv kabineti
├── src/
│   ├── db/
│   │   ├── database.js        # SQLite interfeysi, tranzaksiyalar va seed
│   │   └── schema.sql         # PostgreSQL / Supabase SQL sxemasi
│   ├── routes/
│   │   └── api.js             # REST API marshrutlari
│   └── services/
│       ├── slotService.js     # Slot generator & Overlap tekshiruvi
│       └── telegramService.js # Telegram Bot, /today buyrug'i va bildirishnomalar
├── .env                       # Muhit o'zgaruvchilari
├── .env.example               # Namuna sozlamalar
├── package.json               # Bog'liqliklar va buyruqlar
├── server.js                  # Express server asosiy fayli
└── README.md                  # Hujjatlashtirish
```

---

## 🚀 O‘rnatish va Ishga Tushirish

### 1. Bog'liqliklarni o'rnatish
```bash
npm install
```

### 2. Sozlamalarni tekshirish (`.env`)
`.env` faylida quyidagi asosiy parametrlar mavjud:
```env
PORT=3000
BARBER_NAME="Usta Sardor"
BARBER_PHONE="+998 90 123 45 67"
ADMIN_PIN=7777

# Telegram Bot sozlamalari (Ixtiyoriy)
TELEGRAM_BOT_TOKEN=
TELEGRAM_BARBER_CHAT_ID=

TIMEZONE=Asia/Tashkent
SLOT_STEP_MINUTES=30
BOOKING_BUFFER_MINUTES=15
```

### 3. Serverni ishga tushirish
```bash
npm start
# Yoki o'zgarishlarni kuzatib boruvchi rejimda:
npm run dev
```

Brauzerda oching:
- **Mijoz uchun:** `http://localhost:3000`
- **Usta (Admin) uchun:** `http://localhost:3000/admin` (PIN: `7777`)

---

## 🤖 Telegram Botni Ulash Qo‘llanmasi

1. Telegramda [@BotFather](https://t.me/BotFather) botiga kiring va `/newbot` buyrug‘ini bering.
2. Botga nom va username tanlang.
3. BotFather bergan **HTTP API Token**ni nusxalang va `.env` faylidagi `TELEGRAM_BOT_TOKEN=` qatoriga qo‘ying.
4. O‘zingizning Telegram **Chat ID**ingizni bilish uchun [@userinfobot](https://t.me/userinfobot) botiga start bosing va ID raqamingizni oling.
5. Olingan ID ni `.env` dagi `TELEGRAM_BARBER_CHAT_ID=` qatoriga yozing.
6. Serverni qayta ishga tushiring:
   - Endi yangi bron bo‘lganda bot sizga bir zumda xabar beradi!
   - Botga `/today` deb yozsangiz, bugungi barcha navbatlarni chiqarib beradi.

---

## 🐘 PostgreSQL / Supabase Ga O‘tkazish

Agar kelajakda SQLite o‘rniga **PostgreSQL** yoki **Supabase** ishlatmoqchi bo‘lsangiz:
- [`src/db/schema.sql`](file:///c:/Users/Zevs/Desktop/lesssons/barber/src/db/schema.sql) faylidagi SQL kodini Supabase SQL Editor yoki PostgreSQL terminaliga joylab ishga tushirishingiz yetarli.
- Unda barcha kerakli jadvallar (`services`, `work_schedule`, `special_off_days`, `bookings`), indekslar va birlamchi ma'lumotlar mavjud.
