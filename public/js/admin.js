// ===============================================================
// Barber Admin Dashboard Controller (Optimized & Vector Icons)
// ===============================================================

let currentPin = sessionStorage.getItem('barber_admin_pin') || '';
let currentServices = [];
let allBookingsCache = [];
let todayDateStr = '';

const DAY_NAMES = {
  1: 'Dushanba',
  2: 'Seshanba',
  3: 'Chorshanba',
  4: 'Payshanba',
  5: 'Juma',
  6: 'Shanba',
  7: 'Yakshanba'
};

function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

// ===============================================================
// TOAST BILDIRISHNOMA
// ===============================================================
let toastTimer;
function showAdminToast(message, type = 'success') {
  clearTimeout(toastTimer);
  const toast = document.getElementById('adminToast');
  const msgSpan = document.getElementById('adminToastMsg');
  if (!toast || !msgSpan) return;

  msgSpan.textContent = message;
  toast.className = `admin-toast show ${type}`;

  const iconName = type === 'success' ? 'check-circle-2' : 'alert-circle';
  toast.innerHTML = `<i data-lucide="${iconName}"></i> <span>${escapeHtml(message)}</span>`;
  refreshIcons();

  toastTimer = setTimeout(() => {
    toast.className = 'admin-toast';
  }, 3200);
}

// ===============================================================
// PIN VA AUTHENTICATION
// ===============================================================
const pinLockScreen = document.getElementById('pinLockScreen');
const adminApp = document.getElementById('adminApp');
const pinForm = document.getElementById('pinForm');
const pinInput = document.getElementById('pinInput');
const btnLogout = document.getElementById('btnLogout');

pinForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const enteredPin = pinInput.value.trim();
  
  try {
    const res = await fetch('/api/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: enteredPin })
    });
    const data = await res.json();

    if (data.success) {
      currentPin = enteredPin;
      sessionStorage.setItem('barber_admin_pin', currentPin);
      unlockAdmin();
      showAdminToast('Tizimga muvaffaqiyatli kirildi');
    } else {
      showAdminToast('Noto‘g‘ri PIN kod! Qayta urinib ko‘ring.', 'error');
      pinInput.value = '';
      pinInput.focus();
    }
  } catch (err) {
    showAdminToast('Server bilan aloqa xatosi', 'error');
  }
});

btnLogout.addEventListener('click', () => {
  sessionStorage.removeItem('barber_admin_pin');
  currentPin = '';
  location.reload();
});

async function checkSavedAuth() {
  if (currentPin) {
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: currentPin })
      });
      const data = await res.json();
      if (data.success) {
        unlockAdmin();
        return;
      }
    } catch (e) {}
  }
  pinLockScreen.classList.remove('hidden');
  adminApp.style.display = 'none';
  refreshIcons();
}

function unlockAdmin() {
  pinLockScreen.classList.add('hidden');
  adminApp.style.display = 'flex';
  initDashboard();
}

// Admin API so'rovlar uchun yordamchi
async function adminFetch(url, options = {}) {
  options.headers = {
    ...options.headers,
    'x-admin-pin': currentPin
  };
  const res = await fetch(url, options);
  if (res.status === 401) {
    sessionStorage.removeItem('barber_admin_pin');
    location.reload();
    throw new Error('Unauthorized');
  }
  return res.json();
}

// ===============================================================
// DASHBOARD INITIALIZATION
// ===============================================================
async function initDashboard() {
  const infoRes = await fetch('/api/info');
  const info = await infoRes.json();
  if (info.success) {
    todayDateStr = info.current_date;
    document.getElementById('currentDateDisplay').textContent = `${todayDateStr} • ${info.current_time}`;
    document.getElementById('sidebarBarberName').textContent = info.barber_name;
    document.getElementById('filterDate').value = todayDateStr;
    document.getElementById('manualDate').value = todayDateStr;
    document.getElementById('blockDate').value = todayDateStr;
    document.getElementById('offDayDate').value = todayDateStr;
  }

  setupTabs();
  setupModals();
  setupSearchFilter();
  setupTelegramSettingsHandlers();
  setupMobileMenu();
  await loadServicesForDropdown();
  await loadTodayDashboard();
  refreshIcons();
}

