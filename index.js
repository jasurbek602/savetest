const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');

// === MongoDB ulanish ===
mongoose.connect('mongodb+srv://pg99lvl:Jasurbek%232008@cluster0.86xrt46.mongodb.net/?retryWrites=true&w=majority')
  .then(() => console.log("✅ MongoDB ulandi"))
  .catch(err => console.error("❌ Mongo xato:", err));

// === Modellar ===
const adminSchema = new mongoose.Schema({ user_id: Number });
const Admin = mongoose.model('Admin', adminSchema);

const settingsSchema = new mongoose.Schema({ channel_username: String });
const Settings = mongoose.model('Settings', settingsSchema);

const sectionSchema = new mongoose.Schema({
  name: String,
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', default: null },
});
const Section = mongoose.model('Section', sectionSchema);

const fileSchema = new mongoose.Schema({
  message_id: Number,
  file_name: String,
  type: String,
  date: Number,
  section_id: mongoose.Schema.Types.ObjectId,
});
const File = mongoose.model('File', fileSchema);

// === TOKEN, Group, Bot ===
const BOT_TOKEN = '7558460976:AAHYVzgJjbdex9OLfmbNogIr420mwYNjbEQ';
const FILE_GROUP_ID = -1002268361672; // Fayllar keladigan guruh ID
const MY_USER_ID = 2053660453;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// === Har doim admin qilib saqlash ===
(async () => {
  const admin = await Admin.findOne({ user_id: MY_USER_ID });
  if (!admin) {
    await new Admin({ user_id: MY_USER_ID }).save();
    console.log("✅ Siz admin qilib qo‘shildingiz:", MY_USER_ID);
  } else {
    console.log("ℹ️ Admin avvaldan mavjud:", MY_USER_ID);
  }

  const settings = await Settings.findOne();
  if (!settings) {
    await new Settings({ channel_username: '@rapqonedu2024' }).save();
    console.log("✅ Kanal sozlandi: @rapqonedu2024");
  }
})();

// === Admin tekshirish ===
async function isAdmin(userId) {
  const exists = await Admin.findOne({ user_id: parseInt(userId) });
  return !!exists;
}

// === Obuna tekshirish ===
async function isUserSubscribed(userId) {
  if (await isAdmin(userId)) return true;

  const settings = await Settings.findOne();
  if (!settings?.channel_username) return false;
  try {
    const res = await bot.getChatMember(settings.channel_username, userId);
    return ['member', 'administrator', 'creator'].includes(res.status);
  } catch {
    return false;
  }
}

// === Fayl qabul qilish ===
bot.on('message', async (msg) => {
  if (msg.chat.id !== FILE_GROUP_ID) return;

  const caption = msg.caption?.trim();
  const fileType = msg.document ? 'document' : msg.audio ? 'audio' : msg.video ? 'video' : msg.photo ? 'photo' : null;
  if (!caption || !fileType) return;

  const section = await Section.findOne({ name: caption });
  if (!section) return;

  const file = new File({
    message_id: msg.message_id,
    file_name: msg.document?.file_name || `${fileType} fayl`,
    type: fileType,
    date: msg.date,
    section_id: section._id,
  });

  await file.save();
  console.log("✅ Fayl saqlandi:", file.file_name);
});

// === /start ===
bot.onText(/\/start/, async (msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;

  if (!await isUserSubscribed(userId)) {
    const settings = await Settings.findOne();
    return bot.sendMessage(chatId, "📛 Botdan foydalanish uchun avval kanalga obuna bo‘ling:", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔗 Kanalga obuna bo‘lish", url: `https://t.me/${settings.channel_username.replace('@', '')}` }],
          [{ text: "✅ Obunani tekshirish", callback_data: "check_sub" }],
        ]
      }
    });
  }

  if (await isAdmin(userId)) {
    return bot.sendMessage(chatId, "👋 Salom admin! Quyidagi tugmalar orqali botni boshqaring:", {
      reply_markup: {
        keyboard: [
          ["➕ Bo‘lim qo‘shish"],
          ["📂 Subbo‘lim qo‘shish"],
          ["📁 Fayllarni ko‘rish"]
        ],
        resize_keyboard: true
      }
    });
  }

  // Oddiy foydalanuvchiga ko‘rsatish
  const sections = await Section.find({ parent: null });
  if (!sections.length) return bot.sendMessage(chatId, "⛔️ Hozircha bo‘lim mavjud emas.");

  const buttons = sections.map(s => [{ text: s.name }]);
  return bot.sendMessage(chatId, "📚 Bo‘limni tanlang:", {
    reply_markup: {
      keyboard: buttons,
      resize_keyboard: true
    }
  });
});

// === Callback: obuna tekshirish ===
bot.on('callback_query', async (query) => {
  if (query.data === "check_sub") {
    const subscribed = await isUserSubscribed(query.from.id);
    if (subscribed) {
      return bot.sendMessage(query.message.chat.id, "✅ Obuna tasdiqlandi. /start buyrug‘ini qayta yuboring.");
    } else {
      return bot.answerCallbackQuery({ callback_query_id: query.id, text: "⛔️ Hali obuna emassiz!", show_alert: true });
    }
  }
});
