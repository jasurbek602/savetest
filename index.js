js
Copy
Edit
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');

// === Sozlamalar ===
const BOT_TOKEN = '7558460976:AAHYVzgJjbdex9OLfmbNogIr420mwYNjbEQ';
const FILE_GROUP_ID = -1002268361672; // Guruh IDsi, agar fayllar botga to'g'ridan-to'g'ri yuborilsa, kerak emas
const MY_USER_ID = 2053660453; // O'z Telegram ID'ing

// === MongoDB ulanish ===
mongoose.connect('mongodb+srv://pg99lvl:Jasurbek%232008@cluster0.86xrt46.mongodb.net/mybotdb?retryWrites=true&w=majority')
  .then(() => console.log("✅ MongoDB ulandi"))
  .catch(err => console.error("❌ MongoDB xato:", err));

// === Schemalari ===
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
  file_id: String,
  file_type: String,
  file_name: String,
  section_id: mongoose.Schema.Types.ObjectId,
  date: Number,
});
const File = mongoose.model('File', fileSchema);

// === Telegram bot ===
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// === Adminni doimiy qo'shish ===
(async () => {
  const existAdmin = await Admin.findOne({ user_id: MY_USER_ID });
  if (!existAdmin) {
    await new Admin({ user_id: MY_USER_ID }).save();
    console.log(`✅ Siz admin qilib qo‘shildingiz: ${MY_USER_ID}`);
  } else {
    console.log(`ℹ️ Admin avvaldan mavjud: ${MY_USER_ID}`);
  }
})();

// === Obuna tekshirish ===
async function isUserSubscribed(userId) {
  if (await isAdmin(userId)) return true; // adminlarga obuna tekshiruvi yo'q
  const settings = await Settings.findOne();
  if (!settings || !settings.channel_username) return false;
  try {
    const member = await bot.getChatMember(settings.channel_username, userId);
    return ['member', 'administrator', 'creator'].includes(member.status);
  } catch {
    return false;
  }
}

// === Admin tekshirish ===
async function isAdmin(userId) {
  return await Admin.exists({ user_id: userId });
}

// === /start komandasi ===
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!(await isUserSubscribed(userId))) {
    const settings = await Settings.findOne();
    return bot.sendMessage(chatId, `Iltimos, @${settings?.channel_username?.replace('@', '')} kanaliga obuna bo‘ling:`, {
      reply_markup: {
        inline_keyboard: [[
          { text: "Kanalga o'tish", url: `https://t.me/${settings?.channel_username?.replace('@', '')}` }
        ]]
      }
    });
  }

  if (await isAdmin(userId)) {
    return showAdminMenu(chatId);
  } else {
    // Oddiy foydalanuvchi bo'limlarni ko'radi
    const parents = await Section.find({ parent: null });
    if (parents.length === 0) return bot.sendMessage(chatId, "Bo‘limlar mavjud emas.");
    const keyboard = parents.map(sec => ([{ text: sec.name, callback_data: `parent_${sec._id}` }]));
    return bot.sendMessage(chatId, "Bo‘limni tanlang:", { reply_markup: { inline_keyboard: keyboard } });
  }
});

// === Admin asosiy menyusi ===
async function showAdminMenu(chatId) {
  const keyboard = [
    [{ text: '📁 Hamma bo‘limlar', callback_data: 'admin_sections' }],
    [{ text: '➕ Bo‘lim yaratish', callback_data: 'admin_add_section' }],
    [{ text: '➕ Admin qo‘shish', callback_data: 'admin_add_admin' }],
    [{ text: '🔄 Kanalni o‘zgartirish', callback_data: 'admin_change_channel' }],
  ];
  await bot.sendMessage(chatId, "Admin menyusi:", { reply_markup: { inline_keyboard: keyboard } });
}

