const db = require('../db/database');

/**
 * Vaqt satrini daqiqalarga aylantirish ('09:30' -> 570)
 */
function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Daqiqalarni vaqt satriga aylantirish (570 -> '09:30')
 */
function minutesToTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Berilgan sananing haftaning qaysi kuniga to'g'ri kelishini hisoblash
 * 1 = Dushanba, ..., 7 = Yakshanba
 */
function getDayOfWeek(dateStr) {
  // YYYY-MM-DD
  const date = new Date(dateStr + 'T00:00:00');
  const jsDay = date.getDay(); // 0 = Yakshanba, 1 = Dushanba, ...
  return jsDay === 0 ? 7 : jsDay;
}

/**
 * O'zbekiston / Server vaqti bo'yicha bugungi sana va ayni paytdagi daqiqani olish
 */
function getNowLocal(timezone = 'Asia/Tashkent') {
  try {
    const now = new Date();
    const formatterDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const dateStr = formatterDate.format(now); // 'YYYY-MM-DD'

    const formatterTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const timeStr = formatterTime.format(now); // 'HH:MM'
    const currentMinutes = timeToMinutes(timeStr);

    return { dateStr, timeStr, currentMinutes };
  } catch (e) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    return { dateStr, timeStr: minutesToTime(currentMinutes), currentMinutes };
  }
}

/**
 * Ikki vaqt oralig'ining kesishishini (overlap) tekshirish
 * Formula: startA < endB AND endA > startB
 */
function isOverlapping(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

/**
 * TZ Bo'yicha Bo'sh Slotlarni Generatsiya Qilish Algoritmi
 * 
 * @param {string} dateStr - 'YYYY-MM-DD'
 * @param {string} serviceId - Xizmat ID si
 * @param {object} options - qo'shimcha parametrlar
 * @returns {object} { isAvailable: boolean, message?: string, slots: Array, workHours: object }
 */
function generateAvailableSlots(dateStr, serviceId, options = {}) {
  const service = db.getServiceById(serviceId);
  if (!service) {
    throw new Error('Tanlangan xizmat topilmadi!');
  }

  const durationMinutes = Number(service.duration_minutes);
  const stepMinutes = Number(options.stepMinutes || process.env.SLOT_STEP_MINUTES || 30);
  const bufferMinutes = Number(options.bufferMinutes || process.env.BOOKING_BUFFER_MINUTES || 15);
  const timezone = process.env.TIMEZONE || 'Asia/Tashkent';

  // 1. Maxsus dam olish kuni tekshiruvi (special_off_days)
  const specialOffDay = db.getSpecialOffDay(dateStr);
  if (specialOffDay) {
    return {
      isAvailable: false,
      reason: specialOffDay.reason || 'Dam olish kuni',
      date: dateStr,
      service,
      slots: []
    };
  }

  // 2. Haftaning kuni va ish jadvalini olish
  const dayOfWeek = getDayOfWeek(dateStr);
  const schedule = db.getWorkScheduleForDay(dayOfWeek);

  if (!schedule || !schedule.is_working_day) {
    return {
      isAvailable: false,
      reason: 'Sartaroshxona bu kuni ishlamaydi (Dam olish kuni)',
      date: dateStr,
      dayOfWeek,
      service,
      slots: []
    };
  }

  const workStartMin = timeToMinutes(schedule.work_start);
  const workEndMin = timeToMinutes(schedule.work_end);
  const breakStartMin = schedule.break_start ? timeToMinutes(schedule.break_start) : null;
  const breakEndMin = schedule.break_end ? timeToMinutes(schedule.break_end) : null;

  // 3. Ushbu sanadagi faol bronlarni olish (status = 'confirmed')
  const existingBookings = db.getBookings({ date: dateStr, status: 'confirmed' });
  
  // Bronlarni daqiqa intervallariga o'giramiz
  const bookedIntervals = existingBookings.map(b => ({
    id: b.id,
    client: b.client_name,
    start: timeToMinutes(b.start_time),
    end: timeToMinutes(b.end_time)
  }));

  // 4. Bugungi kun tekshiruvi va o'tmishdagi vaqtlarni aniqlash
  const { dateStr: todayStr, currentMinutes: nowMinutes } = getNowLocal(timezone);
  const isToday = (dateStr === todayStr);
  const isPastDate = (dateStr < todayStr);

  if (isPastDate) {
    return {
      isAvailable: false,
      reason: 'O‘tib ketgan sanaga bron qilib bo‘lmaydi',
      date: dateStr,
      service,
      slots: []
    };
  }

  // 5. Slotlarni ketma-ket generatsiya qilish
  const slots = [];
  const candidateStep = Math.min(stepMinutes, durationMinutes);

  for (let slotStart = workStartMin; slotStart + durationMinutes <= workEndMin; slotStart += candidateStep) {
    const slotEnd = slotStart + durationMinutes;

    // A. Bugungi kun bo'lsa va ayni paytdan o'tib ketgan bo'lsa (buffer bilan)
    if (isToday && slotStart <= (nowMinutes + bufferMinutes)) {
      continue;
    }

    // B. Tanaffus bilan to'qnashuv (Break overlap)
    // slot_start < break_end AND slot_end > break_start
    if (breakStartMin !== null && breakEndMin !== null) {
      if (isOverlapping(slotStart, slotEnd, breakStartMin, breakEndMin)) {
        continue;
      }
    }

    // C. Mavjud faol bronlar bilan to'qnashuv (Bookings overlap)
    // slot_start < booking_end AND slot_end > booking_start
    let hasConflict = false;
    for (const booking of bookedIntervals) {
      if (isOverlapping(slotStart, slotEnd, booking.start, booking.end)) {
        hasConflict = true;
        break;
      }
    }

    if (hasConflict) {
      continue;
    }

    // Vaqt oralig'i to'liq mos keldi! Bo'sh slot sifatida qo'shamiz
    slots.push({
      start_time: minutesToTime(slotStart),
      end_time: minutesToTime(slotEnd),
      duration_minutes: durationMinutes,
      display_time: `${minutesToTime(slotStart)} - ${minutesToTime(slotEnd)}`
    });
  }

  return {
    isAvailable: true,
    date: dateStr,
    dayOfWeek,
    isToday,
    service,
    workSchedule: {
      work_start: schedule.work_start,
      work_end: schedule.work_end,
      break_start: schedule.break_start,
      break_end: schedule.break_end
    },
    slotsCount: slots.length,
    slots
  };
}

module.exports = {
  timeToMinutes,
  minutesToTime,
  getDayOfWeek,
  getNowLocal,
  isOverlapping,
  generateAvailableSlots
};