// ===============================================================
// TAB BOSHQARUVI
// ===============================================================
function setupTabs() {
  const tabs = document.querySelectorAll('.nav-item');
  const titleMap = {
    today: 'Bugungi Navbatlar (Kunlik Jadval)',
    allBookings: 'Barcha Bronlar Jurnali',
    schedule: 'Haftalik Ish Jadvali va Tanaffuslar',
    offDays: 'Maxsus Dam Olish Kunlari',
    services: 'Xizmatlar va Narxlar',
    notifications: 'Telegram Bildirishnomalari',
    telegramSettings: 'Telegram Bot va Xabarnoma Sozlamalari'
  };

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const target = tab.dataset.tab;
      document.getElementById('pageTitle').textContent = titleMap[target] || 'Boshqaruv';

      document.querySelectorAll('.tab-pane').forEach(p => p.style.display = 'none');
      
      if (target === 'today') {
        document.getElementById('tabToday').style.display = 'block';
        loadTodayDashboard();
      } else if (target === 'allBookings') {
        document.getElementById('tabAllBookings').style.display = 'block';
        loadAllBookings();
      } else if (target === 'schedule') {
        document.getElementById('tabSchedule').style.display = 'block';
        loadWorkSchedule();
      } else if (target === 'offDays') {
        document.getElementById('tabOffDays').style.display = 'block';
        loadOffDays();
      } else if (target === 'services') {
        document.getElementById('tabServices').style.display = 'block';
        loadAdminServices();
      } else if (target === 'notifications') {
        document.getElementById('tabNotifications').style.display = 'block';
        loadNotifications();
      } else if (target === 'telegramSettings') {
        document.getElementById('tabTelegramSettings').style.display = 'block';
        loadTelegramSettings();
      }
      refreshIcons();
    });
  });

  document.getElementById('btnRefreshToday').addEventListener('click', loadTodayDashboard);
  document.getElementById('btnFilterBookings').addEventListener('click', loadAllBookings);
  document.getElementById('btnRefreshNotifs').addEventListener('click', loadNotifications);
}

// Qidiruv filtri
function setupSearchFilter() {
  const searchInput = document.getElementById('searchClientInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      if (!allBookingsCache.length) return;

      const filtered = allBookingsCache.filter(b => 
        (b.client_name && b.client_name.toLowerCase().includes(q)) ||
        (b.client_phone && b.client_phone.includes(q)) ||
        (b.service_title && b.service_title.toLowerCase().includes(q))
      );

      const tbody = document.getElementById('allBookingsList');
      if (filtered.length) {
        tbody.innerHTML = filtered.map(b => renderBookingRow(b, true)).join('');
        attachBookingActions(tbody);
      } else {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align: center; padding: 30px; color: var(--text-muted);">
              "${escapeHtml(q)}" bo‘yicha hech qanday bron topilmadi.
            </td>
          </tr>
        `;
      }
      refreshIcons();
    });
  }
}

// ===============================================================
// 1. BUGUNGI JADVAL & STATISTIKA
// ===============================================================
async function loadTodayDashboard() {
  try {
    const statsData = await adminFetch(`/api/admin/stats?date=${todayDateStr}`);
    if (statsData.success) {
      const s = statsData.stats;
      document.getElementById('statTodayTotal').textContent = s.total;
      document.getElementById('statTodayConfirmed').textContent = s.confirmed;
      document.getElementById('statTodayCompleted').textContent = s.completed;
      document.getElementById('statTodayRevenue').textContent = `${Number(s.revenue).toLocaleString('uz-UZ')} so‘m`;
    }

    const bookingsData = await adminFetch(`/api/admin/bookings?date=${todayDateStr}`);
    const tbody = document.getElementById('todayBookingsList');

    if (bookingsData.success && bookingsData.bookings?.length) {
      tbody.innerHTML = bookingsData.bookings.map(b => renderBookingRow(b, false)).join('');
      attachBookingActions(tbody);
    } else {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">
            <div style="font-size: 15px; font-weight: 600; margin-bottom: 4px; color: var(--text-secondary);">Bugun uchun bronlar mavjud emas</div>
            <div style="font-size: 12.5px;">Barcha soatlar bo‘sh yoki yangi buyurtmalar kutilmoqda.</div>
          </td>
        </tr>
      `;
    }
    refreshIcons();
  } catch (err) {
    console.error('Error loading today dashboard:', err);
  }
}

