
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const mongoose = require('mongoose');

// === Sozlamalar ===
const BOT_TOKEN = '7665871214:AAGi2SV_KaOMqr_LXKoGRsJF_XVRz2sSykE';

let CHANNEL_USERNAME = '@rapqonedu2024';
const ADMINS = [2053660453]; // Admin user ID sini shu yerga yozing

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
    section: String,
    from_chat_id: Number, // <<< BU YANGI MAYDON
  });
const File = mongoose.model('File', fileSchema);
const adminSessions = {}; // { userId: { step: 'section' | 'subsection' | 'file', section: '', subsection: '' } }

const sectionSchema = new mongoose.Schema({ name: String });
const Section = mongoose.model('Section', sectionSchema);

const subSectionSchema = new mongoose.Schema({
  name: String,
  parentSection: String,
});
const SubSection = mongoose.model('SubSection', subSectionSchema);

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const userStates = {};

// bot.onText(/\/addfile/, async (msg) => {
//   const chatId = msg.chat.id;
//   const userId = msg.from.id;

//   if (!ADMINS.includes(userId)) return;

//   const sections = await Section.find();
//   if (!sections.length) return bot.sendMessage(chatId, "Hech qanday bo‘lim yo‘q. Avval bo‘lim qo‘shing.");

//   const keyboard = sections.map(s => [{ text: s.name, callback_data: `addfile_section_${s.name}` }]);
//   adminSessions[userId] = { step: 'section' };

//   bot.sendMessage(chatId, "Fayl qaysi bo‘limga qo‘shilsin?", {
//     reply_markup: { inline_keyboard: keyboard }
//   });
// });

bot.on('callback_query', async (query) => {
  const data = query.data;
  const userId = query.from.id;
  const chatId = query.message.chat.id;

    
  // Bo‘lim tanlandi
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

  // Subbo‘lim tanlandi
  if (data.startsWith('addfile_sub_')) {
    const [sectionName, subName] = data.replace('addfile_sub_', '').split('|');
    adminSessions[userId] = { step: 'file', section: sectionName, subsection: subName };

    return bot.sendMessage(chatId, `✅ Endi faylni yuboring: rasm, audio, video, zip yoki hujjat bo‘lishi mumkin`);
  }

  await bot.answerCallbackQuery(query.id);
});

bot.on('message', async (msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const session = adminSessions[userId];

  // Guruhdan kelgan fayl emas, faqat admin session uchun
  if (!session || session.step !== 'file') return;

  const fileType = msg.document ? 'document'
    : msg.photo ? 'photo'
    : msg.audio ? 'audio'
    : msg.video ? 'video'
    : null;

  if (!fileType) return bot.sendMessage(chatId, "❗ Yuborilgan fayl formati noto‘g‘ri. Faqat rasm, audio, video yoki hujjat bo‘lishi mumkin.");

  const fileName = msg.document?.file_name || `${fileType} fayl`;

  const fullSection = `${session.section}|${session.subsection}`;

  const file = new File({
  message_id: msg.message_id,
  file_name: fileName,
  type: fileType,
  date: msg.date,
  section: fullSection,
  from_chat_id: msg.chat.id, // <<< BU QATORNI QO‘SHING
});

  await file.save();
  delete adminSessions[userId];

  return bot.sendMessage(chatId, `✅ Fayl saqlandi! Bo‘lim: ${session.section} > ${session.subsection}`);
});

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
    const count = await File.countDocuments({ section: new RegExp(`^${section.name}\\|`) });
    if (count === 0) {
      await Section.deleteOne({ _id: section._id });
      await SubSection.deleteMany({ parentSection: section.name });
    }
  }
}

// === Fayl qabul qilish ===
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  // Fayl yuklash (faqat FILE_GROUP_ID dan)
//   if (chatId === FILE_GROUP_ID) {
//     const fileType = msg.document ? 'document' : msg.audio ? 'audio' : msg.video ? 'video' : msg.photo ? 'photo' : null;
//     const caption = msg.caption?.trim();

