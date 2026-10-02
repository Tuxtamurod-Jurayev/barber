const TelegramBot = require('node-telegram-bot-api');
const db = require('../db/database');
const { getNowLocal } = require('./slotService');

let bot = null;
const notificationHistory = [];

function getBotToken() {
  return db.getSetting('telegram_bot_token', process.env.TELEGRAM_BOT_TOKEN || '8814995989:AAEYjWrbQlf5qfsAabViVBjNDn_JXWFH-x4');
}

function getBarberChatId() {
  return db.getSetting('telegram_admin_chat_id', process.env.TELEGRAM_BARBER_CHAT_ID || '');
}

function getWebAppUrl() {
  return db.getSetting('webapp_url', process.env.WEBAPP_URL || 'https://barber-sepia-six.vercel.app/');
}

function getBarberName() {
  return db.getSetting('barber_name', process.env.BARBER_NAME || 'Usta Sardor');
}

/**
 * Botni initsializatsiya qilish
 */
function initTelegramBot() {
  const token = getBotToken();
  const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

  if (!token) {
    console.log('[Telegram Bot] Bot token mavjud emas.');
    return;
  }

  try {
    // Vercel serverless muhitida polling o'chiriladi, oddiy serverda polling yoqiladi
    bot = new TelegramBot(token, { polling: !isServerless });
    console.log(`[Telegram Bot] Muvaffaqiyatli ishga tushdi (Polling: ${!isServerless}).`);

    if (!isServerless) {
      registerBotCommands(bot);
    }
  } catch (error) {
    console.error('[Telegram Bot Init Error]:', error.message);
  }
}

/**
 * Bot buyruqlarini ro'yxatdan o'tkazish
 */
function registerBotCommands(botInstance) {
  if (!botInstance) return;

  // /start buyrug'i
  botInstance.onText(/\/start/, (msg) => {
    handleStartCommand(msg.chat.id, msg.from?.first_name);
  });

  // /id buyrug'i
  botInstance.onText(/\/id/, (msg) => {
    sendChatIdInfo(msg.chat.id);
  });

  // /today buyrug'i
  botInstance.onText(/\/today/, (msg) => {
    sendTodayScheduleToChat(msg.chat.id);
  });

  // /stats buyrug'i
  botInstance.onText(/\/stats/, (msg) => {
    sendStatsToChat(msg.chat.id);
  });

  // Text xabarlar (Tugmalar orqali bosilganda)
  botInstance.on('message', (msg) => {
    const text = msg.text || '';
    if (text === '📋 Bugungi jadval') {
      sendTodayScheduleToChat(msg.chat.id);
    } else if (text === '🆔 Mening ID raqamim') {
      sendChatIdInfo(msg.chat.id);
    }
  });

  // Callback query
  botInstance.on('callback_query', async (query) => {
    handleCallbackQuery(query);
  });

  botInstance.on('polling_error', (error) => {
    // Polling xatoliklarini tinch qayd etamiz
    if (error.code !== 'EFATAL') {
      console.log('[Telegram Polling]:', error.message || error.code);
    }
  });
}

/**
 * /start xabari va WebApp tugmasi
 */