// === Inline callback query ===
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;

  if (!await isAdmin(userId)) {
    return bot.answerCallbackQuery(query.id, { text: "Faqat adminlar uchun!" });
  }

  // Admin menyu ishlovchi qismlar
  if (data === 'admin_sections') {
    const sections = await Section.find({ parent: null });
    if (sections.length === 0) return bot.sendMessage(chatId, "Bo‘limlar mavjud emas.");
    const keyboard = sections.map(sec => ([{ text: sec.name, callback_data: `admin_section_${sec._id}` }]));
    keyboard.push([{ text: '⬅️ Ortga', callback_data: 'admin_back' }]);
    return bot.editMessageText("Bo‘limlardan birini tanlang:", {
      chat_id: chatId,
      message_id: query.message.message_id,
      reply_markup: { inline_keyboard: keyboard },
    });
  }

  if (data === 'admin_back') {
    return showAdminMenu(chatId);
  }

  if (data === 'admin_add_section') {
    await bot.sendMessage(chatId, "Yangi bo‘lim nomini yuboring:");
    setUserState(userId, 'adding_section');
    return bot.answerCallbackQuery(query.id);
  }

  if (data === 'admin_add_admin') {
    await bot.sendMessage(chatId, "Qo‘shmoqchi bo‘lgan adminning Telegram ID raqamini yuboring:");
    setUserState(userId, 'adding_admin');
    return bot.answerCallbackQuery(query.id);
  }

  if (data === 'admin_change_channel') {
    await bot.sendMessage(chatId, "Yangi kanal username (@ bilan) ni yuboring:");
    setUserState(userId, 'changing_channel');
    return bot.answerCallbackQuery(query.id);
  }

  if (data.startsWith('admin_section_')) {
    const sectionId = data.split('_')[2];
    const section = await Section.findById(sectionId);
    if (!section) return bot.sendMessage(chatId, "Bo‘lim topilmadi.");

    const subSections = await Section.find({ parent: section._id });
    const files = await File.find({ section_id: section._id });

    const keyboard = [];

    // Subbo'limlar
    subSections.forEach(s => keyboard.push([{ text: `📂 ${s.name}`, callback_data: `admin_subsection_${s._id}` }]));

    // Fayllar
    if (files.length > 0) {
      files.forEach(f => {
        keyboard.push([{ text: `📄 ${f.file_name}`, callback_data: `admin_file_${f._id}` }]);
      });
    }

    // Bo‘lim uchun tugmalar
    keyboard.push([{ text: '➕ Subbo‘lim yaratish', callback_data: `admin_add_subsection_${section._id}` }]);
    keyboard.push([{ text: '➕ Fayl yuklash', callback_data: `admin_upload_file_${section._id}` }]);
    keyboard.push([{ text: '🗑️ Bo‘limni o‘chirish', callback_data: `admin_delete_section_${section._id}` }]);
    keyboard.push([{ text: '⬅️ Ortga', callback_data: 'admin_sections' }]);

    await bot.editMessageText(`Bo‘lim: ${section.name}`, {
      chat_id: chatId,
      message_id: query.message.message_id,
      reply_markup: { inline_keyboard: keyboard },
    });
    return bot.answerCallbackQuery(query.id);
  }

  if (data.startsWith('admin_subsection_')) {
    const subsectionId = data.split('_')[2];
    const subsection = await Section.findById(subsectionId);
    if (!subsection) return bot.sendMessage(chatId, "Ichki bo‘lim topilmadi.");

    const files = await File.find({ section_id: subsection._id });
    const keyboard = [];

    if (files.length > 0) {
      files.forEach(f => {
        keyboard.push([{ text: `📄 ${f.file_name}`, callback_data: `admin_file_${f._id}` }]);
      });
    }

    keyboard.push([{ text: '➕ Fayl yuklash', callback_data: `admin_upload_file_${subsection._id}` }]);
    keyboard.push([{ text: '🗑️ Ichki bo‘limni o‘chirish', callback_data: `admin_delete_section_${subsection._id}` }]);
    keyboard.push([{ text: '⬅️ Ortga', callback_data: `admin_section_${subsection.parent}` }]);

    await bot.editMessageText(`Ichki bo‘lim: ${subsection.name}`, {
      chat_id: chatId,
      message_id: query.message.message_id,
      reply_markup: { inline_keyboard: keyboard },
    });
    return bot.answerCallbackQuery(query.id);
  }

  if (data.startsWith('admin_delete_section_')) {
    const sectionId = data.split('_')[3];
    // O‘chirish uchun bolalar va fayllarni ham o‘chirish kerak
    await deleteSectionRecursively(sectionId);
    await bot.editMessageText("Bo‘lim o‘chirildi.", {
      chat_id: chatId,
      message_id: query.message.message_id,
    });
    return showAdminMenu(chatId);
  }

  if (data.startsWith('admin_upload_file_')) {
    const sectionId = data.split('_')[3];
    await bot.sendMessage(chatId, "Iltimos, yuklamoqchi bo‘lgan faylingizni yuboring (botga to‘g‘ridan-to‘g‘ri).");
    setUserState(userId, 'uploading_file', { sectionId });
    return bot.answerCallbackQuery(query.id);
  }

  // Faylga oid callbacklar (masalan ko‘rsatish) hozircha oddiy
  if (data.startsWith('admin_file_')) {
    const fileId = data.split('_')[2];
    const file = await File.findById(fileId);
    if (!file) return bot.sendMessage(chatId, "Fayl topilmadi.");
    try {
      await bot.copyMessage(chatId, chatId, file.file_id, {});
    } catch (e) {
      return bot.sendMessage(chatId, "Faylni yuborishda xatolik yuz berdi.");
    }
    return bot.answerCallbackQuery(query.id);
  }
  bot.answerCallbackQuery(query.id);
});

