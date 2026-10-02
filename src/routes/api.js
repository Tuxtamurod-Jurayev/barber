const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { generateAvailableSlots, timeToMinutes, minutesToTime, getNowLocal } = require('../services/slotService');
const { notifyBarberNewBooking, notifyBarberBookingCancelled, getNotificationHistory } = require('../services/telegramService');

// ===============================================================
// Admin PIN Tekshirish Middleware
// ===============================================================
function requireAdmin(req, res, next) {
  const pin = req.headers['x-admin-pin'] || req.query.pin || req.body?.pin;
  const configuredPin = process.env.ADMIN_PIN || '7777';

  if (!pin || pin.toString() !== configuredPin.toString()) {
    return res.status(401).json({
      success: false,
      error: 'Xavfsizlik PIN kodi noto‘g‘ri yoki kiritilmagan!'
    });
  }
  next();
}

// ===============================================================
// UMUMIY (FOYDALANUVCHI / TMA) ENDPOINTLARI
// ===============================================================

/**
 * 1. Faol xizmatlar ro'yxati
 */
router.get('/services', (req, res) => {
  try {
    const services = db.getServices({ onlyActive: true });
    res.json({ success: true, services });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 2. Umumiy ma'lumot (Barber ismi, telefon, bugungi sana)
 */
router.get('/info', (req, res) => {
  const { dateStr, timeStr } = getNowLocal();
  res.json({
    success: true,
    barber_name: process.env.BARBER_NAME || 'Usta Sardor',
    barber_phone: process.env.BARBER_PHONE || '+998 90 123 45 67',
    current_date: dateStr,
    current_time: timeStr
  });
});

/**
 * 3. Dinamik Slotlarni Generatsiya Qilish
 * Qadam 1 - 5 logikasi asosida
 * GET /api/slots?date=2026-10-02&service_id=...
 */
router.get('/slots', (req, res) => {
  try {
    const { date, service_id } = req.query;

    if (!date || !service_id) {
      return res.status(400).json({
        success: false,
        error: 'Sana (date) va Xizmat (service_id) ko‘rsatilishi shart!'
      });
    }

    const result = generateAvailableSlots(date, service_id);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * 4. Yangi Bron Yaratish (Slotni Qulflash va Overlap himoyasi)
 * POST /api/bookings
 * Body: { client_name, client_phone, service_id, booking_date, start_time, notes }
 */
router.post('/bookings', async (req, res) => {
  try {
    const { client_name, client_phone, service_id, booking_date, start_time, notes } = req.body;

    // Validatsiya
    if (!client_name || !client_name.trim()) {
      return res.status(400).json({ success: false, error: 'Iltimos, ismingizni kiriting!' });
    }
    if (!client_phone || !client_phone.trim()) {
      return res.status(400).json({ success: false, error: 'Iltimos, telefon raqamingizni kiriting!' });
    }
    if (!service_id || !booking_date || !start_time) {
      return res.status(400).json({ success: false, error: 'Xizmat, sana va vaqt to‘liq tanlanishi kerak!' });
    }

    // Xizmatni tekshirish
    const service = db.getServiceById(service_id);
    if (!service) {
      return res.status(404).json({ success: false, error: 'Tanlangan xizmat topilmadi!' });
    }

    // end_time ni aniq hisoblash
    const startMinutes = timeToMinutes(start_time);
    const endMinutes = startMinutes + Number(service.duration_minutes);
    const end_time = minutesToTime(endMinutes);

    // Atomar tranzaksiya ichida yaratish
    const newBooking = db.createBooking({
      client_name: client_name.trim(),
      client_phone: client_phone.trim(),
      service_id,
      booking_date,
      start_time,
      end_time,
      notes: (notes || '').trim(),
      status: 'confirmed'
    });

    // Usta Telegramiga zudlik bilan bildirishnoma yuborish
    notifyBarberNewBooking(newBooking).catch(err => {
      console.error('[Notification background error]:', err);
    });

    res.status(201).json({
      success: true,
      message: 'Navbatingiz muvaffaqiyatli band qilindi!',
      booking: newBooking
    });

  } catch (err) {
    if (err.code === 'SLOT_OCCUPIED') {
      return res.status(409).json({
        success: false,
        error: 'Kechirasiz! Ushbu vaqt indicagina boshqa mijoz tomonidan band qilindi. Iltimos, boshqa vaqtni tanlang.'
      });
    }
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * 5. Bronni tekshirish yoki bekor qilish
 */
router.get('/bookings/:id', (req, res) => {
  const booking = db.getBookingById(req.params.id);
  if (!booking) {
    return res.status(404).json({ success: false, error: 'Bron topilmadi' });
  }
  res.json({ success: true, booking });
});

router.post('/bookings/:id/cancel', (req, res) => {
  try {
    const booking = db.getBookingById(req.params.id);
    if (!booking) {
      return res.status(404).json({ success: false, error: 'Bron topilmadi' });
    }
    const updated = db.updateBookingStatus(req.params.id, 'cancelled');
    notifyBarberBookingCancelled(updated).catch(() => {});
    res.json({ success: true, message: 'Bron bekor qilindi', booking: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ===============================================================
// USTA (BARBER) ADMIN BOSHQARUV PANEL ENDPOINTLARI
// ===============================================================

/**
 * PIN kod tekshiruvi (Login)
 */
router.post('/admin/auth', (req, res) => {
  const { pin } = req.body;
  const configuredPin = process.env.ADMIN_PIN || '7777';

  if (pin && pin.toString() === configuredPin.toString()) {
    return res.json({ success: true, message: 'PIN to‘g‘ri' });
  }
  res.status(401).json({ success: false, error: 'Noto‘g‘ri PIN kod!' });
});

/**
 * Kunlik / Davriy bronlar ro'yxati
 */
router.get('/admin/bookings', requireAdmin, (req, res) => {
  try {
    const { date, status, fromDate, toDate } = req.query;
    const bookings = db.getBookings({ date, status, fromDate, toDate });
    res.json({ success: true, bookings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Bron holatini o'zgartirish (confirmed, completed, cancelled)
 */
router.patch('/admin/bookings/:id/status', requireAdmin, (req, res) => {
  try {
    const { status } = req.body;
    const updated = db.updateBookingStatus(req.params.id, status);
    res.json({ success: true, booking: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * Qo'lda mijoz qo'shish (Walk-in / Telefon orqali kelganlar uchun)
 */
router.post('/admin/bookings/manual', requireAdmin, (req, res) => {
  try {
    const { client_name, client_phone, service_id, booking_date, start_time, end_time, notes } = req.body;

    let computedEndTime = end_time;
    if (!computedEndTime) {
      const service = db.getServiceById(service_id);
      const startMin = timeToMinutes(start_time);
      const dur = service ? Number(service.duration_minutes) : 30;
      computedEndTime = minutesToTime(startMin + dur);
    }

    const newBooking = db.createBooking({
      client_name: client_name || 'Walk-in mijoz',
      client_phone: client_phone || '-',
      service_id,
      booking_date,
      start_time,
      end_time: computedEndTime,
      notes: notes || 'Admin paneldan qo‘lda qo‘shilgan',
      status: 'confirmed'
    });

    res.status(201).json({ success: true, booking: newBooking });
  } catch (err) {
    if (err.code === 'SLOT_OCCUPIED') {
      return res.status(409).json({ success: false, error: 'Bu vaqt oralig‘ida boshqa bron mavjud!' });
    }
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * Vaqtni yopish (Vaqtinchalik band qilish / Tanaffus berish)
 */
router.post('/admin/bookings/block-time', requireAdmin, (req, res) => {
  try {
    const { booking_date, start_time, end_time, reason } = req.body;

    if (!booking_date || !start_time || !end_time) {
      return res.status(400).json({ success: false, error: 'Sana, boshlanish va tugash vaqti kerak!' });
    }

    // Bloklangan vaqt uchun maxsus service_id yoki mavjud eng birinchisi
    const services = db.getServices({ onlyActive: false });
    const dummyServiceId = services.length > 0 ? services[0].id : 'blocked';

    const blocked = db.createBooking({
      client_name: `[BAND/BLOK] ${reason || 'Shaxsiy ish'}`,
      client_phone: '-',
      service_id: dummyServiceId,
      booking_date,
      start_time,
      end_time,
      notes: reason || 'Usta tomonidan yopilgan vaqt',
      status: 'confirmed'
    });

    res.status(201).json({ success: true, message: 'Vaqt oralig‘i muvaffaqiyatli yopildi', booking: blocked });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * Maxsus dam olish kunlari boshqaruvi (special_off_days)
 */
router.get('/admin/special-days', requireAdmin, (req, res) => {
  const days = db.getSpecialOffDays();
  res.json({ success: true, days });
});

router.post('/admin/special-days', requireAdmin, (req, res) => {
  try {
    const { off_date, reason } = req.body;
    if (!off_date) {
      return res.status(400).json({ success: false, error: 'Sana (off_date) ko‘rsatilishi shart!' });
    }
    const item = db.addSpecialOffDay(off_date, reason || 'Dam olish kuni');
    res.json({ success: true, day: item });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.delete('/admin/special-days/:off_date', requireAdmin, (req, res) => {
  try {
    db.removeSpecialOffDay(req.params.off_date);
    res.json({ success: true, message: 'Dam olish kuni olib tashlandi' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * Ish jadvali boshqaruvi (work_schedule)
 */
router.get('/admin/work-schedule', requireAdmin, (req, res) => {
  const schedule = db.getWorkSchedule();
  res.json({ success: true, schedule });
});

router.put('/admin/work-schedule/:day', requireAdmin, (req, res) => {
  try {
    const day = parseInt(req.params.day, 10);
    const updated = db.updateWorkSchedule(day, req.body);
    res.json({ success: true, schedule: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * Xizmatlarni boshqarish (Services CRUD)
 */
router.get('/admin/services', requireAdmin, (req, res) => {
  const services = db.getServices({ onlyActive: false });
  res.json({ success: true, services });
});

router.post('/admin/services', requireAdmin, (req, res) => {
  try {
    const { title, price, duration_minutes, description } = req.body;
    const created = db.createService({ title, price, duration_minutes, description });
    res.status(201).json({ success: true, service: created });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.put('/admin/services/:id', requireAdmin, (req, res) => {
  try {
    const updated = db.updateService(req.params.id, req.body);
    res.json({ success: true, service: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.delete('/admin/services/:id', requireAdmin, (req, res) => {
  try {
    const result = db.deleteService(req.params.id);
    res.json({ success: true, result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * Kunlik statistika
 */
router.get('/admin/stats', requireAdmin, (req, res) => {
  const { date } = req.query;
  const targetDate = date || getNowLocal().dateStr;
  const stats = db.getDayStats(targetDate);
  res.json({ success: true, stats });
});

/**
 * So'nggi bildirishnomalar (Telegram logs)
 */
router.get('/admin/notifications', requireAdmin, (req, res) => {
  res.json({ success: true, notifications: getNotificationHistory() });
});

module.exports = router;