//     if (fileType && caption && caption.includes('|')) {
//       const [sectionName, subSectionName] = caption.split('|').map(s => s.trim());

//       let section = await Section.findOne({ name: sectionName });
//       if (!section) {
//         section = new Section({ name: sectionName });
//         await section.save();
//       }

//       let subSection = await SubSection.findOne({ name: subSectionName, parentSection: sectionName });
//       if (!subSection) {
//         subSection = new SubSection({ name: subSectionName, parentSection: sectionName });
//         await subSection.save();
//       }

//       const file = new File({
//         message_id: msg.message_id,
//         file_name: msg.document?.file_name || `${fileType} fayl`,
//         type: fileType,
//         date: msg.date,
//         section: `${sectionName}|${subSectionName}`,
//       });

//       await file.save();
//     }
//   }

  // Admin uchun bo‘lim qo‘shish jarayoni
  const state = userStates[chatId];
  if (state?.action === 'add_section') {
    await Section.create({ name: msg.text });
    delete userStates[chatId];
    return bot.sendMessage(chatId, `✅ Yangi bo‘lim qo‘shildi: ${msg.text}`);
  }

  if (state?.action === 'add_subsection') {
    const parent = state.section;
    await SubSection.create({ name: msg.text, parentSection: parent });
    delete userStates[chatId];
    return bot.sendMessage(chatId, `✅ Subbo‘lim qo‘shildi: ${msg.text} → ${parent}`);
  }

  if (state?.action === 'add_admin') {
    const newAdminId = parseInt(msg.text);
    if (!ADMINS.includes(newAdminId)) ADMINS.push(newAdminId);
    delete userStates[chatId];
    return bot.sendMessage(chatId, `✅ Yangi admin qo‘shildi: ${newAdminId}`);
  }

  if (state?.action === 'change_channel') {
    CHANNEL_USERNAME = msg.text.startsWith('@') ? msg.text : `@${msg.text}`;
    delete userStates[chatId];
    return bot.sendMessage(chatId, `✅ Kanal yangilandi: ${CHANNEL_USERNAME}`);
  }
});

// === /start komandasi ===
// bot.onText(/\/start/, async (msg) => {
//   const chatId = msg.chat.id;
//   const userId = msg.from.id;

//   const subscribed = await isUserSubscribed(userId);
//   if (!subscribed) {
//     return bot.sendMessage(chatId, `Iltimos, ${CHANNEL_USERNAME} kanaliga obuna bo‘ling`, {
//       reply_markup: {
//         inline_keyboard: [[{ text: "Kanalga o'tish", url: `https://t.me/${CHANNEL_USERNAME.replace('@', '')}` }]]
//       }
//     });
//   }

//   const sections = await Section.find();
//   if (sections.length === 0) return bot.sendMessage(chatId, "Bo‘limlar mavjud emas.");

//   const keyboard = sections.map(s => [{ text: s.name, callback_data: `section_${s.name}` }]);
//   return bot.sendMessage(chatId, "Bo‘limni tanlang:", { reply_markup: { inline_keyboard: keyboard } });
// });

// Bo‘limlar va subbo‘limlar ko‘rsatish va fayllarni yuborish (foydalanuvchi uchun)
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
    if (!sections.length) return bot.sendMessage(chatId, "Bo‘limlar mavjud emas.");
  
    const keyboard = sections.map(s => [{ text: s.name, callback_data: `section_${s.name}` }]);
    return bot.sendMessage(chatId, "Bo‘limni tanlang:", { reply_markup: { inline_keyboard: keyboard } });
  });
  
//   bot.on('callback_query', async (query) => {
//     const chatId = query.message.chat.id;
//     const data = query.data;
  
//     if (data.startsWith('section_')) {
//       const sectionName = data.replace('section_', '');
//       const subs = await SubSection.find({ parentSection: sectionName });
//       const keyboard = subs.map(s => [{ text: s.name, callback_data: `sub_${sectionName}|${s.name}` }]);
//       return bot.sendMessage(chatId, "Subbo‘limni tanlang:", { reply_markup: { inline_keyboard: keyboard } });
//     }
  
