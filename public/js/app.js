// ===============================================================
// Barber Client WebApp & Telegram WebApp (TMA) Controller
// ===============================================================

const MONTHS_UZ = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
const DAYS_UZ = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Juma', 'Shan'];

const tg = window.Telegram?.WebApp;

const state = {
  services: [],
  selectedService: null,
  selectedDate: null,
  selectedSlot: null,
  isSubmitting: false,
  barberInfo: null
};

const elements = {
  headerBarberName: document.getElementById('headerBarberName'),
  servicesContainer: document.getElementById('servicesContainer'),
  datesContainer: document.getElementById('datesContainer'),
  slotsContainer: document.getElementById('slotsContainer'),
  clientName: document.getElementById('clientName'),
  clientPhone: document.getElementById('clientPhone'),
  clientNotes: document.getElementById('clientNotes'),
  tmaUserBadge: document.getElementById('tmaUserBadge'),
  summaryDetails: document.getElementById('summaryDetails'),
  summaryPrice: document.getElementById('summaryPrice'),
  btnBookNow: document.getElementById('btnBookNow'),
  ticketModal: document.getElementById('ticketModal'),
  btnCloseModal: document.getElementById('btnCloseModal'),
  toast: document.getElementById('toast'),
  ticketClientName: document.getElementById('ticketClientName'),
  ticketClientPhone: document.getElementById('ticketClientPhone'),
  ticketServiceTitle: document.getElementById('ticketServiceTitle'),
  ticketDate: document.getElementById('ticketDate'),
  ticketTime: document.getElementById('ticketTime'),
  ticketPrice: document.getElementById('ticketPrice')
};

function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

// ===============================================================
// Telegram WebApp Initsializatsiyasi
// ===============================================================
function initTMA() {
  if (tg) {
    tg.ready();
    tg.expand();

    const user = tg.initDataUnsafe?.user;
    if (user) {
      const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');
      if (fullName) {
        elements.clientName.value = fullName;
        elements.tmaUserBadge.style.display = 'inline';
      }
    }

    if (tg.themeParams?.bg_color) {
      document.documentElement.style.setProperty('--bg-main', tg.themeParams.bg_color);
    }
  }
}

function triggerHaptic(type = 'light') {
  if (tg?.HapticFeedback) {
    if (type === 'success') {
      tg.HapticFeedback.notificationOccurred('success');
    } else if (type === 'error') {
      tg.HapticFeedback.notificationOccurred('error');
    } else {
      tg.HapticFeedback.impactOccurred(type);
    }
  }
}

// ===============================================================
// Toast Bildirishnoma
// ===============================================================
let toastTimeout;
function showToast(message, type = 'info') {
  clearTimeout(toastTimeout);
  elements.toast.textContent = message;
  elements.toast.className = `toast show ${type}`;

  toastTimeout = setTimeout(() => {
    elements.toast.className = 'toast';
  }, 3500);
}

// ===============================================================
// Telefon Raqam Maskasi (+998 __ ___ __ __)
// ===============================================================
elements.clientPhone.addEventListener('input', (e) => {
  let val = e.target.value.replace(/\D/g, '');
  if (!val.startsWith('998')) {
    val = '998' + val;
  }
  val = val.substring(0, 12);

  let formatted = '+998';
  if (val.length > 3) formatted += ' ' + val.substring(3, 5);
  if (val.length > 5) formatted += ' ' + val.substring(5, 8);
  if (val.length > 8) formatted += ' ' + val.substring(8, 10);
  if (val.length > 10) formatted += ' ' + val.substring(10, 12);

  e.target.value = formatted;
  updateSummaryBar();
});

elements.clientName.addEventListener('input', updateSummaryBar);

// ===============================================================
// 1. Xizmatlarni Yuklash va Chizish
// ===============================================================
async function loadServices() {
  try {
    const res = await fetch('/api/services');
    const data = await res.json();

    if (data.success && data.services?.length) {
      state.services = data.services;
      renderServices();
      selectService(state.services[0].id);
    } else {
      elements.servicesContainer.innerHTML = `
        <div class="slots-empty-state">
          <div class="slots-empty-title">Xizmatlar topilmadi</div>
          <div>Hozircha faol xizmatlar mavjud emas.</div>
        </div>
      `;
    }
  } catch (err) {
    showToast('Xizmatlarni yuklashda xatolik yuz berdi', 'error');
  }
}