async function handleStartCommand(chatId, firstName = 'Hurmatli mijoz') {
  const token = getBotToken();
  const webappUrl = getWebAppUrl();
  const barberName = getBarberName();

  const welcomeText = 
    `Assalomu alaykum, <b>${firstName}</b>! 👋\n\n` +
    `💈 <b>${barberName}</b> sartaroshxonasining rasmiy botiga xush kelibsiz.\n\n` +
    `Navbatga yozilish uchun pastdagi <b>"💈 Navbatga Yozilish (WebApp)"</b> tugmasini bosing.\n\n` +
    `<i>Usta uchun qulay buyruqlar:</i>\n` +
    `👉 /today - Bugungi barcha navbatlarni ko‘rish\n` +
    `👉 /id - Sizning Chat ID raqamingiz\n` +
    `👉 /stats - Bugungi statistika`;

  const payload = {
    chat_id: chatId,
    text: welcomeText,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '💈 Navbatga Yozilish (WebApp)',
            web_app: { url: webappUrl }
          }
        ]
      ]
    }
  };

  await sendRawTelegramApi(token, 'sendMessage', payload);

  // Chat pastki menyusiga ham doimiy tugma o'rnatamiz
  const keyboardPayload = {
    chat_id: chatId,
    text: `Qulaylik uchun pastdagi menyudan foydalanishingiz mumkin 👇`,
    reply_markup: {
      keyboard: [
        [
          {
            text: '💈 Navbatga Yozilish (WebApp)',
            web_app: { url: webappUrl }
          }
        ],
        [
          { text: '📋 Bugungi jadval' },
          { text: '🆔 Mening ID raqamim' }
        ]
      ],
      resize_keyboard: true,
      persistent: true
    }
  };
  await sendRawTelegramApi(token, 'sendMessage', keyboardPayload);
}

/**
 * Chat ID ma'lumotini yuborish
 */
async function sendChatIdInfo(chatId) {
  const token = getBotToken();
  const text = 
    `🆔 <b>Sizning Telegram Chat ID:</b>\n` +
    `<code>${chatId}</code>\n\n` +
    `Ushbu raqamni nusxalab, <b>Admin Panel -> Telegram Sozlamalari</b> bo‘limidagi <b>Chat ID</b> maydoniga kiriting va "Saqlash" tugmasini bosing.\n` +
    `Shunda barcha yangi mijozlar buyurtmalari avtomatik sizga yetib boradi!`;

  await sendRawTelegramApi(token, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML'
  });
}

/**
 * Bugungi jadvalni yuborish (/today)
 */
async function sendTodayScheduleToChat(chatId) {
  const token = getBotToken();
  const { dateStr } = getNowLocal();
  const bookings = db.getBookings({ date: dateStr, status: 'confirmed' });

  if (bookings.length === 0) {
    await sendRawTelegramApi(token, 'sendMessage', {
      chat_id: chatId,
      text: `📅 <b>Bugungi kun (${dateStr})</b> uchun hozircha tasdiqlangan bronlar mavjud emas.`,
      parse_mode: 'HTML'
    });
    return;
  }

  let message = `💈 <b>Bugungi Navbatlar Jadvali (${dateStr})</b>\n\n`;
  let totalRevenue = 0;

  bookings.forEach((b, index) => {
    message += `<b>${index + 1}. ⏰ ${b.start_time} - ${b.end_time}</b>\n` +
      `   👤 Mijoz: <b>${b.client_name}</b>\n` +
      `   📞 Tel: <code>${b.client_phone}</code>\n` +
      `   ✂️ Xizmat: ${b.service_title} (${b.service_duration} daq)\n` +
      `   💰 Narxi: ${(b.service_price || 0).toLocaleString('uz-UZ')} so'm\n\n`;
    totalRevenue += (b.service_price || 0);
  });

  message += `━━━━━━━━━━━━━━━━━━━\n` +
    `👥 Jami mijozlar: <b>${bookings.length} ta</b>\n` +
    `💵 Rejalashtirilgan tushum: <b>${totalRevenue.toLocaleString('uz-UZ')} so'm</b>`;

  await sendRawTelegramApi(token, 'sendMessage', {
    chat_id: chatId,
    text: message,
    parse_mode: 'HTML'
  });
}

/**
 * Statistika yuborish (/stats)
 */
async function sendStatsToChat(chatId) {
  const token = getBotToken();
  const { dateStr } = getNowLocal();
  const stats = db.getDayStats(dateStr);

  const text = `📊 <b>Statistika (${dateStr})</b>\n\n` +
    `👥 Jami bronlar: <b>${stats.total} ta</b>\n` +
    `✅ Tasdiqlangan: <b>${stats.confirmed} ta</b>\n` +
    `🏁 Yakunlangan: <b>${stats.completed} ta</b>\n` +
    `❌ Bekor qilingan: <b>${stats.cancelled} ta</b>\n` +
    `💰 Kutilayotgan tushum: <b>${stats.revenue.toLocaleString('uz-UZ')} so'm</b>`;

  await sendRawTelegramApi(token, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML'
  });
}