//     if (data.startsWith('sub_')) {
//       const [sectionName, subName] = data.replace('sub_', '').split('|');
//       const files = await File.find({ section: `${sectionName}|${subName}` });
  
//       if (!files.length) return bot.sendMessage(chatId, "Bu subbo‘limda hech qanday fayl mavjud emas.");
  
//       for (const file of files) {
//         try {
//           await bot.copyMessage(chatId, chatId, file.message_id);
//         } catch (e) {
//           // Agar fayl topilmasa yoki xatolik bo‘lsa, saqlangan ma'lumotni o‘chirish mumkin
//           await File.deleteOne({ _id: file._id });
//         }
//       }
//     }
  
//     await bot.answerCallbackQuery(query.id);
//   });
// === Callback handler ===
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;
  
    // === Fayl qo‘shish bo‘lim/subbo‘lim tanlash ===
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
  
  
    // === Foydalanuvchi bo‘lim/subbo‘lim tanlashi va fayl yuborish ===
    if (data.startsWith('section_')) {
      const sectionName = data.replace('section_', '');
      const subs = await SubSection.find({ parentSection: sectionName });
      const keyboard = subs.map(s => [{ text: s.name, callback_data: `sub_${sectionName}|${s.name}` }]);
      return bot.sendMessage(chatId, "Subbo‘limni tanlang:", { reply_markup: { inline_keyboard: keyboard } });
    }
    
    

    if (data.startsWith('sub_')) {
        const [sectionName, subName] = data.replace('sub_', '').split('|');
        const files = await File.find({ section: `${sectionName}|${subName}` });
  
        if (!files.length) {
          return bot.sendMessage(chatId, "❌ Bu subbo‘limda hech qanday fayl mavjud emas.");
        }
  
        for (const file of files) {
          try {
            await bot.copyMessage(chatId, file.from_chat_id, file.message_id);
          } catch (e) {
            await File.deleteOne({ _id: file._id });
            await bot.sendMessage(chatId, `⚠️ Faylni yuborib bo‘lmadi va bazadan o‘chirildi: ${file.file_name}`);
          }
        }
      }
  
      const sections = await Section.find();
const keyboard = sections.map(s => [
  { text: `❌ ${s.name}`, callback_data: `delete_section_${s.name}` },
  { text: `Sub bo'limni o'chirish`, callback_data: `delet_sub_${s.name}` }
]);
if (data.startsWith('del_section_') && ADMINS.includes(userId)) {
    bot.sendMessage(chatId, "Bo‘limlar:", {
      reply_markup: { inline_keyboard: keyboard }
    });
}

