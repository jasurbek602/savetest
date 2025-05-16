const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');

const BOT_TOKEN = '8172728469:AAHMFtbU1iYpROEWSjXDN-HoRgAW6leABX0';
const CHANNEL_USERNAME = '@AKOUNT_BOZOR_SHOP_01'; // Kanal username
const FILE_GROUP_ID = -1002268361672; // Fayllar turgan guruh ID
const FILE_STORE = 'fileMessages.json';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Fayl saqlash va yuklash
let fileMessages = [];
if (fs.existsSync(FILE_STORE)) {
  fileMessages = JSON.parse(fs.readFileSync(FILE_STORE, 'utf8'));
}

function saveFileList() {
  fs.writeFileSync(FILE_STORE, JSON.stringify(fileMessages, null, 2));
}

function addFile(file) {
  fileMessages.push(file);
  saveFileList();
}

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

// === Guruhdan fayl kelganda ===
bot.on('message', (msg) => {
  const chatId = msg.chat.id;

  if (chatId === FILE_GROUP_ID) {
    if (msg.document || msg.audio || msg.video || msg.photo) {
      const file = {
        message_id: msg.message_id,
        file_name: msg.document?.file_name || 'Fayl'
      };
      addFile(file);
      console.log('Yangi fayl qo‘shildi:', file);
    }
  }
});

// === /start komandasi ===
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "Assalomu alaykum! Fayllarni olish uchun /fayllar buyrug'ini yozing yoke tugmani bosing", {
    reply_markup: {
      keyboard: [
        ['YUKLAB OLISH']
      ],
      resize_keyboard: true,
    },
  });
});

// === /fayllar komandasi ===
bot.onText(/\/fayllar|YUKLAB OLISH/i, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const subscribed = await isUserSubscribed(userId);

  if (!subscribed) {
    return bot.sendMessage(chatId, `Iltimos, ${CHANNEL_USERNAME} kanaliga obuna bo‘ling.`, {
      reply_markup: {
        inline_keyboard: [[
          { text: "Kanalga o'tish", url: `https://t.me/${CHANNEL_USERNAME.replace('@', '')}` }
        ]]
      }
    });
  }

  if (fileMessages.length === 0) {
    return bot.sendMessage(chatId, "Hozircha hech qanday fayl mavjud emas.");
  }

  for (let i = 0; i < fileMessages.length; i++) {
    const file = fileMessages[i];
    try {
      await bot.copyMessage(chatId, FILE_GROUP_ID, file.message_id, {
        caption: file.file_name
      });
    } catch (error) {
      // Faylni ro‘yxatdan o‘chiramiz
      fileMessages.splice(i, 1);
      i--; // indeksni tuzatamiz
      saveFileList(); // JSON faylni yangilaymiz
    }
  }
});