function renderServices() {
  elements.servicesContainer.innerHTML = state.services.map(service => {
    const isSelected = state.selectedService?.id === service.id;
    const formattedPrice = Number(service.price).toLocaleString('uz-UZ');

    return `
      <div class="service-card ${isSelected ? 'selected' : ''}" data-id="${service.id}">
        <div class="service-details">
          <div class="service-header-row">
            <span class="service-title">${escapeHtml(service.title)}</span>
          </div>
          ${service.description ? `<p class="service-desc">${escapeHtml(service.description)}</p>` : ''}
          <div class="service-meta">
            <span class="duration-pill">
              <i data-lucide="clock"></i>
              <span>${service.duration_minutes} daqiqa</span>
            </span>
          </div>
        </div>
        <div class="service-price-block">
          <div class="service-price">${formattedPrice}</div>
          <span class="price-currency">so‘m</span>
          <div class="select-indicator">
            <i data-lucide="check"></i>
          </div>
        </div>
      </div>
    `;
  }).join('');

  elements.servicesContainer.querySelectorAll('.service-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      selectService(id);
      triggerHaptic('light');
    });
  });

  refreshIcons();
}

function selectService(serviceId) {
  state.selectedService = state.services.find(s => s.id === serviceId);
  state.selectedSlot = null;
  renderServices();
  updateSummaryBar();
  loadSlots();
}

// ===============================================================
// 2. Sanalarni Generatsiya Qilish (14 kun)
// ===============================================================
function generateDates() {
  const dates = [];
  const today = new Date();

  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    dates.push({
      dateStr,
      dayNumber: d.getDate(),
      dayName: i === 0 ? 'Bugun' : i === 1 ? 'Ertaga' : DAYS_UZ[d.getDay()],
      monthName: MONTHS_UZ[d.getMonth()].substring(0, 3),
      isToday: i === 0
    });
  }

  elements.datesContainer.innerHTML = dates.map((item, index) => {
    const isSelected = index === 0;
    if (isSelected && !state.selectedDate) {
      state.selectedDate = item.dateStr;
    }

    return `
      <div class="date-chip ${isSelected ? 'selected' : ''}" data-date="${item.dateStr}">
        <span class="date-day-name">${item.dayName}</span>
        <span class="date-day-number">${item.dayNumber}</span>
        <span class="date-month">${item.monthName}</span>
        ${item.isToday ? '<span class="today-dot"></span>' : ''}
      </div>
    `;
  }).join('');

  elements.datesContainer.querySelectorAll('.date-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      elements.datesContainer.querySelectorAll('.date-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      state.selectedDate = chip.dataset.date;
      state.selectedSlot = null;
      triggerHaptic('light');
      updateSummaryBar();
      loadSlots();
    });
  });
}

// ===============================================================
// 3. Dinamik Slotlarni Yuklash (Slot Generator Algoritmi)
// ===============================================================
async function loadSlots() {
  if (!state.selectedService || !state.selectedDate) return;

  elements.slotsContainer.innerHTML = `
    <div class="slots-loading">
      <div class="spinner"></div>
      <span>Bo‘sh vaqtlar hisoblanmoqda...</span>
    </div>
  `;

  try {
    const url = `/api/slots?date=${state.selectedDate}&service_id=${state.selectedService.id}`;
    const res = await fetch(url);
    const result = await res.json();

    if (!result.success || !result.data?.isAvailable) {
      const reason = result.data?.reason || result.error || 'Bu kunda bo‘sh vaqt mavjud emas';
      elements.slotsContainer.innerHTML = `
        <div class="slots-empty-state off-day">
          <div class="slots-empty-icon">
            <i data-lucide="palmtree"></i>
          </div>
          <div class="slots-empty-title">Dam olish kuni</div>
          <div>${escapeHtml(reason)}</div>
        </div>
      `;
      state.selectedSlot = null;
      updateSummaryBar();
      refreshIcons();
      return;
    }

    const slots = result.data.slots || [];
    if (slots.length === 0) {
      elements.slotsContainer.innerHTML = `
        <div class="slots-empty-state">
          <div class="slots-empty-icon">
            <i data-lucide="clock-4"></i>
          </div>
          <div class="slots-empty-title">Barcha vaqtlar band</div>
          <div>Ushbu sana uchun barcha qulay slotlar to‘lgan. Iltimos, boshqa kunni tanlang.</div>
        </div>
      `;
      state.selectedSlot = null;
      updateSummaryBar();
      refreshIcons();
      return;
    }

    renderSlotsGrouped(slots);

  } catch (err) {
    elements.slotsContainer.innerHTML = `
      <div class="slots-empty-state">
        <div class="slots-empty-icon">
          <i data-lucide="alert-triangle"></i>
        </div>
        <div class="slots-empty-title">Xatolik</div>
        <div>Vaqtlarni yuklashda xatolik yuz berdi.</div>
      </div>
    `;
    refreshIcons();
  }
}