/**
 * Inline tugmalar callback query
 */
async function handleCallbackQuery(query) {
  const token = getBotToken();
  try {
    const data = query.data;
    if (data && data.startsWith('status:')) {
      const [, action, bookingId] = data.split(':');
      const targetStatus = action === 'complete' ? 'completed' : action === 'cancel' ? 'cancelled' : null;

      if (targetStatus) {
        db.updateBookingStatus(bookingId, targetStatus);
        const statusEmoji = targetStatus === 'completed' ? '✅ Yakunlandi' : '❌ Bekor qilindi';
        
        await sendRawTelegramApi(token, 'answerCallbackQuery', {
          callback_query_id: query.id,
          text: `Holat o‘zgartirildi: ${statusEmoji}`
        });

        if (query.message) {
          await sendRawTelegramApi(token, 'editMessageReplyMarkup', {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
            reply_markup: {
              inline_keyboard: [[{ text: `${statusEmoji}`, callback_data: 'noop' }]]
            }
          });
        }
      }
    }
  } catch (err) {
    console.error('[Telegram Callback Error]:', err.message);
  }
}

/**
 * Vercel Serverless Webhookdan kelgan yangilanishni (Update) qayta ishlash
 */
async function handleTelegramUpdate(update) {
  if (!update) return;

  if (update.message) {
    const msg = update.message;
    const text = (msg.text || '').trim();
    const chatId = msg.chat.id;

    if (text === '/start' || text.startsWith('/start ')) {
      await handleStartCommand(chatId, msg.from?.first_name);
    } else if (text === '/id') {
      await sendChatIdInfo(chatId);
    } else if (text === '/today' || text === '📋 Bugungi jadval') {
      await sendTodayScheduleToChat(chatId);
    } else if (text === '/stats') {
      await sendStatsToChat(chatId);
    } else if (text === '🆔 Mening ID raqamim') {
      await sendChatIdInfo(chatId);
    }
  } else if (update.callback_query) {
    await handleCallbackQuery(update.callback_query);
  }
}

/**
 * Yangi bron haqida Usta (Admin) Telegramiga xabar yuborish
 */
async function notifyBarberNewBooking(booking) {
  const token = getBotToken();
  const barberChatId = getBarberChatId();

  const notificationItem = {
    id: booking.id,
    type: 'new_booking',
    time: new Date().toISOString(),
    client_name: booking.client_name,
    client_phone: booking.client_phone,
    service_title: booking.service_title,
    booking_date: booking.booking_date,
    start_time: booking.start_time,
    end_time: booking.end_time,
    price: booking.service_price,
    notes: booking.notes
  };
  notificationHistory.unshift(notificationItem);
  if (notificationHistory.length > 50) notificationHistory.pop();

  const formattedPrice = (booking.service_price || 0).toLocaleString('uz-UZ');
  const messageText = 
    `💈 <b>YANGI BRON! (Yangi Mijoz)</b>\n\n` +
    `👤 <b>Mijoz:</b> ${booking.client_name}\n` +
    `📞 <b>Telefon:</b> <code>${booking.client_phone}</code>\n` +
    `✂️ <b>Xizmat:</b> ${booking.service_title} (${booking.service_duration} daqiqa)\n` +
    `💰 <b>Narxi:</b> ${formattedPrice} so‘m\n` +
    `📅 <b>Sana:</b> ${booking.booking_date}\n` +
    `⏰ <b>Vaqt:</b> ${booking.start_time} - ${booking.end_time}\n` +
    (booking.notes ? `📝 <b>Izoh:</b> ${booking.notes}\n` : '') +
    `\n<i>Tizim slotni avtomatik qulfladi.</i>`;

  console.log(`[XABARNOMA] Yangi bron: ${booking.client_name} -> ChatId: ${barberChatId || 'Belgilanmagan'}`);

  if (!token || !barberChatId) {
    return { sent: false, reason: 'Bot token yoki Admin Chat ID sozlanmagan' };
  }

  const cleanPhone = (booking.client_phone || '').replace(/\s+/g, '');
  const payload = {
    chat_id: barberChatId,
    text: messageText,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📞 Qo‘ng‘iroq qilish', url: `tel:${cleanPhone}` },
          { text: '✅ Yakunlandi', callback_data: `status:complete:${booking.id}` }
        ],
        [
          { text: '❌ Bekor qilish', callback_data: `status:cancel:${booking.id}` }
        ]
      ]
    }
  };

  return await sendRawTelegramApi(token, 'sendMessage', payload);
}

