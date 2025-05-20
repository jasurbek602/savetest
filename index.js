const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');

// === MongoDB ulanish ===
mongoose.connect('mongodb+srv://pg99lvl:Jasurbek%232008@cluster0.86xrt46.mongodb.net/?retryWrites=true&w=majority')
  .then(() => console.log("✅ MongoDB ulandi"))
  .catch(err => console.error("❌ Mongo xato:", err));

// === Schemalarning e'lon qilinishi ===
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
  file_name: String,
  section: { type: mongoose.Schema.Types.ObjectId, ref: 'Section' },
  uploaded_by: Number,
  uploaded_at: { type: Date, default: Date.now }
});
const File = mongoose.model('File', fileSchema);

// === Bot token va guruh ID sini o'zgartiring ===
const BOT_TOKEN = '7558460976:AAHYVzgJjbdex9OLfmbNogIr420mwYNjbEQ';
const FILE_GROUP_ID = -1002268361672; // Fayllar guruh IDsi

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// === Sizning Telegram user ID (doim admin qilib qo'yiladi) ===
const MY_USER_ID = 2053660453;

// === Adminni bazaga kiritish (bot ishga tushganda) ===
(async () => {
  const existingAdmin = await Admin.findOne({ user_id: MY_USER_ID });
  if (!existingAdmin) {
    await new Admin({ user_id: MY_USER_ID }).save();
    console.log(`✅ Siz admin qilib qo‘shildingiz: ${MY_USER_ID}`);
  } else {
    console.log(`ℹ️ Admin avvaldan mavjud: ${MY_USER_ID}`);
  }
})();

// === Sessiyalar obyekti adminlar uchun harakatlarni boshqarish uchun ===
const sessions = {};

// === Helper funksiyalar ===
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

async function isAdmin(userId) {
  return await Admin.exists({ user_id: userId });
}

// === Asosiy admin menyusi inline keyboard ===
const adminMenu = {
  reply_markup: {
    inline_keyboard: [
      [{ text: '📺 Kanalni o\'rnatish', callback_data: 'set_channel' }],
      [{ text: '➕ Admin qo\'shish', callback_data: 'add_admin' }],
      [{ text: '📂 Bo\'lim yaratish', callback_data: 'add_section' }],
      [{ text: '📁 Ichki bo\'lim yaratish', callback_data: 'add_subsection' }],
      [{ text: '📤 Fayl yuklash', callback_data: 'upload_file' }],
    ]
  }
};

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

  if (await isAdmin(userId)) {
    // Admin bo'lsa admin menyusini ko'rsatamiz
    return bot.sendMessage(chatId, "Admin menyu:", adminMenu);
  }

  // Oddiy foydalanuvchilar uchun bo'limlar ro'yxati
  const parents = await Section.find({ parent: null });
  if (parents.length === 0) return bot.sendMessage(chatId, "Bo‘limlar mavjud emas.");

  const keyboard = parents.map(sec => ([{ text: sec.name, callback_data: `parent_${sec._id}` }]));
  bot.sendMessage(chatId, "Bo‘limni tanlang:", { reply_markup: { inline_keyboard: keyboard } });
});

// === Callback query handler ===
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;

  if (await isAdmin(userId)) {
    if (!sessions[userId]) sessions[userId] = {};

    // --- Admin buyruqlari ---
    if (data === 'set_channel') {
      sessions[userId].step = 'set_channel';
      await bot.sendMessage(chatId, "Yangi kanal username ni @ bilan yuboring:");
      return bot.answerCallbackQuery(query.id);
    }

    if (data === 'add_admin') {
      sessions[userId].step = 'add_admin';
      await bot.sendMessage(chatId, "Qo'shmoqchi bo'lgan adminning Telegram ID sini yuboring:");
      return bot.answerCallbackQuery(query.id);
    }

    if (data === 'add_section') {
      sessions[userId].step = 'add_section';
      await bot.sendMessage(chatId, "Yangi asosiy bo‘lim nomini yuboring:");
      return bot.answerCallbackQuery(query.id);
    }

    if (data === 'add_subsection') {
      // Avval asosiy bo'limlarni tanlatamiz
      const parents = await Section.find({ parent: null });
      if (parents.length === 0) {
        await bot.sendMessage(chatId, "Asosiy bo‘limlar mavjud emas. Avval bo‘lim yarating.");
        return bot.answerCallbackQuery(query.id);
      }
      sessions[userId].step = 'add_subsection_choose_parent';
      const keyboard = parents.map(sec => ([{ text: sec.name, callback_data: `choose_parent_${sec._id}` }]));
      await bot.sendMessage(chatId, "Ichki bo‘lim qo‘shish uchun asosiy bo‘limni tanlang:", {
        reply_markup: { inline_keyboard: keyboard }
      });
      return bot.answerCallbackQuery(query.id);
    }

    if (data.startsWith('choose_parent_') && sessions[userId].step === 'add_subsection_choose_parent') {
      const parentId = data.split('_')[2];
      sessions[userId].step = 'add_subsection_name';
      sessions[userId].parentId = parentId;
      await bot.sendMessage(chatId, "Ichki bo‘lim nomini yuboring:");
      return bot.answerCallbackQuery(query.id);
    }

    if (data === 'upload_file') {
      const sections = await Section.find();
      if (sections.length === 0) {
        await bot.sendMessage(chatId, "Bo‘limlar mavjud emas, avval bo‘lim yarating.");
        return bot.answerCallbackQuery(query.id);
      }
      sessions[userId].step = 'choose_section_for_file';
      const keyboard = sections.map(s => ([{ text: s.parent ? `↳ ${s.name}` : s.name, callback_data: `file_section_${s._id}` }]));
      await bot.sendMessage(chatId, "Fayl qaysi bo‘limga joylanadi?", {
        reply_markup: { inline_keyboard: keyboard }
      });
      return bot.answerCallbackQuery(query.id);
    }

    if (data.startsWith('file_section_') && sessions[userId].step === 'choose_section_for_file') {
      const sectionId = data.split('_')[2];
      sessions[userId].step = 'await_file';
      sessions[userId].sectionId = sectionId;
      await bot.sendMessage(chatId, "Iltimos, faylni yuboring:");
      return bot.answerCallbackQuery(query.id);
    }
  } else {
    // Foydalanuvchi callbacklari (bo‘lim tanlash, subbo‘lim tanlash, fayllarni ko‘rsatish)
    if (data.startsWith('parent_')) {
      const parentId = data.split('_')[1];
      const subSections = await Section.find({ parent: parentId });
      if (subSections.length === 0) return bot.sendMessage(chatId, "Ichki bo‘lim mavjud emas.");
      const keyboard = subSections.map(sec => ([{ text: sec.name, callback_data: `sub_${sec._id}` }]));
      return bot.sendMessage(chatId, "Ichki bo‘limni tanlang:", { reply_markup: { inline_keyboard: keyboard } });
    }

    if (data.startsWith('sub_')) {
      const sectionId = data.split('_')[1];
      const files = await File.find({ section: sectionId }).sort({ uploaded_at: -1 });
      if (files.length === 0) return bot.sendMessage(chatId, "Bu bo‘limda fayl yo‘q.");

      for (const file of files) {
        try {
          await bot.sendDocument(chatId, file.file_id, { caption: file.file_name });
        } catch {
          await File.deleteOne({ _id: file._id });
        }
      }
    }
  }

  await bot.answerCallbackQuery(query.id);
});