function renderSlotsGrouped(slots) {
  const morning = [];
  const afternoon = [];
  const evening = [];

  slots.forEach(slot => {
    const hour = parseInt(slot.start_time.split(':')[0], 10);
    if (hour < 12) {
      morning.push(slot);
    } else if (hour < 17) {
      afternoon.push(slot);
    } else {
      evening.push(slot);
    }
  });

  let html = '<div class="slots-groups">';

  if (morning.length > 0) {
    html += `
      <div class="slot-group">
        <div class="slot-group-header">
          <i data-lucide="sun-medium"></i>
          <span>Ertalab (${morning.length} ta bo‘sh)</span>
        </div>
        <div class="slots-grid">
          ${morning.map(s => renderSlotButton(s)).join('')}
        </div>
      </div>
    `;
  }

  if (afternoon.length > 0) {
    html += `
      <div class="slot-group">
        <div class="slot-group-header">
          <i data-lucide="sun"></i>
          <span>Tushdan keyin (${afternoon.length} ta bo‘sh)</span>
        </div>
        <div class="slots-grid">
          ${afternoon.map(s => renderSlotButton(s)).join('')}
        </div>
      </div>
    `;
  }

  if (evening.length > 0) {
    html += `
      <div class="slot-group">
        <div class="slot-group-header">
          <i data-lucide="moon"></i>
          <span>Kechqurun (${evening.length} ta bo‘sh)</span>
        </div>
        <div class="slots-grid">
          ${evening.map(s => renderSlotButton(s)).join('')}
        </div>
      </div>
    `;
  }

  html += '</div>';
  elements.slotsContainer.innerHTML = html;

  elements.slotsContainer.querySelectorAll('.slot-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      elements.slotsContainer.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');

      state.selectedSlot = {
        start_time: btn.dataset.start,
        end_time: btn.dataset.end
      };

      triggerHaptic('medium');
      updateSummaryBar();
    });
  });

  refreshIcons();
}

function renderSlotButton(slot) {
  const isSelected = state.selectedSlot?.start_time === slot.start_time;
  return `
    <button type="button" class="slot-btn ${isSelected ? 'selected' : ''}" 
            data-start="${slot.start_time}" 
            data-end="${slot.end_time}">
      <span class="slot-time">${slot.start_time}</span>
      <span class="slot-end">${slot.end_time} gacha</span>
    </button>
  `;
}

// ===============================================================
// 4. Pastki Xulosa Qatori (Sticky Summary Bar)
// ===============================================================
function updateSummaryBar() {
  const nameFilled = elements.clientName.value.trim().length > 1;
  const phoneClean = elements.clientPhone.value.replace(/\D/g, '');
  const phoneFilled = phoneClean.length === 12;

  if (state.selectedService) {
    const formattedPrice = Number(state.selectedService.price).toLocaleString('uz-UZ');
    elements.summaryPrice.textContent = `${formattedPrice} so‘m`;
  } else {
    elements.summaryPrice.textContent = '0 so‘m';
  }

  if (state.selectedService && state.selectedSlot && state.selectedDate) {
    elements.summaryDetails.textContent = `${state.selectedDate} • ${state.selectedSlot.start_time} - ${state.selectedSlot.end_time}`;
  } else if (state.selectedService) {
    elements.summaryDetails.textContent = `${state.selectedService.title} tanlandi`;
  } else {
    elements.summaryDetails.textContent = 'Xizmat va vaqt tanlang';
  }

  const canBook = (
    state.selectedService &&
    state.selectedDate &&
    state.selectedSlot &&
    nameFilled &&
    phoneFilled &&
    !state.isSubmitting
  );

  elements.btnBookNow.disabled = !canBook;
}

