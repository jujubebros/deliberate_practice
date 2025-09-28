require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");

const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!telegramToken || !geminiApiKey) {
  console.error("❌ توکن تلگرام یا کلید Gemini تعریف نشده.");
  process.exit(1);
}

const bot = new TelegramBot(telegramToken, { polling: true });
const genAI = new GoogleGenerativeAI(geminiApiKey);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

let thesisEmbeddings = [];
try {
  console.log("📥 بارگذاری thesis_embeddings.json...");
  const raw = fs.readFileSync("thesis_embeddings.json", "utf-8");
  thesisEmbeddings = JSON.parse(raw);
  console.log(`✅ ${thesisEmbeddings.length} پاراگراف بارگذاری شد.`);
} catch (error) {
  console.error("❌ خطا در بارگذاری thesis_embeddings.json:", error.message);
  process.exit(1);
}

const conversationHistory = {};
const HISTORY_LIMIT = 20;

console.log("🤖 ربات آنلاین شد...");

bot.onText(/\/بگرد (.+)|\/search (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const keyword = match[1];
  console.log(`[Chat ID: ${chatId}] جستجوی معنایی برای: "${keyword}"`);
  bot.sendChatAction(chatId, "typing");

  const prompt = `
    نقش شما: یک موتور جستجوی معنایی هستی که باید بین پاراگراف‌های زیر، مرتبط‌ترین‌ها را با عبارت «${keyword}» پیدا کنی.
    خروجی فقط پاراگراف‌های مرتبط باشد، به ترتیب شباهت. اگر هیچ مورد مرتبطی نبود، بنویس «نتیجه‌ای یافت نشد».

    --- پاراگراف‌ها ---
    ${thesisEmbeddings.map((p, i) => `(${i + 1}) ${p.text}`).join("\n\n")}
    -------------------

    عبارت جستجو: ${keyword}
  `;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    bot.sendMessage(chatId, responseText, { reply_to_message_id: msg.message_id });
  } catch (error) {
    console.error("❌ خطا در جستجوی معنایی:", error.message);
    bot.sendMessage(chatId, "متاسفانه مشکلی در جستجو پیش آمد.");
  }
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userMessage = msg.text;
  if (!userMessage || userMessage.startsWith("/")) return;

  if (!conversationHistory[chatId]) conversationHistory[chatId] = [];
  const messageData = `${msg.from.first_name || "User"}: ${userMessage}`;
  conversationHistory[chatId].push(messageData);
  if (conversationHistory[chatId].length > HISTORY_LIMIT) {
    conversationHistory[chatId].shift();
  }

  try {
    const botInfo = await bot.getMe();
    const botUsername = `@${botInfo.username}`;
    if (userMessage.includes(botUsername)) {
      const userQuery = userMessage.replace(botUsername, "").trim();
      if (!userQuery) return;

      console.log(`[Chat ID: ${chatId}] سوال جدید: "${userQuery}"`);
      bot.sendChatAction(chatId, "typing");

      const repliedMessageContext = msg.reply_to_message?.text
        ? `پیام ریپلای‌شده: "${msg.reply_to_message.text}"`
        : "";

      const chatHistory = conversationHistory[chatId].join("\n");
      const thesisText = thesisEmbeddings
        .slice(0, 50)
        .map((p, i) => `(${i + 1}) ${p.text}`)
        .join("\n\n");

      const prompt = `
        نقش شما: پژوهشگر ادبیات الکترونیک هستی با دانش عمیق از پایان‌نامه زیر.
        از متن پایان‌نامه برای پاسخ استفاده کن و اگر لازم بود، از دانش عمومی هم بهره بگیر.

        --- متن پایان‌نامه ---
        ${thesisText}
        -----------------------

        ${repliedMessageContext}

        --- تاریخچه مکالمات ---
        ${chatHistory}
        -----------------------

        سوال کاربر: "${userQuery}"
      `;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      bot.sendMessage(chatId, responseText, { reply_to_message_id: msg.message_id });
    }
  } catch (error) {
    console.error("❌ خطا در پردازش پیام:", error.message);
    bot.sendMessage(chatId, "مشکلی در پردازش درخواست شما پیش آمد.");
  }
});

bot.on("polling_error", (error) => {
  console.error(`❌ خطای Polling: [${error.code}] ${error.message}`);
});
