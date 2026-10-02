const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Serverless / Vercel muhitini aniqlash
const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT);

let db = null;
let useMemoryStore = false;

// Standart birlamchi ma'lumotlar (Seed)
const DEFAULT_SERVICES = [
  { id: '11111111-1111-4111-8111-111111111111', title: 'Soch olish (Klassik / Fade)', price: 60000, duration_minutes: 30, description: 'Professional soch turmagi, qirqish va styling', is_active: 1 },
  { id: '22222222-2222-4222-8222-222222222222', title: 'Soqol tekislash va qirqish', price: 40000, duration_minutes: 30, description: 'Issiq sochiq, lezviya va maxsus parvarish moyi', is_active: 1 },
  { id: '33333333-3333-4333-8333-333333333333', title: 'Combo: Soch + Soqol', price: 90000, duration_minutes: 60, description: 'To‘liq parvarish, soch va soqol shakllantirish, yuvish', is_active: 1 },
  { id: '44444444-4444-4444-8444-444444444444', title: 'Bolalar sochi (10 yoshgacha)', price: 45000, duration_minutes: 30, description: 'Kichkintoylar uchun sabrli va ehtiyotkorona xizmat', is_active: 1 },
  { id: '55555555-5555-4555-8555-555555555555', title: 'VIP Royal Xizmat', price: 150000, duration_minutes: 60, description: 'Soch, soqol, yuz qora niqobi, bosh massaji va premium styling', is_active: 1 },
];

const DEFAULT_SCHEDULE = [
  { id: 's1', day_of_week: 1, is_working_day: 1, work_start: '09:00', work_end: '20:00', break_start: '13:00', break_end: '14:00' },
  { id: 's2', day_of_week: 2, is_working_day: 1, work_start: '09:00', work_end: '20:00', break_start: '13:00', break_end: '14:00' },
  { id: 's3', day_of_week: 3, is_working_day: 1, work_start: '09:00', work_end: '20:00', break_start: '13:00', break_end: '14:00' },
  { id: 's4', day_of_week: 4, is_working_day: 1, work_start: '09:00', work_end: '20:00', break_start: '13:00', break_end: '14:00' },
  { id: 's5', day_of_week: 5, is_working_day: 1, work_start: '09:00', work_end: '20:00', break_start: '12:30', break_end: '14:00' },
  { id: 's6', day_of_week: 6, is_working_day: 1, work_start: '09:00', work_end: '21:00', break_start: '13:00', break_end: '14:00' },
  { id: 's7', day_of_week: 7, is_working_day: 0, work_start: '10:00', work_end: '18:00', break_start: '13:00', break_end: '14:00' },
];

// Fallback Memory Store (Agar Vercelda better-sqlite3 native ikkilik fayli ishlamasa)
const memStore = {
  services: JSON.parse(JSON.stringify(DEFAULT_SERVICES)),
  schedule: JSON.parse(JSON.stringify(DEFAULT_SCHEDULE)),
  offDays: [],
  bookings: [],
  settings: {
    telegram_bot_token: process.env.TELEGRAM_BOT_TOKEN || '8814995989:AAEYjWrbQlf5qfsAabViVBjNDn_JXWFH-x4',
    telegram_admin_chat_id: process.env.TELEGRAM_BARBER_CHAT_ID || '',
    telegram_admin_phone: process.env.BARBER_PHONE || '+998 90 123 45 67',
    webapp_url: process.env.WEBAPP_URL || 'https://barber-sepia-six.vercel.app/',
    barber_name: process.env.BARBER_NAME || 'Usta Sardor'
  }
};

try {
  const Database = require('better-sqlite3');
  const dataDir = isServerless ? '/tmp' : path.join(__dirname, '..', '..', 'data');
  
  if (!fs.existsSync(dataDir)) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
    } catch (e) {
      console.warn('[DB] mkdir ogohlantirish:', e.message);
    }
  }

  const dbPath = path.join(dataDir, 'barber.db');
  db = new Database(dbPath);

  // WAL rejimini faqat serverless bo'lmaganda yoqamiz (/tmp da WAL fayllar qulf bo'lib qolmasligi uchun)
  if (!isServerless) {
    db.pragma('journal_mode = WAL');
  }
  db.pragma('foreign_keys = ON');

  initSqliteTables();
} catch (err) {
  console.warn('[DB] better-sqlite3 yuklanmadi, xavfsiz xotira (In-Memory) rejimiga o‘tildi:', err.message);
  useMemoryStore = true;
}

