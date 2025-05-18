const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const mongoose = require('mongoose');

// === MongoDB ulanish ===


mongoose.connect('mongodb+srv://pg99lvl:Jasurbek%232008@cluster0.86xrt46.mongodb.net/?retryWrites=true&w=majority')
  .then(() => console.log("MongoDB ulanish muvaffaqiyatli!"))
  .catch((err) => console.error("MongoDB ulanish xatosi:", err));

// === Fayl modeli ===
const fileSchema = new mongoose.Schema({
  message_id: Number,
  file_name: String,
  type: String,
  date: Number
});
const File = mongoose.model('File', fileSchema);

// === Telegram sozlamalari ===
const BOT_TOKEN = '7558460976:AAHYVzgJjbdex9OLfmbNogIr420mwYNjbEQ';
const CHANNEL_USERNAME = '@rapqonedu2024';
const FILE_GROUP_ID = -1002268361672;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// === Obuna bo'lishni tekshirish ===
async function isUserSubscribed(userId) {
  try {
    const res = await axios.get(
      `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${CHANNEL_USERNAME}&user_id=${userId}`
    );
    const status = res.data.result.status;
    return ['member', 'administrator', 'creator'].includes(status);
  } catch {
    return false;
  }
}

// === Polling xatolarini tutib olish ===
bot.on("polling_error", (error) => {
  console.error("Polling xatosi:", error.response?.body || error.message || error);
});

// === Guruhdan fayl kelganda ===
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  if (chatId === FILE_GROUP_ID) {
    const fileType = msg.document ? 'document' :
                     msg.audio ? 'audio' :
                     msg.video ? 'video' :
                     msg.photo ? 'photo' : null;

    if (fileType) {
      const file = new File({
        message_id: msg.message_id,
        file_name: msg.document?.file_name || `${fileType} fayl`,
        type: fileType,
        date: msg.date
      });

      await file.save();
      console.log('✅ Yangi fayl saqlandi:', file);
    }
  }
});

// === /start komandasi ===
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  bot.sendMessage(chatId, "Assalomu alaykum! Fayllarni olish uchun /fayllar buyrug'ini yozing yoke pastdagi tugmani bosing", {
    reply_markup: {
      keyboard: [
        ['YUKLAB OLISH']
      ],
      resize_keyboard: true,
    },
  });
});

// === /fayllar komandasi ===
bot.onText(/\/fayllar|YUKLAB OLISH/i, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const subscribed = await isUserSubscribed(userId);

  if (!subscribed) {
    return bot.sendMessage(chatId, `Iltimos, ${CHANNEL_USERNAME} kanaliga obuna bo‘ling va yuklab olish tugmasini bosing`, {
      reply_markup: {
        inline_keyboard: [[
          { text: "Kanalga o'tish", url: `https://t.me/${CHANNEL_USERNAME.replace('@', '')}` }
        ]]
      }
    });
  }

  const files = await File.find().sort({ date: -1 });

  if (files.length === 0) {
    return bot.sendMessage(chatId, "Hozircha hech qanday fayl mavjud emas.");
  }

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      await bot.copyMessage(chatId, FILE_GROUP_ID, file.message_id, {
        caption: file.file_name
      });
    } catch (error) {
      console.error(`❌ Faylni yuborishda xatolik:`, error.message);
      await File.deleteOne({ _id: file._id });
    }
  }
});