// === State saqlash uchun oddiy xotira (userId -> state) ===
const userStates = {};

function setUserState(userId, state, data = null) {
  userStates[userId] = { state, data };
}

function clearUserState(userId) {
  delete userStates[userId];
}

// === Xabarlarni qabul qilish ===
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!await isAdmin(userId)) return; // Adminlarga tegishli xabarlar uchun

  const userState = userStates[userId];
  if (!userState) return;

  switch (userState.state) {
    case 'adding_section':
      {
        const name = msg.text?.trim();
        if (!name) return bot.sendMessage(chatId, "Noto‘g‘ri nom kiritildi. Iltimos qaytadan urinib ko‘ring.");
        await new Section({ name, parent: null }).save();
        await bot.sendMessage(chatId, `Bo‘lim "${name}" yaratildi.`);
        clearUserState(userId);
        return showAdminMenu(chatId);
      }
    case 'adding_admin':
      {
        const id = parseInt(msg.text);
        if (!id || isNaN(id)) return bot.sendMessage(chatId, "To‘g‘ri Telegram ID kiriting.");
        const exists = await Admin.findOne({ user_id: id });
        if (exists) return bot.sendMessage(chatId, "Bu foydalanuvchi allaqachon admin.");
        await new Admin({ user_id: id }).save();
        await bot.sendMessage(chatId, `Foydalanuvchi ID ${id} admin qilib qo‘shildi.`);
        clearUserState(userId);
        return showAdminMenu(chatId);
      }
    case 'changing_channel':
      {
        const ch = msg.text.trim();
        if (!ch.startsWith('@')) return bot.sendMessage(chatId, "Username @ bilan boshlanishi kerak.");
        let s = await Settings.findOne();
        if (!s) {
          s = new Settings({ channel_username: ch });
        } else {
          s.channel_username = ch;
        }
        await s.save();
        await bot.sendMessage(chatId, `Kanal username o‘zgartirildi: ${ch}`);
        clearUserState(userId);
        return showAdminMenu(chatId);
      }
    case 'uploading_file':
      {
        if (!msg.document && !msg.video && !msg.audio && !msg.photo) {
          return bot.sendMessage(chatId, "Iltimos, fayl yuboring.");
        }

        const sectionId = userState.data.sectionId;
        let file_id, file_type, file_name;

        if (msg.document) {
          file_id = msg.document.file_id;
          file_type = 'document';
          file_name = msg.document.file_name || 'Fayl';
        } else if (msg.video) {
          file_id = msg.video.file_id;
          file_type = 'video';
          file_name = msg.video.file_name || 'Video';
        } else if (msg.audio) {
          file_id = msg.audio.file_id;
          file_type = 'audio';
          file_name = msg.audio.file_name || 'Audio';
        } else if (msg.photo) {
          // Eng oxirgi eng katta foto file_id
          const photoArray = msg.photo;
          file_id = photoArray[photoArray.length - 1].file_id;
          file_type = 'photo';
          file_name = 'Rasm';
        }

        const f = new File({
          file_id,
          file_type,
          file_name,
          section_id: sectionId,
          date: Date.now(),
        });

        await f.save();

        await bot.sendMessage(chatId, `Fayl bo‘limga yuklandi: ${file_name}`);

        clearUserState(userId);
        return showAdminMenu(chatId);
      }
  }
});

