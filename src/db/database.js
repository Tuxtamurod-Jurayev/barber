const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Baza fayli saqlanadigan papka
const dataDir = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'barber.db');
const db = new Database(dbPath);

// WAL (Write-Ahead Logging) rejimini yoqish - yuqori tezlik va xavfsiz parallel o'qish uchun
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDb() {
  // 1. Services
  db.exec(`
    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      price INTEGER NOT NULL,
      duration_minutes INTEGER NOT NULL,
      description TEXT DEFAULT '',
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS work_schedule (
      id TEXT PRIMARY KEY,
      day_of_week INTEGER NOT NULL UNIQUE,
      is_working_day INTEGER DEFAULT 1,
      work_start TEXT NOT NULL DEFAULT '09:00',
      work_end TEXT NOT NULL DEFAULT '20:00',
      break_start TEXT DEFAULT '13:00',
      break_end TEXT DEFAULT '14:00'
    );

    CREATE TABLE IF NOT EXISTS special_off_days (
      id TEXT PRIMARY KEY,
      off_date TEXT UNIQUE NOT NULL,
      reason TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      client_name TEXT NOT NULL,
      client_phone TEXT NOT NULL,
      service_id TEXT NOT NULL,
      booking_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      status TEXT DEFAULT 'confirmed',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (service_id) REFERENCES services(id)
    );

    CREATE INDEX IF NOT EXISTS idx_bookings_date_status ON bookings (booking_date, status);
  `);

  // Boshlang'ich xizmatlarni kiritish (agar bo'sh bo'lsa)
  const serviceCount = db.prepare('SELECT COUNT(*) as count FROM services').get().count;
  if (serviceCount === 0) {
    const insertService = db.prepare(`
      INSERT INTO services (id, title, price, duration_minutes, description, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const defaultServices = [
      { id: crypto.randomUUID(), title: 'Soch olish (Klassik / Fade)', price: 60000, duration: 30, desc: 'Professional soch turmagi, qirqish va styling' },
      { id: crypto.randomUUID(), title: 'Soqol tekislash va qirqish', price: 40000, duration: 30, desc: 'Issiq sochiq, lezviya va maxsus parvarish moyi' },
      { id: crypto.randomUUID(), title: 'Combo: Soch + Soqol', price: 90000, duration: 60, desc: 'To‘liq parvarish, soch va soqol shakllantirish, yuvish' },
      { id: crypto.randomUUID(), title: 'Bolalar sochi (10 yoshgacha)', price: 45000, duration: 30, desc: 'Kichkintoylar uchun sabrli va ehtiyotkorona xizmat' },
      { id: crypto.randomUUID(), title: 'VIP Royal Xizmat', price: 150000, duration: 60, desc: 'Soch, soqol, yuz qora niqobi, bosh massaji va premium styling' },
    ];

    const insertTx = db.transaction((services) => {
      for (const s of services) {
        insertService.run(s.id, s.title, s.price, s.duration, s.desc, 1);
      }
    });
    insertTx(defaultServices);
  }

  // Boshlang'ich ish jadvalini kiritish (1 = Dushanba, ..., 7 = Yakshanba)
  const scheduleCount = db.prepare('SELECT COUNT(*) as count FROM work_schedule').get().count;
  if (scheduleCount === 0) {
    const insertSchedule = db.prepare(`
      INSERT INTO work_schedule (id, day_of_week, is_working_day, work_start, work_end, break_start, break_end)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const defaultSchedule = [
      { day: 1, isWork: 1, start: '09:00', end: '20:00', bStart: '13:00', bEnd: '14:00' }, // Du
      { day: 2, isWork: 1, start: '09:00', end: '20:00', bStart: '13:00', bEnd: '14:00' }, // Se
      { day: 3, isWork: 1, start: '09:00', end: '20:00', bStart: '13:00', bEnd: '14:00' }, // Chor
      { day: 4, isWork: 1, start: '09:00', end: '20:00', bStart: '13:00', bEnd: '14:00' }, // Pay
      { day: 5, isWork: 1, start: '09:00', end: '20:00', bStart: '12:30', bEnd: '14:00' }, // Juma (Namozi tanaffus)
      { day: 6, isWork: 1, start: '09:00', end: '21:00', bStart: '13:00', bEnd: '14:00' }, // Shanba
      { day: 7, isWork: 0, start: '10:00', end: '18:00', bStart: '13:00', bEnd: '14:00' }, // Yakshanba (Dam)
    ];

    const scheduleTx = db.transaction((rows) => {
      for (const r of rows) {
        insertSchedule.run(crypto.randomUUID(), r.day, r.isWork, r.start, r.end, r.bStart, r.bEnd);
      }
    });
    scheduleTx(defaultSchedule);
  }
}

// Baza jadvallarini ishga tushirish
initDb();

// ===============================================================
// Xizmatlar (Services) Metodlari
// ===============================================================
function getServices({ onlyActive = true } = {}) {
  const query = onlyActive 
    ? 'SELECT * FROM services WHERE is_active = 1 ORDER BY price ASC'
    : 'SELECT * FROM services ORDER BY created_at ASC';
  return db.prepare(query).all();
}

function getServiceById(id) {
  return db.prepare('SELECT * FROM services WHERE id = ?').get(id);
}

function createService({ title, price, duration_minutes, description = '' }) {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO services (id, title, price, duration_minutes, description, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(id, title, Number(price), Number(duration_minutes), description);
  return getServiceById(id);
}

function updateService(id, { title, price, duration_minutes, description, is_active }) {
  db.prepare(`
    UPDATE services
    SET title = COALESCE(?, title),
        price = COALESCE(?, price),
        duration_minutes = COALESCE(?, duration_minutes),
        description = COALESCE(?, description),
        is_active = COALESCE(?, is_active)
    WHERE id = ?
  `).run(
    title !== undefined ? title : null,
    price !== undefined ? Number(price) : null,
    duration_minutes !== undefined ? Number(duration_minutes) : null,
    description !== undefined ? description : null,
    is_active !== undefined ? (is_active ? 1 : 0) : null,
    id
  );
  return getServiceById(id);
}

function deleteService(id) {
  // Avval ushbu xizmatga tegishli faol bronlar bormi tekshiramiz
  const activeBookings = db.prepare(`
    SELECT COUNT(*) as count FROM bookings WHERE service_id = ? AND status = 'confirmed'
  `).get(id).count;

  if (activeBookings > 0) {
    // To'liq o'chirmasdan, nofaol (is_active = 0) qilib qo'yamiz
    db.prepare('UPDATE services SET is_active = 0 WHERE id = ?').run(id);
    return { softDeleted: true, message: 'Xizmat nofaol holatga o‘tkazildi' };
  }

  db.prepare('DELETE FROM services WHERE id = ?').run(id);
  return { deleted: true };
}

// ===============================================================
// Ish Jadvali (Work Schedule) Metodlari
// ===============================================================
function getWorkSchedule() {
  return db.prepare('SELECT * FROM work_schedule ORDER BY day_of_week ASC').all();
}

function getWorkScheduleForDay(dayOfWeek) {
  return db.prepare('SELECT * FROM work_schedule WHERE day_of_week = ?').get(dayOfWeek);
}

function updateWorkSchedule(dayOfWeek, { is_working_day, work_start, work_end, break_start, break_end }) {
  db.prepare(`
    UPDATE work_schedule
    SET is_working_day = COALESCE(?, is_working_day),
        work_start = COALESCE(?, work_start),
        work_end = COALESCE(?, work_end),
        break_start = COALESCE(?, break_start),
        break_end = COALESCE(?, break_end)
    WHERE day_of_week = ?
  `).run(
    is_working_day !== undefined ? (is_working_day ? 1 : 0) : null,
    work_start || null,
    work_end || null,
    break_start || null,
    break_end || null,
    dayOfWeek
  );
  return getWorkScheduleForDay(dayOfWeek);
}

// ===============================================================
// Maxsus Dam Olish Kunlari (Special Off Days)
// ===============================================================
function getSpecialOffDays() {
  return db.prepare('SELECT * FROM special_off_days ORDER BY off_date ASC').all();
}

function getSpecialOffDay(offDate) {
  return db.prepare('SELECT * FROM special_off_days WHERE off_date = ?').get(offDate);
}

function addSpecialOffDay(offDate, reason = 'Dam olish kuni') {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO special_off_days (id, off_date, reason)
    VALUES (?, ?, ?)
    ON CONFLICT(off_date) DO UPDATE SET reason = excluded.reason
  `).run(id, offDate, reason);
  return getSpecialOffDay(offDate);
}

function removeSpecialOffDay(offDate) {
  db.prepare('DELETE FROM special_off_days WHERE off_date = ?').run(offDate);
  return { success: true };
}

// ===============================================================
// Bronlar (Bookings) Metodlari
// ===============================================================
function getBookings({ date, status, fromDate, toDate, limit = 100 } = {}) {
  let query = `
    SELECT b.*, s.title as service_title, s.price as service_price, s.duration_minutes as service_duration
    FROM bookings b
    LEFT JOIN services s ON b.service_id = s.id
    WHERE 1=1
  `;
  const params = [];

  if (date) {
    query += ' AND b.booking_date = ?';
    params.push(date);
  }
  if (status) {
    query += ' AND b.status = ?';
    params.push(status);
  }
  if (fromDate) {
    query += ' AND b.booking_date >= ?';
    params.push(fromDate);
  }
  if (toDate) {
    query += ' AND b.booking_date <= ?';
    params.push(toDate);
  }

  query += ' ORDER BY b.booking_date ASC, b.start_time ASC LIMIT ?';
  params.push(limit);

  return db.prepare(query).all(...params);
}

function getBookingById(id) {
  return db.prepare(`
    SELECT b.*, s.title as service_title, s.price as service_price, s.duration_minutes as service_duration
    FROM bookings b
    LEFT JOIN services s ON b.service_id = s.id
    WHERE b.id = ?
  `).get(id);
}

/**
 * Ustma-ust tushishni tekshirish (Overlap detector)
 * Formula: slot_start < booking_end AND slot_end > booking_start
 */
function checkBookingOverlap(bookingDate, startTime, endTime, excludeBookingId = null) {
  let query = `
    SELECT b.*, s.title as service_title
    FROM bookings b
    LEFT JOIN services s ON b.service_id = s.id
    WHERE b.booking_date = ?
      AND b.status = 'confirmed'
      AND b.start_time < ?
      AND b.end_time > ?
  `;
  const params = [bookingDate, endTime, startTime];

  if (excludeBookingId) {
    query += ' AND b.id != ?';
    params.push(excludeBookingId);
  }

  return db.prepare(query).all(...params);
}

/**
 * Atomar bron qilish (Transaction bilan himoyalangan)
 */
function createBooking({ client_name, client_phone, service_id, booking_date, start_time, end_time, notes = '', status = 'confirmed' }) {
  // Tranzaksiya ichida overlap bor-yo'qligini qat'iy tekshiramiz
  const insertTransaction = db.transaction(() => {
    const conflicts = checkBookingOverlap(booking_date, start_time, end_time);
    if (conflicts.length > 0) {
      const err = new Error('Ushbu vaqt oralig‘i allaqachon band qilingan!');
      err.code = 'SLOT_OCCUPIED';
      err.conflict = conflicts[0];
      throw err;
    }

    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO bookings (id, client_name, client_phone, service_id, booking_date, start_time, end_time, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, client_name, client_phone, service_id, booking_date, start_time, end_time, status, notes);

    return id;
  });

  const newBookingId = insertTransaction();
  return getBookingById(newBookingId);
}

function updateBookingStatus(id, status) {
  const allowed = ['confirmed', 'cancelled', 'completed'];
  if (!allowed.includes(status)) {
    throw new Error('Noto‘g‘ri holat (status)!');
  }
  db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, id);
  return getBookingById(id);
}

function deleteBooking(id) {
  db.prepare('DELETE FROM bookings WHERE id = ?').run(id);
  return { success: true };
}

// Kunlik umumiy statistika (Admin dashboard uchun)
function getDayStats(dateStr) {
  const totalBookings = db.prepare(`
    SELECT COUNT(*) as count,
           SUM(CASE WHEN b.status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_count,
           SUM(CASE WHEN b.status = 'completed' THEN 1 ELSE 0 END) as completed_count,
           SUM(CASE WHEN b.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count,
           SUM(CASE WHEN b.status IN ('confirmed', 'completed') THEN s.price ELSE 0 END) as estimated_revenue
    FROM bookings b
    LEFT JOIN services s ON b.service_id = s.id
    WHERE b.booking_date = ?
  `).get(dateStr);

  return {
    date: dateStr,
    total: totalBookings.count || 0,
    confirmed: totalBookings.confirmed_count || 0,
    completed: totalBookings.completed_count || 0,
    cancelled: totalBookings.cancelled_count || 0,
    revenue: totalBookings.estimated_revenue || 0
  };
}

module.exports = {
  db,
  getServices,
  getServiceById,
  createService,
  updateService,
  deleteService,
  getWorkSchedule,
  getWorkScheduleForDay,
  updateWorkSchedule,
  getSpecialOffDays,
  getSpecialOffDay,
  addSpecialOffDay,
  removeSpecialOffDay,
  getBookings,
  getBookingById,
  checkBookingOverlap,
  createBooking,
  updateBookingStatus,
  deleteBooking,
  getDayStats
};