if (data.startsWith('delet_sub_')) {
    const sectionName = data.replace('delet_sub_', '');
    const subs = await SubSection.find({ parentSection: sectionName });
  
    const keyboard = subs.map(s => [
      { text: `📁 ${s.name}`, callback_data: `sub_${sectionName}|${s.name}` },
      { text: `❌ O‘chirish`, callback_data: `delete_sub_${sectionName}|${s.name}` }
    ]);
  
    return bot.sendMessage(chatId, "Subbo‘limni tanlang yoki o‘chiring:", {
      reply_markup: { inline_keyboard: keyboard }
    });
  }

    // === Admin panel tugmalari ===
    if (data === 'admin_panel' && ADMINS.includes(userId)) {
      return bot.sendMessage(chatId, 'Admin paneli:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📂 Bo‘limlarni boshqarish', callback_data: 'admin_manage_sections' }],
            [{ text: '📂 File qo`shish', callback_data: 'add_file' }],
            [{ text: '➕ Bo‘lim qo‘shish', callback_data: 'admin_add_section' }],
            [{ text: '➕ Subbo‘lim qo‘shish', callback_data: 'admin_add_subsection' }],
            [{ text: '👤 Admin qo‘shish', callback_data: 'admin_add_admin' }],
            [{ text: '✏️ Kanalni o‘zgartirish', callback_data: 'admin_change_channel' }],
          ]
        }
      });
    }
  
    if (data === 'admin_manage_sections') {
      const sections = await Section.find();
      const keyboard = sections.map(s => [{ text: `🗑 ${s.name}`, callback_data: `del_section_${s.name}` }]);
      return bot.sendMessage(chatId, 'Bo‘limlardan birini o‘chiring:', { reply_markup: { inline_keyboard: keyboard } });
    }

    if (data === 'add_file') {
        if (!ADMINS.includes(userId)) return;
      
        const sections = await Section.find();
        if (!sections.length) return bot.sendMessage(chatId, "Hech qanday bo‘lim yo‘q. Avval bo‘lim qo‘shing.");
      
        const keyboard = sections.map(s => [{ text: s.name, callback_data: `addfile_section_${s.name}` }]);
        adminSessions[userId] = { step: 'section' };
      
        bot.sendMessage(chatId, "Fayl qaysi bo‘limga qo‘shilsin?", {
          reply_markup: { inline_keyboard: keyboard }
        });
    }
  
    if (data === 'admin_add_section') {
      userStates[chatId] = { action: 'add_section' };
      return bot.sendMessage(chatId, "Yangi bo‘lim nomini kiriting:");
    }
  
    if (data === 'admin_add_subsection') {
      const sections = await Section.find();
      const keyboard = sections.map(s => [{ text: s.name, callback_data: `choose_section_for_sub_${s.name}` }]);
      return bot.sendMessage(chatId, "Subbo‘lim qaysi bo‘limga tegishli?", { reply_markup: { inline_keyboard: keyboard } });
    }
  
    if (data.startsWith('choose_section_for_sub_')) {
      const section = data.replace('choose_section_for_sub_', '');
      userStates[chatId] = { action: 'add_subsection', section };
      return bot.sendMessage(chatId, `Subbo‘lim nomini kiriting (bo‘lim: ${section}):`);
    }
  
    if (data === 'admin_add_admin') {
      userStates[chatId] = { action: 'add_admin' };
      return bot.sendMessage(chatId, `Yangi admin ID raqamini kiriting:`);
    }
  
    if (data === 'admin_change_channel') {
      userStates[chatId] = { action: 'change_channel' };
      return bot.sendMessage(chatId, `Yangi kanal usernamesini kiriting (@ bilan):`);
    }

    if (data.startsWith('delete_section_') && ADMINS.includes(userId)) {
        const sectionName = data.replace('delete_section_', '');
    
        // Fayllarni o‘chiramiz
        await File.deleteMany({ section: new RegExp(`^${sectionName}\\|`) });
    
        // Subbo‘limlarni o‘chiramiz
        await SubSection.deleteMany({ parentSection: sectionName });
    
        // Bo‘limni o‘chiramiz
        await Section.deleteOne({ name: sectionName });
    
        return bot.sendMessage(chatId, `✅ Bo‘lim "${sectionName}" va ichidagi barcha subbo‘limlar va fayllar o‘chirildi.`);
      }
      if (data.startsWith('delete_sub_') && ADMINS.includes(userId)) {
        const [sectionName, subName] = data.replace('delete_sub_', '').split('|').map(t => t.trim());
    
        console.log(subName);
        
        // Fayllarni o‘chiramiz
        await File.deleteMany({ section: `${sectionName}|${subName}` });
    
        // Subbo‘limni o‘chiramiz
        await SubSection.deleteOne({ name: subName, parentSection: sectionName });
    
        return bot.sendMessage(chatId, `✅ Subbo‘lim "${subName}" (bo‘lim: ${sectionName}) va barcha fayllari o‘chirildi.`);
      }
  
    await bot.answerCallbackQuery(query.id);
  });
  
  

// === /admin komandasi ===
bot.onText(/\/admin/, (msg) => {
  if (ADMINS.includes(msg.from.id)) {
    bot.sendMessage(msg.chat.id, 'Admin paneli:', {
      reply_markup: {
        inline_keyboard: [[{ text: '⚙️ Panelni ochish', callback_data: 'admin_panel' }]]
      }
    });
  }
});