// ===============================================================
// 2. BARCHA BRONLAR RO'YXATI
// ===============================================================
async function loadAllBookings() {
  const date = document.getElementById('filterDate').value;
  const status = document.getElementById('filterStatus').value;
  
  let url = '/api/admin/bookings?';
  if (date) url += `date=${date}&`;
  if (status) url += `status=${status}&`;

  try {
    const data = await adminFetch(url);
    const tbody = document.getElementById('allBookingsList');

    if (data.success && data.bookings?.length) {
      allBookingsCache = data.bookings;
      tbody.innerHTML = data.bookings.map(b => renderBookingRow(b, true)).join('');
      attachBookingActions(tbody);
    } else {
      allBookingsCache = [];
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">
            Tanlangan parametrlar bo‘yicha bronlar topilmadi.
          </td>
        </tr>
      `;
    }
    refreshIcons();
  } catch (err) {
    console.error('Error loading all bookings:', err);
  }
}

function getInitials(name) {
  if (!name) return 'M';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

function renderBookingRow(b, showDate = false) {
  const formattedPrice = b.service_price ? Number(b.service_price).toLocaleString('uz-UZ') : '-';
  const initials = getInitials(b.client_name);

  return `
    <tr data-id="${b.id}">
      ${showDate ? `<td><b>${b.booking_date}</b></td>` : ''}
      <td>
        <div class="time-badge">
          <span class="start">${b.start_time}</span>
          <span>-</span>
          <span>${b.end_time}</span>
        </div>
      </td>
      <td>
        <div class="client-cell">
          <div class="client-avatar">${initials}</div>
          <div>
            <div class="client-name-text">${escapeHtml(b.client_name)}</div>
            ${b.notes ? `<div class="client-notes-text">${escapeHtml(b.notes)}</div>` : ''}
          </div>
        </div>
      </td>
      <td>
        ${b.client_phone !== '-' ? `
          <a href="tel:${b.client_phone.replace(/\s+/g, '')}" class="phone-link">
            <i data-lucide="phone"></i>
            <span>${b.client_phone}</span>
          </a>
        ` : '-'}
      </td>
      <td>${escapeHtml(b.service_title || '-')}</td>
      ${!showDate ? `<td><b style="color: var(--gold-light);">${formattedPrice} so‘m</b></td>` : ''}
      <td>
        <span class="status-badge ${b.status}">
          <span class="badge-dot"></span>
          <span>${b.status === 'confirmed' ? 'Tasdiqlangan' : b.status === 'completed' ? 'Yakunlandi' : 'Bekor qilingan'}</span>
        </span>
      </td>
      <td>
        <div class="action-buttons">
          ${b.status === 'confirmed' ? `
            <button type="button" class="btn-table-action complete btn-complete" title="Mijoz keldi va yakunlandi">
              <i data-lucide="check"></i>
              <span>Keldi</span>
            </button>
            <button type="button" class="btn-table-action cancel btn-cancel" title="Bronni bekor qilish">
              <i data-lucide="x"></i>
              <span>Bekor</span>
            </button>
          ` : `
            <button type="button" class="btn-table-action complete btn-restore" title="Qayta tasdiqlash">
              <i data-lucide="rotate-ccw"></i>
              <span>Qaytarish</span>
            </button>
          `}
        </div>
      </td>
    </tr>
  `;
}

function attachBookingActions(container) {
  container.querySelectorAll('.btn-complete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const tr = e.target.closest('tr');
      const id = tr.dataset.id;
      await updateBookingStatus(id, 'completed');
    });
  });

  container.querySelectorAll('.btn-cancel').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      if (confirm('Rostdan ham ushbu bronni bekor qilmoqchimisiz? Ushbu slot yana bo‘shatiladi.')) {
        const tr = e.target.closest('tr');
        const id = tr.dataset.id;
        await updateBookingStatus(id, 'cancelled');
      }
    });
  });

  container.querySelectorAll('.btn-restore').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const tr = e.target.closest('tr');
      const id = tr.dataset.id;
      await updateBookingStatus(id, 'confirmed');
    });
  });
}

async function updateBookingStatus(id, status) {
  try {
    const res = await adminFetch(`/api/admin/bookings/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (res.success) {
      showAdminToast(`Bron holati: ${status === 'completed' ? 'Yakunlandi' : status === 'cancelled' ? 'Bekor qilindi' : 'Qayta tasdiqlandi'}`);
      loadTodayDashboard();
      loadAllBookings();
    }
  } catch (err) {
    showAdminToast('Xatolik: ' + err.message, 'error');
  }
}

// ===============================================================
// 3. ISH JADVALI (WORK SCHEDULE - IOS SWITCH)
// ===============================================================
async function loadWorkSchedule() {
  try {
    const res = await adminFetch('/api/admin/work-schedule');
    const tbody = document.getElementById('workScheduleList');

    if (res.success && res.schedule) {
      tbody.innerHTML = res.schedule.map(s => `
        <tr data-day="${s.day_of_week}">
          <td>
            <div style="font-weight: 700; font-size: 14.5px;">${DAY_NAMES[s.day_of_week]}</div>
          </td>
          <td>
            <label class="switch">
              <input type="checkbox" class="schedule-is-work" ${s.is_working_day ? 'checked' : ''}>
              <span class="slider"></span>
            </label>
          </td>
          <td>
            <input type="time" class="filter-input schedule-start" value="${s.work_start}" style="padding: 6px 10px;">
          </td>
          <td>
            <input type="time" class="filter-input schedule-end" value="${s.work_end}" style="padding: 6px 10px;">
          </td>
          <td>
            <div style="display: flex; gap: 6px; align-items: center;">
              <input type="time" class="filter-input schedule-bstart" value="${s.break_start || ''}" style="padding: 6px 8px;">
              <span style="color: var(--text-muted);">-</span>
              <input type="time" class="filter-input schedule-bend" value="${s.break_end || ''}" style="padding: 6px 8px;">
            </div>
          </td>
          <td>
            <button type="button" class="btn-primary btn-save-schedule" style="padding: 7px 14px; font-size: 12.5px;">
              <i data-lucide="save"></i>
              <span>Saqlash</span>
            </button>
          </td>
        </tr>
      `).join('');

      tbody.querySelectorAll('.btn-save-schedule').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const tr = e.target.closest('tr');
          const day = tr.dataset.day;
          const is_working_day = tr.querySelector('.schedule-is-work').checked;
          const work_start = tr.querySelector('.schedule-start').value;
          const work_end = tr.querySelector('.schedule-end').value;
          const break_start = tr.querySelector('.schedule-bstart').value || null;
          const break_end = tr.querySelector('.schedule-bend').value || null;

          try {
            await adminFetch(`/api/admin/work-schedule/${day}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ is_working_day, work_start, work_end, break_start, break_end })
            });
            showAdminToast(`${DAY_NAMES[day]} ish jadvali saqlandi!`);
          } catch (err) {
            showAdminToast('Xatolik: ' + err.message, 'error');
          }
        });
      });
      refreshIcons();
    }
  } catch (err) {
    console.error('Error loading schedule:', err);
  }
}

// ===============================================================
// 4. MAXSUS DAM OLISH KUNLARI (OFF-DAYS)
// ===============================================================
async function loadOffDays() {
  try {
    const res = await adminFetch('/api/admin/special-days');
    const tbody = document.getElementById('offDaysList');

    if (res.success && res.days?.length) {
      tbody.innerHTML = res.days.map(d => `
        <tr data-date="${d.off_date}">
          <td>
            <span class="status-badge cancelled">
              <i data-lucide="calendar"></i>
              <span><b>${d.off_date}</b></span>
            </span>
          </td>
          <td>
            <span style="font-weight: 500;">${escapeHtml(d.reason || 'Dam olish kuni')}</span>
          </td>
          <td>
            <button type="button" class="btn-table-action cancel btn-delete-offday">
              <i data-lucide="trash-2"></i>
              <span>O‘chirish</span>
            </button>
          </td>
        </tr>
      `).join('');

      tbody.querySelectorAll('.btn-delete-offday').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const tr = e.target.closest('tr');
          const date = tr.dataset.date;
          if (confirm(`${date} dam olish kunini o‘chirmoqchimisiz?`)) {
            await adminFetch(`/api/admin/special-days/${date}`, { method: 'DELETE' });
            showAdminToast(`${date} dam olish kuni bekor qilindi`);
            loadOffDays();
          }
        });
      });
    } else {
      tbody.innerHTML = `
        <tr>
          <td colspan="3" style="text-align: center; padding: 30px; color: var(--text-muted);">
            Hozircha maxsus dam olish kunlari belgilanmagan.
          </td>
        </tr>
      `;
    }
    refreshIcons();
  } catch (err) {
    console.error('Error loading off-days:', err);
  }
}

// ===============================================================
// 5. XIZMATLAR BOSHQARUVI (SERVICES)
// ===============================================================
async function loadAdminServices() {
  try {
    const res = await adminFetch('/api/admin/services');
    const tbody = document.getElementById('servicesList');

    if (res.success && res.services?.length) {
      currentServices = res.services;
      tbody.innerHTML = res.services.map(s => `
        <tr data-id="${s.id}">
          <td>
            <div style="font-weight: 700; font-size: 14.5px; color: var(--text-primary);">${escapeHtml(s.title)}</div>
          </td>
          <td>
            <b style="color: var(--gold-light); font-size: 15px;">${Number(s.price).toLocaleString('uz-UZ')} so‘m</b>
          </td>
          <td>
            <span class="status-badge" style="background: rgba(255,255,255,0.05); color: var(--text-secondary); border: 1px solid var(--border);">
              <i data-lucide="clock"></i>
              <span>${s.duration_minutes} daqiqa</span>
            </span>
          </td>
          <td style="color: var(--text-muted); font-size: 13px; max-width: 250px;">
            ${escapeHtml(s.description || '-')}
          </td>
          <td>
            <span class="status-badge ${s.is_active ? 'confirmed' : 'cancelled'}">
              <span class="badge-dot"></span>
              <span>${s.is_active ? 'Faol' : 'Nofaol'}</span>
            </span>
          </td>
          <td>
            <div class="action-buttons">
              <button type="button" class="btn-table-action complete btn-edit-service">
                <i data-lucide="edit-3"></i>
                <span>Tahrirlash</span>
              </button>
              <button type="button" class="btn-table-action cancel btn-delete-service">
                <i data-lucide="trash-2"></i>
                <span>O‘chirish</span>
              </button>
            </div>
          </td>
        </tr>
      `).join('');

      attachServiceActions(tbody);
    }
    refreshIcons();
  } catch (err) {
    console.error('Error loading services:', err);
  }
}

function attachServiceActions(container) {
  container.querySelectorAll('.btn-edit-service').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.closest('tr').dataset.id;
      const service = currentServices.find(s => s.id === id);
      if (service) {
        document.getElementById('serviceModalTitle').textContent = 'Xizmatni Tahrirlash';
        document.getElementById('serviceId').value = service.id;
        document.getElementById('serviceTitle').value = service.title;
        document.getElementById('servicePrice').value = service.price;
        document.getElementById('serviceDuration').value = service.duration_minutes;
        document.getElementById('serviceDesc').value = service.description || '';
        document.getElementById('serviceModal').classList.add('active');
        refreshIcons();
      }
    });
  });

  container.querySelectorAll('.btn-delete-service').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.closest('tr').dataset.id;
      if (confirm('Ushbu xizmatni o‘chirmoqchimisiz?')) {
        await adminFetch(`/api/admin/services/${id}`, { method: 'DELETE' });
        showAdminToast('Xizmat o‘chirildi');
        loadAdminServices();
        loadServicesForDropdown();
      }
    });
  });
}

async function loadServicesForDropdown() {
  const res = await fetch('/api/services');
  const data = await res.json();
  if (data.success && data.services) {
    currentServices = data.services;
    const select = document.getElementById('manualServiceSelect');
    select.innerHTML = data.services.map(s => `
      <option value="${s.id}">${s.title} (${s.duration_minutes} daq) — ${Number(s.price).toLocaleString('uz-UZ')} so‘m</option>
    `).join('');
  }
}

// ===============================================================
// 6. TELEGRAM BILDIRISHNOMALARI
// ===============================================================
async function loadNotifications() {
  try {
    const res = await adminFetch('/api/admin/notifications');
    const container = document.getElementById('notificationsList');

    if (res.success && res.notifications?.length) {
      container.innerHTML = res.notifications.map(n => `
        <div class="notif-item">
          <div class="notif-icon-wrap">
            <i data-lucide="send"></i>
          </div>
          <div class="notif-body">
            <div class="notif-header">
              <div class="notif-title">Yangi Bron: ${escapeHtml(n.client_name)} (${escapeHtml(n.client_phone)})</div>
              <div class="notif-time">${new Date(n.time).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })} • ${new Date(n.time).toLocaleDateString('uz-UZ')}</div>
            </div>
            <div class="notif-desc">
              <b>${escapeHtml(n.service_title)}</b> • 📅 ${n.booking_date} • ⏰ ${n.start_time} - ${n.end_time} • 💰 ${Number(n.price || 0).toLocaleString('uz-UZ')} so‘m
            </div>
          </div>
        </div>
      `).join('');
    } else {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-muted);">
          <div style="font-size: 15px; font-weight: 600; margin-bottom: 4px; color: var(--text-secondary);">Hozircha xabarnomalar mavjud emas</div>
          <div style="font-size: 12.5px;">Yangi bronlar yaratilganda shu yerda va Telegramda avtomatik aks etadi.</div>
        </div>
      `;
    }
    refreshIcons();
  } catch (err) {
    console.error('Error loading notifications:', err);
  }
}

// ===============================================================
// MODALLARNI SOZLASH
// ===============================================================
function setupModals() {
  document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-modal-overlay').forEach(m => m.classList.remove('active'));
    });
  });

  // 1. Qo'lda mijoz qo'shish modalini ochish
  document.getElementById('btnOpenManualModal').addEventListener('click', () => {
    document.getElementById('manualBookingModal').classList.add('active');
    refreshIcons();
  });

  document.getElementById('manualBookingForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const client_name = document.getElementById('manualClientName').value.trim();
    const client_phone = document.getElementById('manualClientPhone').value.trim();
    const service_id = document.getElementById('manualServiceSelect').value;
    const booking_date = document.getElementById('manualDate').value;
    const start_time = document.getElementById('manualStartTime').value;
    const notes = document.getElementById('manualNotes').value.trim();

    try {
      const res = await adminFetch('/api/admin/bookings/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_name, client_phone, service_id, booking_date, start_time, notes })
      });

      if (res.success) {
        showAdminToast('Mijoz navbatga muvaffaqiyatli qo‘shildi!');
        document.getElementById('manualBookingModal').classList.remove('active');
        document.getElementById('manualBookingForm').reset();
        loadTodayDashboard();
        loadAllBookings();
      } else {
        showAdminToast(res.error || 'Xatolik yuz berdi', 'error');
      }
    } catch (err) {
      showAdminToast(err.message || 'Xatolik yuz berdi', 'error');
    }
  });

  // 2. Vaqtni yopish modalini ochish
  document.getElementById('btnOpenBlockModal').addEventListener('click', () => {
    document.getElementById('blockTimeModal').classList.add('active');
    refreshIcons();
  });

  document.getElementById('blockTimeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const booking_date = document.getElementById('blockDate').value;
    const start_time = document.getElementById('blockStartTime').value;
    const end_time = document.getElementById('blockEndTime').value;
    const reason = document.getElementById('blockReason').value.trim();

    try {
      const res = await adminFetch('/api/admin/bookings/block-time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_date, start_time, end_time, reason })
      });

      if (res.success) {
        showAdminToast('Vaqt oralig‘i qulflandi!');
        document.getElementById('blockTimeModal').classList.remove('active');
        document.getElementById('blockTimeForm').reset();
        loadTodayDashboard();
        loadAllBookings();
      } else {
        showAdminToast(res.error || 'Xatolik', 'error');
      }
    } catch (err) {
      showAdminToast(err.message || 'Xatolik', 'error');
    }
  });

  // 3. Dam olish kuni modalini ochish
  document.getElementById('btnOpenAddOffDayModal').addEventListener('click', () => {
    document.getElementById('offDayModal').classList.add('active');
    refreshIcons();
  });

  document.getElementById('offDayForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const off_date = document.getElementById('offDayDate').value;
    const reason = document.getElementById('offDayReason').value.trim();

    try {
      const res = await adminFetch('/api/admin/special-days', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ off_date, reason })
      });

      if (res.success) {
        showAdminToast('Dam olish kuni qo‘shildi!');
        document.getElementById('offDayModal').classList.remove('active');
        document.getElementById('offDayForm').reset();
        loadOffDays();
      } else {
        showAdminToast(res.error || 'Xatolik', 'error');
      }
    } catch (err) {
      showAdminToast(err.message || 'Xatolik', 'error');
    }
  });

  // 4. Xizmat qo'shish / tahrirlash modalini ochish
  document.getElementById('btnOpenAddServiceModal').addEventListener('click', () => {
    document.getElementById('serviceModalTitle').textContent = 'Yangi Xizmat Qo‘shish';
    document.getElementById('serviceId').value = '';
    document.getElementById('serviceForm').reset();
    document.getElementById('serviceModal').classList.add('active');
    refreshIcons();
  });

  document.getElementById('serviceForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('serviceId').value;
    const title = document.getElementById('serviceTitle').value.trim();
    const price = Number(document.getElementById('servicePrice').value);
    const duration_minutes = Number(document.getElementById('serviceDuration').value);
    const description = document.getElementById('serviceDesc').value.trim();

    try {
      const url = id ? `/api/admin/services/${id}` : '/api/admin/services';
      const method = id ? 'PUT' : 'POST';

      const res = await adminFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, price, duration_minutes, description })
      });

      if (res.success) {
        showAdminToast('Xizmat muvaffaqiyatli saqlandi!');
        document.getElementById('serviceModal').classList.remove('active');
        document.getElementById('serviceForm').reset();
        loadAdminServices();
        loadServicesForDropdown();
      } else {
        showAdminToast(res.error || 'Xatolik', 'error');
      }
    } catch (err) {
      showAdminToast(err.message || 'Xatolik', 'error');
    }
  });
}

