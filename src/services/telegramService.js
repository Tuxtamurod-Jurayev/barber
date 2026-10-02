const TelegramBot = require('node-telegram-bot-api');
const db = require('../db/database');
const { getNowLocal } = require('./slotService');

let bot = null;
const notificationHistory = [];

function initTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const barberChatId = process.env.TELEGRAM_BARBER_CHAT_ID;

  if (!token) {
    console.log('[Telegram Bot] TELEGRAM_BOT_TOKEN kiritilmagan. Bildirishnomalar faqat konsolda va admin panelda ko‘rsatiladi.');
    return;
  }

  const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

  try {
    bot = new TelegramBot(token, { polling: !isServerless });
    console.log(`[Telegram Bot] Muvaffaqiyatli ishga tushdi (Polling: ${!isServerless}).`);

    // /start buyrug'i
    bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      const firstName = msg.from.first_name || 'Hurmatli mijoz';

      const welcomeText = `Assalomu alaykum, <b>${firstName}</b>!\n\n` +
        `✂️ <b>${process.env.BARBER_NAME || 'Barbershop'}</b> bron qilish tizimiga xush kelibsiz.\n\n` +
        `Quyidagi tugma orqali qulay vaqtni tanlab, navbatga yozilishingiz mumkin.\n` +
        `Usta uchun buyruqlar:\n` +
        `👉 /today - Bugungi barcha navbatlarni ko‘rish\n` +
        `👉 /stats - Bugungi statistika va tushum\n` +
        `👉 /id - Sizning Telegram Chat ID ingiz`;

      bot.sendMessage(chatId, welcomeText, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '💈 Navbatga Yozilish (WebApp)',
                // Agar WebApp url bo'lsa
                url: process.env.WEBAPP_URL || 'https://t.me'
              }
            ]
          ]
        }
      }).catch(err => console.error('[Telegram] Xabar yuborishda xatolik:', err.message));
    });

    // /id buyrug'i (Barber o'z chat ID sini bilib olishi uchun)
    bot.onText(/\/id/, (msg) => {
      bot.sendMessage(msg.chat.id, `Sizning Telegram Chat ID: <code>${msg.chat.id}</code>\nUshbu ID ni .env faylidagi <code>TELEGRAM_BARBER_CHAT_ID</code> ga qo‘ying.`, {
        parse_mode: 'HTML'
      });
    });

    // /today buyrug'i (Bugungi jadval)
    bot.onText(/\/today/, (msg) => {
      const chatId = msg.chat.id;
      sendTodayScheduleToChat(chatId);
    });

    // /stats buyrug'i
    bot.onText(/\/stats/, (msg) => {
      const chatId = msg.chat.id;
      const { dateStr } = getNowLocal();
      const stats = db.getDayStats(dateStr);

      const text = `📊 <b>Statistika (${dateStr})</b>\n\n` +
        `👥 Jami bronlar: <b>${stats.total} ta</b>\n` +
        `✅ Tasdiqlangan: <b>${stats.confirmed} ta</b>\n` +
        `🏁 Yakunlangan: <b>${stats.completed} ta</b>\n` +
        `❌ Bekor qilingan: <b>${stats.cancelled} ta</b>\n` +
        `💰 Kutilayotgan tushum: <b>${stats.revenue.toLocaleString('uz-UZ')} so'm</b>`;

      bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
    });

    // Callback query (Inline tugmalar orqali status o'zgartirish)
    bot.on('callback_query', async (query) => {
      try {
        const data = query.data; // format: 'status:ACTION:BOOKING_ID'
        if (data.startsWith('status:')) {
          const [, action, bookingId] = data.split(':');
          const targetStatus = action === 'complete' ? 'completed' : action === 'cancel' ? 'cancelled' : null;

          if (targetStatus) {
            const updated = db.updateBookingStatus(bookingId, targetStatus);
            const statusEmoji = targetStatus === 'completed' ? '✅ Yakunlandi' : '❌ Bekor qilindi';
            
            await bot.answerCallbackQuery(query.id, { text: `Bron holati o'zgartirildi: ${statusEmoji}` });
            await bot.editMessageReplyMarkup(
              { inline_keyboard: [[{ text: `${statusEmoji}`, callback_data: 'noop' }]] },
              { chat_id: query.message.chat.id, message_id: query.message.message_id }
            );
          }
        }
      } catch (err) {
        console.error('[Telegram Callback Error]:', err.message);
      }
    });

    bot.on('polling_error', (error) => {
      console.log('[Telegram Bot Polling Note]:', error.code || error.message);
    });

  } catch (error) {
    console.error('[Telegram Bot Init Error]:', error.message);
  }
}

