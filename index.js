// === Kerakli modullar ===
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const mongoose = require('mongoose');

// === MongoDB ulanish ===
mongoose.connect('mongodb+srv://pg99lvl:Jasurbek%232008@cluster0.86xrt46.mongodb.net/?retryWrites=true&w=majority')
  .then(() => console.log("✅ MongoDB ulanish muvaffaqiyatli!"))
  .catch((err) => console.error("❌ MongoDB ulanish xatosi:", err));

// === Adminlar ro'yxati ===
const ADMINS = [6147995256];

// === Modelar ===
const fileSchema = new mongoose.Schema({
  message_id: Number,
  file_name: String,
  type: String,
  date: Number,
  section: String, // section|subSection
});
const File = mongoose.model('File', fileSchema);

const sectionSchema = new mongoose.Schema({ name: String });
const Section = mongoose.model('Section', sectionSchema);

const subSectionSchema = new mongoose.Schema({
  name: String,
  parentSection: String,
});
const SubSection = mongoose.model('SubSection', subSectionSchema);

// === Telegram sozlamalari ===
let CHANNEL_USERNAME = '@rapqonedu2024';
const FILE_GROUP_ID = -1002268361672;
const BOT_TOKEN = '7558460976:AAHYVzgJjbdex9OLfmbNogIr420mwYNjbEQ';
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// === Obuna tekshirish ===
async function isUserSubscribed(userId) {
  if (ADMINS.includes(userId)) return true;
  try {
    const res = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${CHANNEL_USERNAME}&user_id=${userId}`);
    const status = res.data.result.status;
    return ['member', 'administrator', 'creator'].includes(status);
  } catch {
    return false;
  }
}

async function removeEmptySections() {
  const sections = await Section.find();
  for (const section of sections) {
    const count = await File.countDocuments({ section: new RegExp(`^${section.name}\|`) });
    if (count === 0) {
      await Section.deleteOne({ _id: section._id });
      await SubSection.deleteMany({ parentSection: section.name });
    }
  }
}

// === Guruhdan fayl kelganda ===
bot.on('message', async (msg) => {
  if (msg.chat.id !== FILE_GROUP_ID) return;

  const fileType = msg.document ? 'document' : msg.audio ? 'audio' : msg.video ? 'video' : msg.photo ? 'photo' : null;
  const caption = msg.caption?.trim();

  if (fileType && caption && caption.includes('|')) {
    const [sectionName, subSectionName] = caption.split('|').map(s => s.trim());

    let section = await Section.findOne({ name: sectionName });
    if (!section) {
      section = new Section({ name: sectionName });
      await section.save();
    }

    let subSection = await SubSection.findOne({ name: subSectionName, parentSection: sectionName });
    if (!subSection) {
      subSection = new SubSection({ name: subSectionName, parentSection: sectionName });
      await subSection.save();
    }

    const file = new File({
      message_id: msg.message_id,
      file_name: msg.document?.file_name || `${fileType} fayl`,
      type: fileType,
      date: msg.date,
      section: `${sectionName}|${subSectionName}`,
    });

    await file.save();
  }
});

// === /start ===
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const subscribed = await isUserSubscribed(userId);
  if (!subscribed) {
    return bot.sendMessage(chatId, `Iltimos, ${CHANNEL_USERNAME} kanaliga obuna bo‘ling`, {
      reply_markup: {
        inline_keyboard: [[{ text: "Kanalga o'tish", url: `https://t.me/${CHANNEL_USERNAME.replace('@', '')}` }]]
      }
    });
  }

  const sections = await Section.find();
  if (sections.length === 0) return bot.sendMessage(chatId, "Bo‘limlar mavjud emas.");

  const keyboard = sections.map(sec => [{ text: sec.name, callback_data: `section_${sec.name}` }]);
  bot.sendMessage(chatId, "Bo‘limni tanlang:", { reply_markup: { inline_keyboard: keyboard } });
});

// === Callback handler ===
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;

  if (data === 'admin_manage_sections' && ADMINS.includes(userId)) {
    const sections = await Section.find();
    const keyboard = sections.map(s => [{ text: `🗑 ${s.name}`, callback_data: `del_section_${s.name}` }]);
    return bot.sendMessage(chatId, 'Bo‘limlardan birini o‘chiring:', { reply_markup: { inline_keyboard: keyboard } });
  }

  if (data === 'admin_add_section' && ADMINS.includes(userId)) {
    return bot.sendMessage(chatId, 'Yangi bo‘lim nomini yuboring:');
  }

  if (data.startsWith('del_section_') && ADMINS.includes(userId)) {
    const sectionName = data.replace('del_section_', '');
    await Section.deleteOne({ name: sectionName });
    await SubSection.deleteMany({ parentSection: sectionName });
    await File.deleteMany({ section: new RegExp(`^${sectionName}\|`) });
    return bot.sendMessage(chatId, `❌ ${sectionName} bo‘limi o‘chirildi.`);
  }

  if (data.startsWith('section_')) {
    const sectionName = data.replace('section_', '');
    const subs = await SubSection.find({ parentSection: sectionName });
    if (subs.length === 0) return bot.sendMessage(chatId, "Bu bo‘limda subbo‘limlar yo‘q.");

    const keyboard = subs.map(s => [{ text: s.name, callback_data: `sub_${sectionName}|${s.name}` }]);
    return bot.sendMessage(chatId, "Subbo‘limni tanlang:", { reply_markup: { inline_keyboard: keyboard } });
  }

  if (data.startsWith('sub_')) {
    const [sectionName, subSectionName] = data.replace('sub_', '').split('|');
    const files = await File.find({ section: `${sectionName}|${subSectionName}` });
    for (const file of files) {
      try {
        await bot.copyMessage(chatId, FILE_GROUP_ID, file.message_id, { caption: file.file_name });
      } catch {
        await File.deleteOne({ _id: file._id });
        await removeEmptySections();
      }
    }
    return bot.answerCallbackQuery(query.id);
  }
});

// === Admin buyruqlari ===
bot.onText(/\/admin/, (msg) => {
  if (!ADMINS.includes(msg.from.id)) return;

  bot.sendMessage(msg.chat.id, 'Admin paneli:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📂 Bo‘limlarni boshqarish', callback_data: 'admin_manage_sections' }],
        [{ text: '➕ Bo‘lim qo‘shish', callback_data: 'admin_add_section' }],
        [{ text: '➕ Subbo‘lim qo‘shish', callback_data: 'admin_add_subsection' }],
        [{ text: '👤 Admin qo‘shish', callback_data: 'admin_add_admin' }],
        [{ text: '✏️ Kanalni o‘zgartirish', callback_data: 'admin_change_channel' }],
      ]
    }
  });
});