// ===============================================================
// 5. Bron Qilish (Booking Submission & Overlap Protection)
// ===============================================================
elements.btnBookNow.addEventListener('click', async () => {
  if (state.isSubmitting) return;

  const client_name = elements.clientName.value.trim();
  const client_phone = elements.clientPhone.value.trim();
  const notes = elements.clientNotes.value.trim();

  if (!client_name) {
    showToast('Iltimos, ismingizni kiriting!', 'error');
    elements.clientName.focus();
    return;
  }

  const digits = client_phone.replace(/\D/g, '');
  if (digits.length < 12) {
    showToast('Iltimos, telefon raqamingizni to‘liq kiriting!', 'error');
    elements.clientPhone.focus();
    return;
  }

  if (!state.selectedSlot) {
    showToast('Iltimos, qulay soatni (slot) tanlang!', 'error');
    return;
  }

  state.isSubmitting = true;
  elements.btnBookNow.disabled = true;
  elements.btnBookNow.innerHTML = `<span>Bron qilinmoqda...</span>`;

  try {
    const response = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name,
        client_phone,
        service_id: state.selectedService.id,
        booking_date: state.selectedDate,
        start_time: state.selectedSlot.start_time,
        notes
      })
    });

    const result = await response.json();

    if (response.status === 201 && result.success) {
      triggerHaptic('success');
      showSuccessTicket(result.booking);
      loadSlots();
    } else if (response.status === 409) {
      triggerHaptic('error');
      showToast(result.error, 'error');
      state.selectedSlot = null;
      loadSlots();
    } else {
      triggerHaptic('error');
      showToast(result.error || 'Xatolik yuz berdi. Qayta urinib ko‘ring.', 'error');
    }

  } catch (err) {
    triggerHaptic('error');
    showToast('Server bilan aloqa uzildi. Iltimos, qayta urinib ko‘ring.', 'error');
  } finally {
    state.isSubmitting = false;
    elements.btnBookNow.innerHTML = `<span>Band qilish</span><i data-lucide="scissors"></i>`;
    refreshIcons();
    updateSummaryBar();
  }
});

// ===============================================================
// 6. Muvaffaqiyat Modali (Chipta / Ticket)
// ===============================================================
function showSuccessTicket(booking) {
  elements.ticketClientName.textContent = booking.client_name;
  elements.ticketClientPhone.textContent = booking.client_phone;
  elements.ticketServiceTitle.textContent = `${booking.service_title} (${booking.service_duration} daq)`;
  elements.ticketDate.textContent = booking.booking_date;
  elements.ticketTime.textContent = `${booking.start_time} - ${booking.end_time}`;
  elements.ticketPrice.textContent = `${Number(booking.service_price || 0).toLocaleString('uz-UZ')} so‘m`;

  elements.ticketModal.classList.add('active');
  refreshIcons();
}

elements.btnCloseModal.addEventListener('click', () => {
  elements.ticketModal.classList.remove('active');
  state.selectedSlot = null;
  elements.clientNotes.value = '';
  updateSummaryBar();
  loadSlots();
});

// Barber Info yuklash
async function loadBarberInfo() {
  try {
    const res = await fetch('/api/info');
    const data = await res.json();
    if (data.success) {
      state.barberInfo = data;
      elements.headerBarberName.textContent = data.barber_name;
    }
  } catch (e) {}
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[m]);
}

document.addEventListener('DOMContentLoaded', () => {
  initTMA();
  loadBarberInfo();
  loadServices();
  generateDates();
  refreshIcons();
});