// ===============================================================
// TELEGRAM SOZLAMALARI VA BOSHQARUV
// ===============================================================
async function loadTelegramSettings() {
  try {
    const data = await adminFetch('/api/admin/settings');
    if (data.success && data.settings) {
      const s = data.settings;
      document.getElementById('settingAdminChatId').value = s.telegram_admin_chat_id || '';
      document.getElementById('settingAdminPhone').value = s.telegram_admin_phone || '';
      document.getElementById('settingBarberName').value = s.barber_name || '';
      document.getElementById('settingWebAppUrl').value = s.webapp_url || '';
      document.getElementById('settingBotToken').value = s.telegram_bot_token || '';

      updateTgStatusBadge(s.telegram_admin_chat_id);
    }
  } catch (err) {
    showAdminToast('Sozlamalarni yuklashda xatolik', 'error');
  }
}

function updateTgStatusBadge(chatId) {
  const badge = document.getElementById('tgStatusBadge');
  const badgeText = document.getElementById('tgStatusBadgeText');
  const bannerDesc = document.getElementById('tgStatusDesc');

  if (!badge || !badgeText || !bannerDesc) return;

  if (chatId && chatId.toString().trim().length > 0) {
    badge.className = 'tg-status-badge active';
    badgeText.textContent = `Faol • ID: ${chatId}`;
    bannerDesc.innerHTML = `Mijozlar buyurtma berganda barcha ma’lumotlar darhol <b>ID: ${chatId}</b> Telegram akkauntingizga yetib boradi.`;
  } else {
    badge.className = 'tg-status-badge warning';
    badgeText.textContent = 'Chat ID Kiritilmagan';
    bannerDesc.innerHTML = `Hali Chat ID kiritilmagan. Botga kiring, <code>/id</code> deb yozing va chiqqan raqamni pastga kiriting.`;
  }
  refreshIcons();
}