// === Bo‘limni o‘chirish uchun rekursiv funksiya ===
async function deleteSectionRecursively(sectionId) {
  // Avval farzand bo'limlarni o'chirish
  const children = await Section.find({ parent: sectionId });
  for (const c of children) {
    await deleteSectionRecursively(c._id);
  }
  // Fayllarni o'chirish
  await File.deleteMany({ section_id: sectionId });
  // O'zini o'chirish
  await Section.deleteOne({ _id: sectionId });
}

// === Oddiy foydalanuvchi uchun bo'limlar va fayllarni ko'rsatish ===
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;

  if (await isAdmin(userId)) return; // Adminlarga yuqorida javob berildi

  if (!(await isUserSubscribed(userId))) {
    const settings = await Settings.findOne();
    return bot.answerCallbackQuery(query.id, `Iltimos, @${settings?.channel_username?.replace('@', '')} kanaliga obuna bo‘ling.`);
  }

  if (data.startsWith('parent_')) {
    const sectionId = data.split('_')[1];
    const subsections = await Section.find({ parent: sectionId });
    const files = await File.find({ section_id: sectionId });
    const keyboard = [];

    subsections.forEach(s => keyboard.push([{ text: `📂 ${s.name}`, callback_data: `subsection_${s._id}` }]));
    files.forEach(f => keyboard.push([{ text: `📄 ${f.file_name}`, callback_data: `file_${f._id}` }]));

    keyboard.push([{ text: '⬅️ Ortga', callback_data: 'back_to_parents' }]);

    return bot.editMessageText("Tanlang:", {
      chat_id: chatId,
      message_id: query.message.message_id,
      reply_markup: { inline_keyboard: keyboard },
    });
  }

  if (data === 'back_to_parents') {
    const parents = await Section.find({ parent: null });
    const keyboard = parents.map(sec => ([{ text: sec.name, callback_data: `parent_${sec._id}` }]));
    return bot.editMessageText("Bo‘limni tanlang:", {
      chat_id: chatId,
      message_id: query.message.message_id,
      reply_markup: { inline_keyboard: keyboard },
    });
  }

  if (data.startsWith('subsection_')) {
    const subsectionId = data.split('_')[1];
    const files = await File.find({ section_id: subsectionId });
    const keyboard = files.map(f => ([{ text: f.file_name, callback_data: `file_${f._id}` }]));
    keyboard.push([{ text: '⬅️ Ortga', callback_data: `parent_${(await Section.findById(subsectionId)).parent}` }]);
    return bot.editMessageText("Fayllar:", {
      chat_id: chatId,
      message_id: query.message.message_id,
      reply_markup: { inline_keyboard: keyboard },
    });
  }

  if (data.startsWith('file_')) {
    const fileId = data.split('_')[1];
    const file = await File.findById(fileId);
    if (!file) return bot.sendMessage(chatId, "Fayl topilmadi.");
    try {
      await bot.copyMessage(chatId, chatId, file.file_id, {});
    } catch {
      return bot.sendMessage(chatId, "Faylni yuborishda xatolik yuz berdi.");
    }
  }

  bot.answerCallbackQuery(query.id);
});

// === Bot ishga tushdi ===
console.log("✅ Bot ishga tushdi");
