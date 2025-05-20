const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');

// MongoDB ulanish
mongoose.connect('mongodb+srv://pg99lvl:Jasurbek%232008@cluster0.86xrt46.mongodb.net/?retryWrites=true&w=majority')
  .then(() => console.log("✅ MongoDB ulandi"))
  .catch(err => console.error("❌ Mongo xato:", err));

// ==== Modelalar ====
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

// ==== Doimiy admin ====
const MY_USER_ID = 2053660453;
(async () => {
  const existing = await Admin.findOne({ user_id: MY_USER_ID });
  if (!existing) {
    await new Admin({ user_id: MY_USER_ID }).save();
    console.log(`✅ Doimiy admin qo‘shildi: ${MY_USER_ID}`);
  } else {
    console.log(`ℹ️ Admin avvaldan mavjud: ${MY_USER_ID}`);
  }

  // Obuna kanali sozlamasi mavjud bo'lmasa, qo'shamiz
  const set = await Settings.findOne();
  if (!set) {
    await new Settings({ channel_username: '@rapqonedu2024' }).save();
    console.log("✅ Kanal nomi o‘rnatildi: @rapqonedu2024");
  }
})();

// ==== Telegram sozlamalari ====
const BOT_TOKEN = '7558460976:AAHYVzgJjbdex9OLfmbNogIr420mwYNjbEQ';
const FILE_GROUP_ID = -1002268361672;
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ==== Tekshiruv funksiyalari ====
async function isAdmin(userId) {
  return await Admin.exists({ user_id: userId });
}

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

// ==== Guruhdan fayl kelganda ====
bot.on('message', async (msg) => {
  if (msg.chat.id !== FILE_GROUP_ID) return;

  const caption = msg.caption?.trim();
  const fileType = msg.document ? 'document' :
                   msg.audio ? 'audio' :
                   msg.video ? 'video' :
                   msg.photo ? 'photo' : null;

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

// ==== /start ====
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!(await isAdmin(userId)) && !(await isUserSubscribed(userId))) {
    const settings = await Settings.findOne();
    return bot.sendMessage(chatId, `❗️ Botdan foydalanish uchun kanalga obuna bo‘ling: ${settings.channel_username}`, {
      reply_markup: {
        inline_keyboard: [[
          { text: "🔗 Obuna bo‘lish", url: `https://t.me/${settings.channel_username.replace('@', '')}` }
        ]]
      }
    });
  }

  if (await isAdmin(userId)) {
    return bot.sendMessage(chatId, "🔧 Admin panel:", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "➕ Bo‘lim qo‘shish", callback_data: "add_section" }],
        ]
      }
    });
  }

  const parents = await Section.find({ parent: null });
  if (parents.length === 0) return bot.sendMessage(chatId, "Bo‘limlar mavjud emas.");

  const keyboard = parents.map(sec => ([{ text: sec.name, callback_data: `parent_${sec._id}` }]));
  bot.sendMessage(chatId, "Bo‘limni tanlang:", { reply_markup: { inline_keyboard: keyboard } });
});

// ==== Inline tugmalar ====
bot.on('callback_query', async (query) => {
  const data = query.data;
  const chatId = query.message.chat.id;
  const userId = query.from.id;

  if (data === "add_section") {
    bot.sendMessage(chatId, "Bo‘lim nomini yuboring:");
    bot.once("message", async (msg) => {
      const name = msg.text;
      const newSection = await new Section({ name }).save();
      bot.sendMessage(chatId, `✅ Bo‘lim yaratildi: ${name}`);

      bot.sendMessage(chatId, `📁 ${name} uchun subbo‘lim nomini yuboring:`);
      bot.once("message", async (submsg) => {
        const subName = submsg.text;
        await new Section({ name: subName, parent: newSection._id }).save();
        bot.sendMessage(chatId, `✅ Subbo‘lim qo‘shildi: ${subName}`);
      });
    });
    return;
  }

  if (data.startsWith('parent_')) {
    const parentId = data.split('_')[1];
    const subs = await Section.find({ parent: parentId });
    if (subs.length === 0) return bot.sendMessage(chatId, "Ichki bo‘lim yo‘q.");

    const keyboard = subs.map(s => ([{ text: s.name, callback_data: `sub_${s._id}` }]));
    return bot.sendMessage(chatId, "Subbo‘limni tanlang:", { reply_markup: { inline_keyboard: keyboard } });
  }

  if (data.startsWith('sub_')) {
    const sectionId = data.split('_')[1];
    const files = await File.find({ section_id: sectionId }).sort({ date: -1 });

    if (files.length === 0) return bot.sendMessage(chatId, "❌ Bu bo‘limda fayllar yo‘q.");

    for (const file of files) {
      try {
        await bot.copyMessage(chatId, FILE_GROUP_ID, file.message_id, { caption: file.file_name });
      } catch {
        await File.deleteOne({ _id: file._id });
      }
    }
  }

  bot.answerCallbackQuery(query.id);
});