function setupTelegramSettingsHandlers() {
  const form = document.getElementById('telegramSettingsForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const chatId = document.getElementById('settingAdminChatId').value.trim();
      const phone = document.getElementById('settingAdminPhone').value.trim();
      const name = document.getElementById('settingBarberName').value.trim();
      const webapp = document.getElementById('settingWebAppUrl').value.trim();
      const token = document.getElementById('settingBotToken').value.trim();

      const btnSave = document.getElementById('btnSaveSettings');
      btnSave.disabled = true;
      btnSave.innerHTML = `<i data-lucide="loader-2" class="spin"></i> <span>Saqlanmoqda...</span>`;
      refreshIcons();

      try {
        const res = await adminFetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            telegram_admin_chat_id: chatId,
            telegram_admin_phone: phone,
            barber_name: name,
            barber_phone: phone,
            webapp_url: webapp,
            telegram_bot_token: token
          })
        });

        if (res.success) {
          showAdminToast('Sozlamalar muvaffaqiyatli saqlandi!');
          updateTgStatusBadge(chatId);
          if (name) {
            document.getElementById('sidebarBarberName').textContent = name;
          }
        } else {
          showAdminToast(res.error || 'Saqlashda xatolik', 'error');
        }
      } catch (err) {
        showAdminToast(err.message || 'Xatolik', 'error');
      } finally {
        btnSave.disabled = false;
        btnSave.innerHTML = `<i data-lucide="save"></i> <span>Sozlamalarni Saqlash</span>`;
        refreshIcons();
      }
    });
  }

  // Test xabar yuborish
  const btnTest = document.getElementById('btnSendTestMessage');
  if (btnTest) {
    btnTest.addEventListener('click', async () => {
      const chatId = document.getElementById('settingAdminChatId').value.trim();
      if (!chatId) {
        showAdminToast('Iltimos, avval Telegram Chat ID ni kiriting!', 'error');
        document.getElementById('settingAdminChatId').focus();
        return;
      }

      btnTest.disabled = true;
      btnTest.innerHTML = `<i data-lucide="loader-2" class="spin"></i> <span>Yuborilmoqda...</span>`;
      refreshIcons();

      try {
        const res = await adminFetch('/api/admin/telegram/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId })
        });

        if (res.success) {
          showAdminToast('Test xabari Telegramingizga yuborildi! Telegram ilovangizni tekshiring.');
        } else {
          showAdminToast(res.error || 'Xabar yuborilmadi. Chat ID yoki Bot Tokenni tekshiring.', 'error');
        }
      } catch (err) {
        showAdminToast(err.message || 'Xabar yuborishda xatolik', 'error');
      } finally {
        btnTest.disabled = false;
        btnTest.innerHTML = `<i data-lucide="send"></i> <span>Telegramga Test Xabar Yuborish</span>`;
        refreshIcons();
      }
    });
  }

  // Webhook ulash
  const btnWebhook = document.getElementById('btnSetupWebhook');
  if (btnWebhook) {
    btnWebhook.addEventListener('click', async () => {
      const webapp = document.getElementById('settingWebAppUrl').value.trim();
      btnWebhook.disabled = true;
      btnWebhook.innerHTML = `<i data-lucide="loader-2" class="spin"></i> <span>Ulanmoqda...</span>`;
      refreshIcons();

      try {
        const res = await adminFetch('/api/admin/telegram/setup-webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base_url: webapp })
        });

        if (res.success) {
          showAdminToast('Telegram Webhook Vercelga muvaffaqiyatli bog‘landi!');
        } else {
          showAdminToast(res.error || 'Webhook ulanmadi', 'error');
        }
      } catch (err) {
        showAdminToast(err.message || 'Webhook ulanmadi', 'error');
      } finally {
        btnWebhook.disabled = false;
        btnWebhook.innerHTML = `<i data-lucide="webhook"></i> <span>Webhookni Vercelga Bog‘lash</span>`;
        refreshIcons();
      }
    });
  }
}

// ===============================================================
// MOBIL MENYU (HAMBURGER DRAWER)
// ===============================================================
function setupMobileMenu() {
  const btnToggle = document.getElementById('btnMobileToggle');
  const sidebar = document.querySelector('.admin-sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');

  if (!btnToggle || !sidebar || !backdrop) return;

  function toggleSidebar() {
    sidebar.classList.toggle('mobile-open');
    backdrop.classList.toggle('active');
  }

  function closeSidebar() {
    sidebar.classList.remove('mobile-open');
    backdrop.classList.remove('active');
  }

  btnToggle.addEventListener('click', toggleSidebar);
  backdrop.addEventListener('click', closeSidebar);

  // Mobil qurilmalarda menyu bandi bosilganda avtomatik yopish
  document.querySelectorAll('.admin-sidebar .nav-item').forEach(item => {
    item.addEventListener('click', () => {
      if (window.innerWidth <= 900) {
        closeSidebar();
      }
    });
  });
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

// Initsializatsiya
checkSavedAuth();
