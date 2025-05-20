const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');

// === SETTINGS ===
const bot = new TelegramBot('7558460976:AAHYVzgJjbdex9OLfmbNogIr420mwYNjbEQ', { polling: true });
const mongoUri = 'mongodb+srv://uzbekgeber:Geber2024@cluster0.6xnrxs1.mongodb.net/mybot?retryWrites=true&w=majority&appName=Cluster0';
const groupId = -1002268361672;
let channelUsername = '@rapqonedu2024';

// === SCHEMAS ===
const adminSchema = new mongoose.Schema({ user_id: Number });
const channelSchema = new mongoose.Schema({ username: String });
const sectionSchema = new mongoose.Schema({ name: String, parent: { type: mongoose.Schema.Types.ObjectId, default: null } });
const fileSchema = new mongoose.Schema({ file_id: String, file_name: String, section_id: mongoose.Schema.Types.ObjectId });

const Admin = mongoose.model('Admin', adminSchema);
const Channel = mongoose.model('Channel', channelSchema);
const Section = mongoose.model('Section', sectionSchema);
const File = mongoose.model('File', fileSchema);

// === STATES ===
const userStates = new Map();

function setUserState(userId, state, data = {}) {
  userStates.set(userId, { state, ...data });
}

function getUserState(userId) {
  return userStates.get(userId);
}

function clearUserState(userId) {
  userStates.delete(userId);
}

// === FUNCTIONS ===
async function isAdmin(userId) {
  const admin = await Admin.findOne({ user_id: userId });
  return !!admin;
}

function showAdminMenu(chatId) {
  const keyboard = [
    [{ text: "📁 Bo‘lim qo‘shish", callback_data: 'add_section' }],
    [{ text: "📂 Subbo‘lim qo‘shish", callback_data: 'add_subsection' }],
    [{ text: "📄 Fayl qo‘shish", callback_data: 'add_file' }],
    [{ text: "➕ Admin qo‘shish", callback_data: 'add_admin' }],
    [{ text: "⚙️ Kanalni o‘zgartirish", callback_data: 'set_channel' }],
  ];
  bot.sendMessage(chatId, "Admin menyusi:", { reply_markup: { inline_keyboard: keyboard } });
}

// === START ===
bot.onText(/\/start/, async (msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;

  try {
    const res = await bot.getChatMember(channelUsername, userId);
    if (['member', 'administrator', 'creator'].includes(res.status)) {
      const isAdminUser = await isAdmin(userId);
      if (isAdminUser) return showAdminMenu(chatId);

      const sections = await Section.find({ parent: null });
      const keyboard = sections.map(sec => ([{ text: sec.name, callback_data: `parent_${sec._id}` }]));
      bot.sendMessage(chatId, "📁 Bo‘limlardan birini tanlang:", {
        reply_markup: { inline_keyboard: keyboard }
      });
    } else {
      bot.sendMessage(chatId, `❌ Avval ${channelUsername} kanaliga obuna bo‘ling!`);
    }
  } catch (err) {
    bot.sendMessage(chatId, `⚠️ Obuna tekshiruvida xatolik. Kanal: ${channelUsername}`);
  }
});