/**
 * Bron bekor qilinganda xabarnoma
 */
async function notifyBarberBookingCancelled(booking) {
  const token = getBotToken();
  const barberChatId = getBarberChatId();
  if (!token || !barberChatId) return;

  const text = `⚠️ <b>BRON BEKOR QILINDI!</b>\n\n` +
    `👤 Mijoz: <b>${booking.client_name}</b>\n` +
    `📞 Telefon: <code>${booking.client_phone}</code>\n` +
    `📅 Sana: ${booking.booking_date}\n` +
    `⏰ Vaqt: ${booking.start_time} - ${booking.end_time}\n` +
    `✂️ Xizmat: ${booking.service_title}\n\n` +
    `Ushbu vaqt boshqa mijozlar uchun yana bo‘shatildi.`;

  return await sendRawTelegramApi(token, 'sendMessage', {
    chat_id: barberChatId,
    text,
    parse_mode: 'HTML'
  });
}

/**
 * Test xabar yuborish (Admin panel sozlamalarini sinash uchun)
 */
async function sendTestMessage(targetChatId) {
  const token = getBotToken();
  const chatId = targetChatId || getBarberChatId();

  if (!token || !chatId) {
    throw new Error('Bot token yoki Chat ID kiritilmagan!');
  }

  const text = 
    `✅ <b>Tabriklaymiz! Ulanish muvaffaqiyatli!</b>\n\n` +
    `Sartaroshxona bron qilish tizimi va Telegram botingiz to‘g‘ri sozlandi.\n` +
    `Endi mijozlar navbat olganida barcha ma’lumotlar ushbu chatga darhol yetib keladi! 💈`;

  return await sendRawTelegramApi(token, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML'
  });
}

/**
 * Telegram Webhook sozlash (Vercel serverless uchun)
 */
async function setupTelegramWebhook(baseUrl) {
  const token = getBotToken();
  if (!token) throw new Error('Bot token kiritilmagan!');

  const domain = baseUrl || getWebAppUrl();
  const webhookUrl = `${domain.replace(/\/$/, '')}/api/telegram/webhook`;

  const res = await sendRawTelegramApi(token, 'setWebhook', {
    url: webhookUrl,
    allowed_updates: ['message', 'callback_query']
  });

  return { success: true, webhookUrl, telegramResponse: res };
}

/**
 * Telegram Bot API so'rov yuborish (fetch orqali - Vercelda 100% ishonchli)
 */
async function sendRawTelegramApi(token, method, body) {
  try {
    const url = `https://api.telegram.org/bot${token}/${method}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!data.ok) {
      console.error(`[Telegram API Error ${method}]:`, data.description);
    }
    return data;
  } catch (err) {
    console.error(`[Telegram API Network Error ${method}]:`, err.message);
    return { ok: false, error: err.message };
  }
}

function getNotificationHistory() {
  return notificationHistory;
}

module.exports = {
  initTelegramBot,
  notifyBarberNewBooking,
  notifyBarberBookingCancelled,
  sendTodayScheduleToChat,
  sendTestMessage,
  setupTelegramWebhook,
  handleTelegramUpdate,
  getNotificationHistory
};
