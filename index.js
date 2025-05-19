const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const mongoose = require('mongoose');

// === MongoDB ulanish ===
mongoose.connect('mongodb+srv://pg99lvl:Jasurbek%232008@cluster0.86xrt46.mongodb.net/?retryWrites=true&w=majority')
  .then(() => console.log("✅ MongoDB ulanish muvaffaqiyatli!"))
  .catch((err) => console.error("❌ MongoDB ulanish xatosi:", err));

// === Fayl modeli ===
const fileSchema = new mongoose.Schema({
  message_id: Number,
  file_name: String,
  type: String,
  date: Number,
  section: String
});
const File = mongoose.model('File', fileSchema);

// === Bo‘lim modeli ===
const sectionSchema = new mongoose.Schema({
  name: { type: String, unique: true }
});
const Section = mongoose.model('Section', sectionSchema);

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

// === Guruhga fayl kelganda ===
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  if (chatId === FILE_GROUP_ID) {
    const fileType = msg.document ? 'document' :
                     msg.audio ? 'audio' :
                     msg.video ? 'video' :
                     msg.photo ? 'photo' : null;

    if (fileType) {
      const sectionName = msg.caption?.trim() || 'Umumiy';

      // Bo‘lim mavjud bo‘lmasa, yaratamiz
      let section = await Section.findOne({ name: sectionName });
      if (!section) {
        section = new Section({ name: sectionName });
        await section.save();
      }

      const file = new File({
        message_id: msg.message_id,
        file_name: msg.document?.file_name || `${fileType} fayl`,
        type: fileType,
        date: msg.date,
        section: sectionName
      });

      await file.save();
      console.log(`✅ Fayl "${file.file_name}" bo‘lim "${sectionName}" ga saqlandi.`);
    }
  }
});

// === /start komandasi ===
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  const sections = await Section.find();
  if (sections.length === 0) {
    return bot.sendMessage(chatId, "Hozircha hech qanday bo‘lim mavjud emas.");
  }

  const buttons = sections.map(sec => [{ text: sec.name, callback_data: `section:${sec.name}` }]);

  bot.sendMessage(chatId, "Quyidagi bo‘limlardan birini tanlang:", {
    reply_markup: {
      inline_keyboard: buttons
    }
  });
});

// === YUKLAB OLISH tugmasi ===
bot.onText(/\/fayllar|YUKLAB OLISH/i, async (msg) => {
  msg.text = '/start'; // start komandasi bilan bir hil funksiyani ishlatamiz
  bot.emit('text', msg);
});

// === Inline tugmani bosganda ===
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;

  const subscribed = await isUserSubscribed(userId);
  if (!subscribed) {
    return bot.sendMessage(chatId, `Iltimos, ${CHANNEL_USERNAME} kanaliga obuna bo‘ling va qaytadan urinib ko‘ring.`, {
      reply_markup: {
        inline_keyboard: [[
          { text: "Kanalga o'tish", url: `https://t.me/${CHANNEL_USERNAME.replace('@', '')}` }
        ]]
      }
    });
  }

  const data = query.data;
  if (data.startsWith('section:')) {
    const sectionName = data.split(':')[1];

    const files = await File.find({ section: sectionName }).sort({ date: -1 });
    if (files.length === 0) {
      return bot.sendMessage(chatId, `Bo‘limda "${sectionName}" hech qanday fayl mavjud emas.`);
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        await bot.copyMessage(chatId, FILE_GROUP_ID, file.message_id, {
          caption: file.file_name
        });
      } catch (error) {
        console.error(`❌ Fayl yuborishda xato:`, error.message);
        await File.deleteOne({ _id: file._id });
      }
    }
  }
});

// === Polling xatolarini ko‘rsatish ===
bot.on("polling_error", (error) => {
  console.error("Polling xatosi:", error.response?.body || error.message || error);
});
