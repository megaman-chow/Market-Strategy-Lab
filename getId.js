require('dotenv').config();
const fs = require('fs');
const path = require('path');
// const { generatePNLCard } = require('./pnlCard.js');
const TelegramBot = require('node-telegram-bot-api');

const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
console.log(telegramToken);

const bot = new TelegramBot(telegramToken, { polling: true });
console.log(bot);
bot.onText(/\/id/, async (msg) => {
    console.log(msg);
    const chatId = msg.chat.id.toString();
    bot.sendMessage(chatId, chatId);
  });
console.log("Telegram bot is running...");