// === Admin tomonidan matnli xabarlarni qabul qilish ===
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Fayl yuklash uchun fayl turi
  const isFileMessage = msg.document || msg.video || msg.audio || msg.photo;

  if (await isAdmin(userId)) {
    if (!sessions[userId]) sessions[userId] = {};

    // Kanal username ni sozlash
    if (sessions[userId].step === 'set_channel') {
      const channelUsername = msg.text.trim();
      if (!channelUsername.startsWith('@')) {
        return bot.sendMessage(chatId, "Username '@' bilan boshlanishi kerak. Qayta yuboring:");
      }
      await Settings.deleteMany({});
      await new Settings({ channel_username: channelUsername }).save();
      sessions[userId] = {};
      return bot.sendMessage(chatId, `Kanal @${channelUsername} sifatida o‘rnatildi.`, adminMenu);
    }

    // Admin qo'shish
    if (sessions[userId].step === 'add_admin') {
      const newAdminId = parseInt(msg.text.trim());
      if (isNaN(newAdminId)) return bot.sendMessage(chatId, "To‘g‘ri raqam kiriting:");
      const exists = await Admin.findOne({ user_id: newAdminId });
      if (exists) return bot.sendMessage(chatId, "Bu admin allaqachon mavjud.");
      await new Admin({ user_id: newAdminId }).save();
      sessions[userId] = {};
      return bot.sendMessage(chatId, `Admin qo‘shildi: ${newAdminId}`, adminMenu);
    }

    // Bo'lim qo'shish
    if (sessions[userId].step === 'add_section') {
      const name = msg.text.trim();
      if (!name) return bot.sendMessage(chatId, "Bo‘lim nomi bo‘sh bo‘lishi mumkin emas.");
      await new Section({ name }).save();
      sessions[userId] = {};
      return bot.sendMessage(chatId, `Asosiy bo‘lim yaratildi: ${name}`, adminMenu);
    }

    // Ichki bo'lim nomini qabul qilish
    if (sessions[userId].step === 'add_subsection_name') {
      const name = msg.text.trim();
      if (!name) return bot.sendMessage(chatId, "Ichki bo‘lim nomi bo‘sh bo‘lishi mumkin emas.");
      await new Section({ name, parent: sessions[userId].parentId }).save();
      sessions[userId] = {};
      return bot.sendMessage(chatId, `Ichki bo‘lim yaratildi: ${name}`, adminMenu);
    }

    // Fayl qabul qilish
    if (sessions[userId].step === 'await_file') {
      if (!isFileMessage) {
        return bot.sendMessage(chatId, "Iltimos, fayl yuboring:");
      }

      let fileId, fileName;

      if (msg.document) {
        fileId = msg.document.file_id;
        fileName = msg.document.file_name;
      } else if (msg.photo) {
        const photos = msg.photo;
        fileId = photos[photos.length - 1].file_id;
        fileName = 'photo.jpg';
      } else if (msg.video) {
        fileId = msg.video.file_id;
        fileName = 'video.mp4';
      } else if (msg.audio) {
        fileId = msg.audio.file_id;
        fileName = 'audio.mp3';
      } else {
        return bot.sendMessage(chatId, "Fayl turi qo‘llab-quvvatlanmaydi.");
      }

      await new File({
        file_id: fileId,
        file_name: fileName,
        section: sessions[userId].sectionId,
        uploaded_by: userId
      }).save();

      sessions[userId] = {};
      return bot.sendMessage(chatId, `✅ Fayl saqlandi: ${fileName}`, adminMenu);
    }
  }
});
