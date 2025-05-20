js
Копировать
Редактировать
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');

// === Sozlamalar ===
const BOT_TOKEN = '7558460976:AAHYVzgJjbdex9OLfmbNogIr420mwYNjbEQ';
const ADMINS = [2053660453]; // Admin user ID

// === MongoDB ulanish ===
mongoose.connect('mongodb+srv://pg99lvl:Jasurbek%232008@cluster0.86xrt46.mongodb.net/?retryWrites=true&w=majority')
  .then(() => console.log("✅ MongoDB ulanish muvaffaqiyatli"))
  .catch(err => console.error("❌ MongoDB xatosi:", err));

// === Modellar ===
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

// === Admin fayl qo'shish sessiyasi uchun ===
const adminSessions = {}; // { userId: { step: 'section'|'subsection'|'file', section: '', subsection: '' } }

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// /addfile komandasi - fayl qo'shishni boshlash
bot.onText(/\/addfile/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!ADMINS.includes(userId)) return;

  const sections = await Section.find();
  if (!sections.length) return bot.sendMessage(chatId, "Hech qanday bo‘lim yo‘q. Avval bo‘lim qo‘shing.");

  const keyboard = sections.map(s => [{ text: s.name, callback_data: `addfile_section_${s.name}` }]);
  adminSessions[userId] = { step: 'section' };

  bot.sendMessage(chatId, "Fayl qaysi bo‘limga qo‘shilsin?", {
    reply_markup: { inline_keyboard: keyboard }
  });
});

// Callback so‘rovlar — bo‘lim va subbo‘lim tanlash
bot.on('callback_query', async (query) => {
  const userId = query.from.id;
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data.startsWith('addfile_section_')) {
    const sectionName = data.replace('addfile_section_', '');
    const subSections = await SubSection.find({ parentSection: sectionName });

    if (!subSections.length) return bot.sendMessage(chatId, "Bu bo‘limda subbo‘lim yo‘q.");

    const keyboard = subSections.map(s => [{ text: s.name, callback_data: `addfile_sub_${sectionName}|${s.name}` }]);
    adminSessions[userId] = { step: 'subsection', section: sectionName };

    return bot.sendMessage(chatId, "Endi subbo‘limni tanlang:", {
      reply_markup: { inline_keyboard: keyboard }
    });
  }

  if (data.startsWith('addfile_sub_')) {
    const [sectionName, subName] = data.replace('addfile_sub_', '').split('|');
    adminSessions[userId] = { step: 'file', section: sectionName, subsection: subName };

    return bot.sendMessage(chatId, `✅ Endi faylni yuboring: rasm, audio, video, zip yoki hujjat bo‘lishi mumkin`);
  }

  await bot.answerCallbackQuery(query.id);
});

// Fayl qabul qilish
bot.on('message', async (msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const session = adminSessions[userId];

  if (!session || session.step !== 'file') return;

  // Fayl turi aniqlash
  const fileType = msg.document ? 'document'
    : msg.photo ? 'photo'
    : msg.audio ? 'audio'
    : msg.video ? 'video'
    : null;

  if (!fileType) return bot.sendMessage(chatId, "❗ Fayl yuboring: rasm, audio, video, hujjat (document) bo‘lishi kerak.");

  const fileName = msg.document?.file_name || `${fileType} fayl`;

  // Faylni saqlash
  const file = new File({
    message_id: msg.message_id,
    file_name: fileName,
    type: fileType,
    date: msg.date,
    section: `${session.section}|${session.subsection}`,
  });

  await file.save();

  delete adminSessions[userId];
  return bot.sendMessage(chatId, `✅ Fayl saqlandi! Bo‘lim: ${session.section} > ${session.subsection}`);
});

// Bo‘limlar va subbo‘limlar ko‘rsatish va fayllarni yuborish (foydalanuvchi uchun)
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  const sections = await Section.find();
  if (!sections.length) return bot.sendMessage(chatId, "Bo‘limlar mavjud emas.");

  const keyboard = sections.map(s => [{ text: s.name, callback_data: `section_${s.name}` }]);
  return bot.sendMessage(chatId, "Bo‘limni tanlang:", { reply_markup: { inline_keyboard: keyboard } });
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data.startsWith('section_')) {
    const sectionName = data.replace('section_', '');
    const subs = await SubSection.find({ parentSection: sectionName });
    const keyboard = subs.map(s => [{ text: s.name, callback_data: `sub_${sectionName}|${s.name}` }]);
    return bot.sendMessage(chatId, "Subbo‘limni tanlang:", { reply_markup: { inline_keyboard: keyboard } });
  }

  if (data.startsWith('sub_')) {
    const [sectionName, subName] = data.replace('sub_', '').split('|');
    const files = await File.find({ section: `${sectionName}|${subName}` });

    if (!files.length) return bot.sendMessage(chatId, "Bu subbo‘limda hech qanday fayl mavjud emas.");

    for (const file of files) {
      try {
        await bot.copyMessage(chatId, chatId, file.message_id);
      } catch (e) {
        // Agar fayl topilmasa yoki xatolik bo‘lsa, saqlangan ma'lumotni o‘chirish mumkin
        await File.deleteOne({ _id: file._id });
      }
    }
  }

  await bot.answerCallbackQuery(query.id);