/**
 * Bugungi jadvalni Telegram orqali yuborish (/today)
 */
function sendTodayScheduleToChat(chatId) {
  if (!bot) return;

  const { dateStr } = getNowLocal();
  const bookings = db.getBookings({ date: dateStr, status: 'confirmed' });

  if (bookings.length === 0) {
    bot.sendMessage(chatId, `📅 <b>Bugungi kun (${dateStr})</b> uchun hozircha tasdiqlangan bronlar mavjud emas.`, {
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

  bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
}

/**
 * Yangi bron yaratilganda Sartaroshga darhol bildirishnoma yuborish
 * TZ 4-bo'lim talabi:
 * "Telegram Botga bildirishnoma: Yangi mijoz: Sardor (+99890...), Soat: 15:00 - 15:45"
 */
async function notifyBarberNewBooking(booking) {
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
    `💈 <b>YANGI BRON! (Yangi Navbat)</b>\n\n` +
    `👤 <b>Mijoz:</b> ${booking.client_name}\n` +
    `📞 <b>Telefon:</b> <code>${booking.client_phone}</code>\n` +
    `✂️ <b>Xizmat:</b> ${booking.service_title} (${booking.service_duration} daqiqa)\n` +
    `💰 <b>Narxi:</b> ${formattedPrice} so‘m\n` +
    `📅 <b>Sana:</b> ${booking.booking_date}\n` +
    `⏰ <b>Vaqt:</b> ${booking.start_time} - ${booking.end_time}\n` +
    (booking.notes ? `📝 <b>Izoh:</b> ${booking.notes}\n` : '') +
    `\n<i>Tizim slotni avtomatik qulfladi va ustma-ust tushishdan himoyaladi.</i>`;

  console.log(`[XABARNOMA] Yangi bron: ${booking.client_name} (${booking.client_phone}) -> ${booking.booking_date} ${booking.start_time}-${booking.end_time}`);

  const barberChatId = process.env.TELEGRAM_BARBER_CHAT_ID;
  if (!bot || !barberChatId) {
    return { sent: false, reason: 'Bot token yoki Chat ID sozlanmagan' };
  }

  try {
    await bot.sendMessage(barberChatId, messageText, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: `📞 Qo‘ng‘iroq qilish`, url: `tel:${booking.client_phone.replace(/\s+/g, '')}` },
            { text: `✅ Yakunlandi`, callback_data: `status:complete:${booking.id}` }
          ],
          [
            { text: `❌ Bekor qilish`, callback_data: `status:cancel:${booking.id}` }
          ]
        ]
      }
    });
    return { sent: true };
  } catch (err) {
    console.error('[Telegram Xabarnoma Xatosi]:', err.message);
    return { sent: false, error: err.message };
  }
}

/**
 * Bron bekor qilinganda xabarnoma
 */
async function notifyBarberBookingCancelled(booking) {
  const barberChatId = process.env.TELEGRAM_BARBER_CHAT_ID;
  if (!bot || !barberChatId) return;

  const text = `⚠️ <b>BRON BEKOR QILINDI!</b>\n\n` +
    `👤 Mijoz: <b>${booking.client_name}</b>\n` +
    `📞 Telefon: <code>${booking.client_phone}</code>\n` +
    `📅 Sana: ${booking.booking_date}\n` +
    `⏰ Vaqt: ${booking.start_time} - ${booking.end_time}\n` +
    `Xizmat: ${booking.service_title}\n\n` +
    `Ushbu slot boshqa mijozlar uchun yana bo'shatildi.`;

  try {
    await bot.sendMessage(barberChatId, text, { parse_mode: 'HTML' });
  } catch (err) {
    console.error('[Telegram Cancel Notify Error]:', err.message);
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
  getNotificationHistory
};
