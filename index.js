const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');

const BOT_TOKEN = '7558460976:AAHYVzgJjbdex9OLfmbNogIr420mwYNjbEQ';
const CHANNEL_USERNAME = '@rapqonedu2024'; // Kanal username
const FILE_GROUP_ID = -1002268361672; // Fayllar turgan guruh ID
const FILE_STORE = 'fileMessages.json';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

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

bot.on('message', (msg) => {
  const chatId = msg.chat.id;

  if (chatId === FILE_GROUP_ID) {
    const fileType = msg.document ? 'document' : msg.audio ? 'audio' : msg.video ? 'video' : msg.photo ? 'photo' : null;

    if (fileType) {
      const file = {
        message_id: msg.message_id,
        file_name: msg.document?.file_name || `${fileType} fayl`,
        type: fileType,
        date: msg.date
      };
      addFile(file);
      console.log('Yangi fayl qo‘shildi:', file);
    }
  }
});

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  console.log('Fayl yuborilmoqda:', file.message_id);
console.log('Guruh ID:', FILE_GROUP_ID);
console.log('Fayl nomi:', file.file_name);
  bot.sendMessage(chatId, "Assalomu alaykum! Fayllarni olish uchun /fayllar buyrug'ini yozing yoke pastdagi tugmani bosing", {
    reply_markup: {
      keyboard: [
        ['YUKLAB OLISH']
      ],
      resize_keyboard: true,
    },
  });
});

bot.onText(/\/fayllar|YUKLAB OLISH/i, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const subscribed = await isUserSubscribed(userId);

  if (!subscribed) {
    return bot.sendMessage(chatId, `Iltimos, ${CHANNEL_USERNAME} kanaliga obuna bo‘ling va yuklab olish tugmasini bosing`, {
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
    }catch (error) {
  console.error(`Faylni yuborishda xatolik:`, error.message);
  fileMessages.splice(i, 1);
  i--;
  saveFileList();
}
  }
});