// === CALLBACKS ===
bot.on('callback_query', async (query) => {
  const userId = query.from.id;
  const chatId = query.message.chat.id;
  const data = query.data;

  if (!(await isAdmin(userId)) && !data.startsWith("parent_")) {
    return bot.answerCallbackQuery(query.id, { text: "Faqat adminlar uchun!" });
  }

  if (data === 'add_section') {
    setUserState(userId, 'awaiting_section_name');
    return bot.sendMessage(chatId, "Bo‘lim nomini kiriting:");
  }

  if (data === 'add_subsection') {
    const sections = await Section.find({ parent: null });
    const keyboard = sections.map(sec => ([{ text: sec.name, callback_data: `choose_parent_${sec._id}` }]));
    return bot.sendMessage(chatId, "Qaysi bo‘limga subbo‘lim qo‘shamiz?", { reply_markup: { inline_keyboard: keyboard } });
  }

  if (data.startsWith('choose_parent_')) {
    const parentId = data.split('_')[2];
    setUserState(userId, 'awaiting_subsection_name', { parentId });
    return bot.sendMessage(chatId, "Subbo‘lim nomini kiriting:");
  }

  if (data === 'add_file') {
    const parents = await Section.find({ parent: { $ne: null } });
    const keyboard = parents.map(sec => ([{ text: sec.name, callback_data: `uploadfile_${sec._id}` }]));
    return bot.sendMessage(chatId, "Faylni qaysi subbo‘limga joylaymiz?", { reply_markup: { inline_keyboard: keyboard } });
  }

  if (data.startsWith('uploadfile_')) {
    const sectionId = data.split('_')[1];
    setUserState(userId, 'awaiting_file', { sectionId });
    return bot.sendMessage(chatId, "Iltimos faylni yuboring:");
  }

  if (data === 'add_admin') {
    setUserState(userId, 'awaiting_admin_id');
    return bot.sendMessage(chatId, "Yangi adminning Telegram ID raqamini yuboring:");
  }

  if (data === 'set_channel') {
    setUserState(userId, 'awaiting_channel_username');
    return bot.sendMessage(chatId, "Yangi kanal username (masalan: @mychannel):");
  }

  if (data.startsWith('parent_')) {
    const parentId = data.split('_')[1];
    const subSections = await Section.find({ parent: parentId });
    if (subSections.length === 0) return bot.sendMessage(chatId, "Subbo‘limlar mavjud emas.");
    const keyboard = subSections.map(sec => ([{ text: sec.name, callback_data: `sub_${sec._id}` }]));
    return bot.sendMessage(chatId, "Subbo‘limni tanlang:", { reply_markup: { inline_keyboard: keyboard } });
  }

  if (data.startsWith('sub_')) {
    const sectionId = data.split('_')[1];
    const files = await File.find({ section_id: sectionId });
    if (files.length === 0) return bot.sendMessage(chatId, "Fayllar topilmadi.");
    for (const file of files) {
      await bot.sendDocument(chatId, file.file_id, { caption: file.file_name });
    }
  }
});

// === MESSAGE HANDLER ===
bot.on('message', async (msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const state = getUserState(userId);
  if (!state) return;

  if (state.state === 'awaiting_section_name') {
    await Section.create({ name: msg.text });
    bot.sendMessage(chatId, "✅ Bo‘lim qo‘shildi.");
    clearUserState(userId);
  }

  if (state.state === 'awaiting_subsection_name') {
    await Section.create({ name: msg.text, parent: state.parentId });
    bot.sendMessage(chatId, "✅ Subbo‘lim qo‘shildi.");
    clearUserState(userId);
  }

  if (state.state === 'awaiting_file' && msg.document) {
    await File.create({
      file_id: msg.document.file_id,
      file_name: msg.document.file_name,
      section_id: state.sectionId
    });
    bot.sendMessage(chatId, "✅ Fayl saqlandi.");
    clearUserState(userId);
  }

  if (state.state === 'awaiting_admin_id') {
    const newId = parseInt(msg.text);
    if (!isNaN(newId)) {
      await Admin.create({ user_id: newId });
      bot.sendMessage(chatId, `✅ Admin qo‘shildi: ${newId}`);
    } else {
      bot.sendMessage(chatId, "❌ Noto‘g‘ri ID.");
    }
    clearUserState(userId);
  }

  if (state.state === 'awaiting_channel_username') {
    const username = msg.text.startsWith('@') ? msg.text : `@${msg.text}`;
    await Channel.deleteMany({});
    await Channel.create({ username });
    channelUsername = username;
    bot.sendMessage(chatId, `✅ Kanal yangilandi: ${username}`);
    clearUserState(userId);
  }
});

// === MONGOOSE CONNECTION ===

mongoose.connect('mongodb+srv://pg99lvl:Jasurbek%232008@cluster0.86xrt46.mongodb.net/?retryWrites=true&w=majority')
  .then(() => console.log("✅ MongoDB ulanish muvaffaqiyatli!"))
  .catch((err) => console.error("❌ MongoDB ulanish xatosi:", err));
