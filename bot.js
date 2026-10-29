// require("dotenv").config();
// const TelegramBot = require("node-telegram-bot-api");

// const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// console.log("🤖 Bot running...");

// /*
// USER STATE MEMORY
// chatId -> state
// */
// const userStates = {};

// const screens = [
//     "Welcome to the trading bot.\n\nPress Next to begin.",
    
//     "Step 1: Connect your trading account.\n\nLater this will link Binance.",
    
//     "Step 2: Choose your strategy.\n\nExample:\n• Scalping\n• Trend Following",
    
//     "Step 3: Confirm settings and start trading."
// ];

// function buildKeyboard(state) {

//     const buttons = [];

//     if (state > 0) {
//         buttons.push({
//             text: "⬅ Prev",
//             callback_data: "prev"
//         });
//     }

//     if (state < screens.length - 1) {
//         buttons.push({
//             text: "Next ➡",
//             callback_data: "next"
//         });
//     }

//     return {
//         reply_markup: {
//             inline_keyboard: [buttons]
//         }
//     };
// }

// function showScreen(chatId) {

//     const state = userStates[chatId] || 0;

//     bot.sendMessage(
//         chatId,
//         screens[state],
//         buildKeyboard(state)
//     );
// }

// bot.onText(/\/start/, (msg) => {

//     const chatId = msg.chat.id;

//     userStates[chatId] = 0;

//     showScreen(chatId);

// });

// bot.on("callback_query", (query) => {

//     const chatId = query.message.chat.id;
//     const data = query.data;

//     if (!(chatId in userStates)) {
//         userStates[chatId] = 0;
//     }

//     if (data === "next") {
//         userStates[chatId]++;
//     }

//     if (data === "prev") {
//         userStates[chatId]--;
//     }

//     // limit bounds
//     userStates[chatId] = Math.max(
//         0,
//         Math.min(screens.length - 1, userStates[chatId])
//     );

//     bot.editMessageText(
//         screens[userStates[chatId]],
//         {
//             chat_id: chatId,
//             message_id: query.message.message_id,
//             reply_markup: buildKeyboard(userStates[chatId]).reply_markup
//         }
//     );

//     bot.answerCallbackQuery(query.id);
// });

require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const path = require("path");

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

console.log("🤖 Bot running...");

/*
User state memory
*/
const userStates = {};

/*
Slides
*/
const slides = [
{
    text: "Welcome to the Trading Bot\n\nPress Next to begin.",
    image: "images/welcome.jpg"
},
{
    text: "Step 1: Connect your trading account.\n\nLater this will link Binance.",
    image: "images/connect.jpg"
},
{
    text: "Step 2: Choose your strategy.\n\nExample:\n• Scalping\n• Trend Following",
    image: "images/strategy.jpg"
},
{
    text: "Step 3: Confirm settings and start trading.",
    image: "images/confirm.jpg"
}
];

function buildKeyboard(state) {

    const buttons = [];

    if (state > 0) {
        buttons.push({
            text: "⬅ Prev",
            callback_data: "prev"
        });
    }

    if (state < slides.length - 1) {
        buttons.push({
            text: "Next ➡",
            callback_data: "next"
        });
    }

    return {
        reply_markup: {
            inline_keyboard: [buttons]
        }
    };
}

function showSlide(chatId) {

    const state = userStates[chatId] || 0;

    const slide = slides[state];

    bot.sendPhoto(
        chatId,
        path.resolve(slide.image),
        {
            caption: slide.text,
            ...buildKeyboard(state)
        }
    );
}

bot.onText(/\/start/, (msg) => {

    const chatId = msg.chat.id;

    userStates[chatId] = 0;

    showSlide(chatId);

});

bot.on("callback_query", async (query) => {

    const chatId = query.message.chat.id;
    const data = query.data;

    if (!(chatId in userStates)) {
        userStates[chatId] = 0;
    }

    if (data === "next") userStates[chatId]++;
    if (data === "prev") userStates[chatId]--;

    userStates[chatId] = Math.max(
        0,
        Math.min(slides.length - 1, userStates[chatId])
    );

    const slide = slides[userStates[chatId]];

    await bot.deleteMessage(chatId, query.message.message_id);

    bot.sendPhoto(
        chatId,
        path.resolve(slide.image),
        {
            caption: slide.text,
            ...buildKeyboard(userStates[chatId])
        }
    );

    bot.answerCallbackQuery(query.id);

});