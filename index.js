const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');


// === MongoDB ulanish ===
mongoose.connect('mongodb+srv://pg99lvl:Jasurbek%232008@cluster0.86xrt46.mongodb.net/?retryWrites=true&w=majority')
  .then(() => console.log("✅ MongoDB ulandi"))
  .catch(err => console.error("❌ Mongo xato:", err));

// === Admin modeli ===
const adminSchema = new mongoose.Schema({ user_id: Number });
const Admin = mongoose.model('Admin', adminSchema);

// === Sozlama modeli ===
const settingsSchema = new mongoose.Schema({ channel_username: String });
const Settings = mongoose.model('Settings', settingsSchema);

// === Bo‘lim modeli ===
const sectionSchema = new mongoose.Schema({
  name: String,
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', default: null },
});
const Section = mongoose.model('Section', sectionSchema);

// === Fayl modeli ===
const fileSchema = new mongoose.Schema({
  message_id: Number,
  file_name: String,
  type: String,
  date: Number,
  section_id: mongoose.Schema.Types.ObjectId,
});
const File = mongoose.model('File', fileSchema);

// === Telegram ===
const BOT_TOKEN = '7558460976:AAHYVzgJjbdex9OLfmbNogIr420mwYNjbEQ';
const FILE_GROUP_ID = -1002268361672;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// === Obuna tekshirish ===
async function isUserSubscribed(userId) {
  const settings = await Settings.findOne();
  const channel = settings?.channel_username;
  if (!channel) return false;

  try {
    const res = await bot.getChatMember(channel, userId);
    return ['member', 'administrator', 'creator'].includes(res.status);
  } catch {
    return false;
  }
}

// === Admin tekshirish ===
async function isAdmin(userId) {
  return await Admin.exists({ user_id: userId });
}

// === Fayl kelganda (guruhdan) ===
bot.on('message', async (msg) => {
  if (msg.chat.id !== FILE_GROUP_ID) return;

  const caption = msg.caption?.trim();
  const fileType = msg.document ? 'document' : msg.audio ? 'audio' : msg.video ? 'video' : msg.photo ? 'photo' : null;

  if (!caption || !fileType) return;

  // caption = ichki bo‘lim nomi
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

// === /start komandasi ===
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!await isUserSubscribed(userId)) {
    const settings = await Settings.findOne();
    return bot.sendMessage(chatId, `Iltimos, ${settings?.channel_username} kanaliga obuna bo‘ling:`, {
      reply_markup: {
        inline_keyboard: [[
          { text: "Kanalga o'tish", url: `https://t.me/${settings?.channel_username.replace('@', '')}` }
        ]]
      }
    });
  }

  const parents = await Section.find({ parent: null });
  if (parents.length === 0) return bot.sendMessage(chatId, "Bo‘limlar mavjud emas.");

  const keyboard = parents.map(sec => ([{ text: sec.name, callback_data: `parent_${sec._id}` }]));
  bot.sendMessage(chatId, "Bo‘limni tanlang:", { reply_markup: { inline_keyboard: keyboard } });
});

// === Inline tugmalar ===
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const userId = query.from.id;

  if (data.startsWith('parent_')) {
    const parentId = data.split('_')[1];
    const subSections = await Section.find({ parent: parentId });

    if (subSections.length === 0) return bot.sendMessage(chatId, "Ichki bo‘lim mavjud emas.");

    const keyboard = subSections.map(sec => ([{ text: sec.name, callback_data: `sub_${sec._id}` }]));
    return bot.sendMessage(chatId, "Ichki bo‘limni tanlang:", { reply_markup: { inline_keyboard: keyboard } });
  }

  if (data.startsWith('sub_')) {
    const sectionId = data.split('_')[1];
    const files = await File.find({ section_id: sectionId }).sort({ date: -1 });

    if (files.length === 0) return bot.sendMessage(chatId, "Bu bo‘limda fayl yo‘q.");

    for (const file of files) {
      try {
        await bot.copyMessage(chatId, FILE_GROUP_ID, file.message_id, { caption: file.file_name });
      } catch {
        await File.deleteOne({ _id: file._id });
      }
    }
  }

  await bot.answerCallbackQuery(query.id);
});

// === Admin komandalar ===
bot.onText(/\/add_admin (\d+)/, async (msg, match) => {
  if (!await isAdmin(msg.from.id)) return;

  const newAdminId = parseInt(match[1]);
  await Admin.updateOne({ user_id: newAdminId }, {}, { upsert: true });
  bot.sendMessage(msg.chat.id, `✅ Admin qo‘shildi: ${newAdminId}`);
});

bot.onText(/\/set_channel (.+)/, async (msg, match) => {
  if (!await isAdmin(msg.from.id)) return;

  const channel = match[1].startsWith('@') ? match[1] : '@' + match[1];
  await Settings.deleteMany();
  await new Settings({ channel_username: channel }).save();
  bot.sendMessage(msg.chat.id, `✅ Kanal yangilandi: ${channel}`);
});

bot.onText(/\/add_section (.+)/, async (msg, match) => {
  if (!await isAdmin(msg.from.id)) return;

  const name = match[1];
  await new Section({ name }).save();
  bot.sendMessage(msg.chat.id, `✅ Bo‘lim yaratildi: ${name}`);
});

bot.onText(/\/add_subsection (.+) -> (.+)/, async (msg, match) => {
  if (!await isAdmin(msg.from.id)) return;

  const [parentName, subName] = [match[1], match[2]];
  const parent = await Section.findOne({ name: parentName, parent: null });
  if (!parent) return bot.sendMessage(msg.chat.id, "❌ Asosiy bo‘lim topilmadi.");

  await new Section({ name: subName, parent: parent._id }).save();
  bot.sendMessage(msg.chat.id, `✅ Ichki bo‘lim yaratildi: ${subName}`);
});