function initSqliteTables() {
  if (!db) return;

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

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_bookings_date_status ON bookings (booking_date, status);
  `);

  // Default sozlamalarni kiritish
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  insertSetting.run('telegram_bot_token', process.env.TELEGRAM_BOT_TOKEN || '8814995989:AAEYjWrbQlf5qfsAabViVBjNDn_JXWFH-x4');
  insertSetting.run('telegram_admin_chat_id', process.env.TELEGRAM_BARBER_CHAT_ID || '');
  insertSetting.run('telegram_admin_phone', process.env.BARBER_PHONE || '+998 90 123 45 67');
  insertSetting.run('webapp_url', process.env.WEBAPP_URL || 'https://barber-sepia-six.vercel.app/');
  insertSetting.run('barber_name', process.env.BARBER_NAME || 'Usta Sardor');

  // Boshlang'ich xizmatlar
  const serviceCount = db.prepare('SELECT COUNT(*) as count FROM services').get().count;
  if (serviceCount === 0) {
    const insertService = db.prepare(`
      INSERT INTO services (id, title, price, duration_minutes, description, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertTx = db.transaction((services) => {
      for (const s of services) {
        insertService.run(s.id, s.title, s.price, s.duration_minutes, s.description, 1);
      }
    });
    insertTx(DEFAULT_SERVICES);
  }

  // Boshlang'ich ish jadvali
  const scheduleCount = db.prepare('SELECT COUNT(*) as count FROM work_schedule').get().count;
  if (scheduleCount === 0) {
    const insertSchedule = db.prepare(`
      INSERT INTO work_schedule (id, day_of_week, is_working_day, work_start, work_end, break_start, break_end)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const scheduleTx = db.transaction((rows) => {
      for (const r of rows) {
        insertSchedule.run(crypto.randomUUID(), r.day_of_week, r.is_working_day, r.work_start, r.work_end, r.break_start, r.break_end);
      }
    });
    scheduleTx(DEFAULT_SCHEDULE);
  }
}

// ===============================================================
// XIZMATLAR (SERVICES)
// ===============================================================
function getServices({ onlyActive = true } = {}) {
  if (useMemoryStore) {
    return memStore.services
      .filter(s => onlyActive ? s.is_active === 1 : true)
      .sort((a, b) => a.price - b.price);
  }
  const query = onlyActive 
    ? 'SELECT * FROM services WHERE is_active = 1 ORDER BY price ASC'
    : 'SELECT * FROM services ORDER BY created_at ASC';
  return db.prepare(query).all();
}

function getServiceById(id) {
  if (useMemoryStore) {
    return memStore.services.find(s => s.id === id) || null;
  }
  return db.prepare('SELECT * FROM services WHERE id = ?').get(id) || null;
}

function createService({ title, price, duration_minutes, description = '' }) {
  const id = crypto.randomUUID();
  if (useMemoryStore) {
    const item = { id, title, price: Number(price), duration_minutes: Number(duration_minutes), description, is_active: 1, created_at: new Date().toISOString() };
    memStore.services.push(item);
    return item;
  }
  db.prepare(`
    INSERT INTO services (id, title, price, duration_minutes, description, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(id, title, Number(price), Number(duration_minutes), description);
  return getServiceById(id);
}

function updateService(id, { title, price, duration_minutes, description, is_active }) {
  if (useMemoryStore) {
    const s = memStore.services.find(x => x.id === id);
    if (!s) return null;
    if (title !== undefined) s.title = title;
    if (price !== undefined) s.price = Number(price);
    if (duration_minutes !== undefined) s.duration_minutes = Number(duration_minutes);
    if (description !== undefined) s.description = description;
    if (is_active !== undefined) s.is_active = is_active ? 1 : 0;
    return s;
  }
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
  if (useMemoryStore) {
    const hasBookings = memStore.bookings.some(b => b.service_id === id && b.status === 'confirmed');
    if (hasBookings) {
      const s = memStore.services.find(x => x.id === id);
      if (s) s.is_active = 0;
      return { softDeleted: true, message: 'Xizmat nofaol holatga o‘tkazildi' };
    }
    memStore.services = memStore.services.filter(x => x.id !== id);
    return { deleted: true };
  }
  const activeBookings = db.prepare(`SELECT COUNT(*) as count FROM bookings WHERE service_id = ? AND status = 'confirmed'`).get(id).count;
  if (activeBookings > 0) {
    db.prepare('UPDATE services SET is_active = 0 WHERE id = ?').run(id);
    return { softDeleted: true, message: 'Xizmat nofaol holatga o‘tkazildi' };
  }
  db.prepare('DELETE FROM services WHERE id = ?').run(id);
  return { deleted: true };
}

// ===============================================================
// ISH JADVALI (WORK SCHEDULE)
// ===============================================================
function getWorkSchedule() {
  if (useMemoryStore) {
    return memStore.schedule.sort((a, b) => a.day_of_week - b.day_of_week);
  }
  return db.prepare('SELECT * FROM work_schedule ORDER BY day_of_week ASC').all();
}

function getWorkScheduleForDay(dayOfWeek) {
  if (useMemoryStore) {
    return memStore.schedule.find(s => s.day_of_week === Number(dayOfWeek)) || null;
  }
  return db.prepare('SELECT * FROM work_schedule WHERE day_of_week = ?').get(dayOfWeek) || null;
}

function updateWorkSchedule(dayOfWeek, { is_working_day, work_start, work_end, break_start, break_end }) {
  if (useMemoryStore) {
    const s = memStore.schedule.find(x => x.day_of_week === Number(dayOfWeek));
    if (!s) return null;
    if (is_working_day !== undefined) s.is_working_day = is_working_day ? 1 : 0;
    if (work_start) s.work_start = work_start;
    if (work_end) s.work_end = work_end;
    if (break_start !== undefined) s.break_start = break_start;
    if (break_end !== undefined) s.break_end = break_end;
    return s;
  }
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
// MAXSUS DAM OLISH KUNLARI (SPECIAL OFF DAYS)
// ===============================================================
function getSpecialOffDays() {
  if (useMemoryStore) {
    return memStore.offDays.sort((a, b) => a.off_date.localeCompare(b.off_date));
  }
  return db.prepare('SELECT * FROM special_off_days ORDER BY off_date ASC').all();
}

function getSpecialOffDay(offDate) {
  if (useMemoryStore) {
    return memStore.offDays.find(d => d.off_date === offDate) || null;
  }
  return db.prepare('SELECT * FROM special_off_days WHERE off_date = ?').get(offDate) || null;
}

function addSpecialOffDay(offDate, reason = 'Dam olish kuni') {
  if (useMemoryStore) {
    let item = memStore.offDays.find(d => d.off_date === offDate);
    if (item) {
      item.reason = reason;
    } else {
      item = { id: crypto.randomUUID(), off_date: offDate, reason, created_at: new Date().toISOString() };
      memStore.offDays.push(item);
    }
    return item;
  }
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO special_off_days (id, off_date, reason)
    VALUES (?, ?, ?)
    ON CONFLICT(off_date) DO UPDATE SET reason = excluded.reason
  `).run(id, offDate, reason);
  return getSpecialOffDay(offDate);
}

function removeSpecialOffDay(offDate) {
  if (useMemoryStore) {
    memStore.offDays = memStore.offDays.filter(d => d.off_date !== offDate);
    return { success: true };
  }
  db.prepare('DELETE FROM special_off_days WHERE off_date = ?').run(offDate);
  return { success: true };
}

// ===============================================================
// BRONLAR (BOOKINGS)
// ===============================================================
function getBookings({ date, status, fromDate, toDate, limit = 100 } = {}) {
  if (useMemoryStore) {
    let list = memStore.bookings.map(b => {
      const s = memStore.services.find(srv => srv.id === b.service_id);
      return {
        ...b,
        service_title: s ? s.title : '',
        service_price: s ? s.price : 0,
        service_duration: s ? s.duration_minutes : 30
      };
    });

    if (date) list = list.filter(b => b.booking_date === date);
    if (status) list = list.filter(b => b.status === status);
    if (fromDate) list = list.filter(b => b.booking_date >= fromDate);
    if (toDate) list = list.filter(b => b.booking_date <= toDate);

    return list
      .sort((a, b) => (a.booking_date + a.start_time).localeCompare(b.booking_date + b.start_time))
      .slice(0, limit);
  }

  let query = `
    SELECT b.*, s.title as service_title, s.price as service_price, s.duration_minutes as service_duration
    FROM bookings b
    LEFT JOIN services s ON b.service_id = s.id
    WHERE 1=1
  `;
  const params = [];

  if (date) { query += ' AND b.booking_date = ?'; params.push(date); }
  if (status) { query += ' AND b.status = ?'; params.push(status); }
  if (fromDate) { query += ' AND b.booking_date >= ?'; params.push(fromDate); }
  if (toDate) { query += ' AND b.booking_date <= ?'; params.push(toDate); }

  query += ' ORDER BY b.booking_date ASC, b.start_time ASC LIMIT ?';
  params.push(limit);

  return db.prepare(query).all(...params);
}

function getBookingById(id) {
  if (useMemoryStore) {
    const b = memStore.bookings.find(x => x.id === id);
    if (!b) return null;
    const s = memStore.services.find(srv => srv.id === b.service_id);
    return {
      ...b,
      service_title: s ? s.title : '',
      service_price: s ? s.price : 0,
      service_duration: s ? s.duration_minutes : 30
    };
  }
  return db.prepare(`
    SELECT b.*, s.title as service_title, s.price as service_price, s.duration_minutes as service_duration
    FROM bookings b
    LEFT JOIN services s ON b.service_id = s.id
    WHERE b.id = ?
  `).get(id) || null;
}

function checkBookingOverlap(bookingDate, startTime, endTime, excludeBookingId = null) {
  if (useMemoryStore) {
    return memStore.bookings.filter(b => 
      b.booking_date === bookingDate &&
      b.status === 'confirmed' &&
      b.start_time < endTime &&
      b.end_time > startTime &&
      (!excludeBookingId || b.id !== excludeBookingId)
    );
  }
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

function createBooking({ client_name, client_phone, service_id, booking_date, start_time, end_time, notes = '', status = 'confirmed' }) {
  if (useMemoryStore) {
    const conflicts = checkBookingOverlap(booking_date, start_time, end_time);
    if (conflicts.length > 0) {
      const err = new Error('Ushbu vaqt oralig‘i allaqachon band qilingan!');
      err.code = 'SLOT_OCCUPIED';
      err.conflict = conflicts[0];
      throw err;
    }
    const id = crypto.randomUUID();
    const item = {
      id,
      client_name,
      client_phone,
      service_id,
      booking_date,
      start_time,
      end_time,
      status,
      notes,
      created_at: new Date().toISOString()
    };
    memStore.bookings.push(item);
    return getBookingById(id);
  }

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
  if (useMemoryStore) {
    const b = memStore.bookings.find(x => x.id === id);
    if (!b) return null;
    b.status = status;
    return getBookingById(id);
  }
  db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, id);
  return getBookingById(id);
}

function deleteBooking(id) {
  if (useMemoryStore) {
    memStore.bookings = memStore.bookings.filter(x => x.id !== id);
    return { success: true };
  }
  db.prepare('DELETE FROM bookings WHERE id = ?').run(id);
  return { success: true };
}

function getDayStats(dateStr) {
  if (useMemoryStore) {
    const dayBookings = memStore.bookings.filter(b => b.booking_date === dateStr);
    let total = dayBookings.length;
    let confirmed = 0;
    let completed = 0;
    let cancelled = 0;
    let revenue = 0;

    dayBookings.forEach(b => {
      if (b.status === 'confirmed') confirmed++;
      if (b.status === 'completed') completed++;
      if (b.status === 'cancelled') cancelled++;
      if (b.status === 'confirmed' || b.status === 'completed') {
        const s = memStore.services.find(srv => srv.id === b.service_id);
        if (s) revenue += Number(s.price || 0);
      }
    });

    return { date: dateStr, total, confirmed, completed, cancelled, revenue };
  }

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

// ===============================================================
// TIZIM VA TELEGRAM SOZLAMALARI (SETTINGS)
// ===============================================================
function getSetting(key, defaultValue = '') {
  if (useMemoryStore) {
    return memStore.settings[key] !== undefined ? memStore.settings[key] : defaultValue;
  }
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : defaultValue;
}

function setSetting(key, value) {
  if (useMemoryStore) {
    memStore.settings[key] = value;
    return value;
  }
  db.prepare(`
    INSERT INTO settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
  return value;
}

function getAllSettings() {
  if (useMemoryStore) {
    return { ...memStore.settings };
  }
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const obj = {};
  rows.forEach(r => { obj[r.key] = r.value; });
  return obj;
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
  getDayStats,
  getSetting,
  setSetting,
  getAllSettings
};
