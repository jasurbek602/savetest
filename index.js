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
  section: String, // Bo‘lim nomi
});
const File = mongoose.model('File', fileSchema);

// === Bo‘lim modeli ===
const sectionSchema = new mongoose.Schema({
  name: String,
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

// === Bo‘sh bo‘limlarni avtomatik o‘chirish funksiyasi ===
async function removeEmptySections() {
  const sections = await Section.find();
  for (const section of sections) {
    const fileCount = await File.countDocuments({ section: section.name });
    if (fileCount === 0) {
      await Section.deleteOne({ _id: section._id });
      console.log(`🗑️ Bo‘sh bo‘lim o‘chirildi: ${section.name}`);
    }
  }
}

// === Guruhdan fayl kelganda ===
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  if (chatId === FILE_GROUP_ID) {
    const fileType = msg.document ? 'document' :
      msg.audio ? 'audio' :
      msg.video ? 'video' :
      msg.photo ? 'photo' : null;

    const caption = msg.caption?.trim();

    if (fileType && caption) {
      // Bo‘limni tekshirish yoki yaratish
      let section = await Section.findOne({ name: caption });
      if (!section) {
        section = new Section({ name: caption });
        await section.save();
        console.log("✅ Yangi bo‘lim yaratildi:", caption);
      }

      const file = new File({
        message_id: msg.message_id,
        file_name: msg.document?.file_name || `${fileType} fayl`,
        type: fileType,
        date: msg.date,
        section: caption,
      });

      await file.save();
      console.log('✅ Yangi fayl saqlandi:', file);
    }
  }
});

// === /start komandasi ===
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "Assalomu alaykum! Fayllarni olish uchun bo‘limni tanlang:", {
    reply_markup: {
      keyboard: [['📁 Bo‘limlar']],
      resize_keyboard: true,
    },
  });
});

// === Faylni tanlash menyusi ===
bot.onText(/\/fayllar|📁 Bo‘limlar/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const subscribed = await isUserSubscribed(userId);
  if (!subscribed) {
    return bot.sendMessage(chatId, `Iltimos, ${CHANNEL_USERNAME} kanaliga obuna bo‘ling`, {
      reply_markup: {
        inline_keyboard: [[
          { text: "Kanalga o'tish", url: `https://t.me/${CHANNEL_USERNAME.replace('@', '')}` }
        ]]
      }
    });
  }

  const sections = await Section.find();
  if (sections.length === 0) {
    return bot.sendMessage(chatId, "Hozircha hech qanday bo‘lim mavjud emas.");
  }

  const buttons = sections.map(sec => [{ text: sec.name }]);
  bot.sendMessage(chatId, "Quyidagi bo‘limlardan birini tanlang:", {
    reply_markup: {
      keyboard: buttons,
      resize_keyboard: true,
    },
  });
});

// === Foydalanuvchi bo‘lim nomini yuborganda ===
bot.on('text', async (msg) => {
  const chatId = msg.chat.id;
  const sectionName = msg.text.trim();

  const section = await Section.findOne({ name: sectionName });
  if (!section) return;

  const files = await File.find({ section: sectionName }).sort({ date: -1 });

  if (files.length === 0) {
    await Section.deleteOne({ _id: section._id }); // Bo‘sh bo‘limni o‘chir
    return bot.sendMessage(chatId, "Bu bo‘limda hech qanday fayl yo‘q edi va o‘chirildi.");
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
      await removeEmptySections(); // Bo‘sh bo‘limni tekshir va tozala
    }
  }
});
