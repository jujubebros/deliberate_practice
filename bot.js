require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { search, initializeSearchService } = require("./semanticSearch");
const { createRAGPrompt } = require("./promptBuilder");

const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!telegramToken || !geminiApiKey) {
  console.error("❌ توکن تلگرام یا کلید Gemini تعریف نشده.");
  process.exit(1);
}

const bot = new TelegramBot(telegramToken, { polling: true });
const genAI = new GoogleGenerativeAI(geminiApiKey);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

const conversationHistory = {};
const HISTORY_LIMIT = 10;

// --- MAIN APPLICATION LOGIC ---
async function main() {
  try {
    // *** مرحله کلیدی: اول سرویس جستجو و مدل را آماده کن ***
    await initializeSearchService();
    console.log("🤖 ربات با مدل محلی آنلاین شد و آماده دریافت پیام است...");
  } catch (error) {
    console.error("❌ ربات به دلیل خطا در آماده‌سازی، متوقف شد:", error);
    process.exit(1); // در صورت شکست، برنامه را متوقف کن
  }
}

// --- COMMAND HANDLER: /search ---
bot.onText(/\/بگرد (.+)|\/search (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const keyword = match[1];
  console.log(`[Chat ID: ${chatId}] | /search | Query: "${keyword}"`);
  bot.sendChatAction(chatId, "typing");

  try {
    const results = await search(keyword, 3);
    if (results.length === 0) {
      bot.sendMessage(chatId, "نتیجه‌ای مرتبط با جستجوی شما یافت نشد.");
      return;
    }
    let responseText = `🔍 **نتایج برتر برای «${keyword}»:**\n\n`;
    results.forEach((result, index) => {
      responseText += `**${index + 1}. (شباهت: ${Math.round(result.score * 100)}%)**\n`;
      responseText += `${result.text}\n\n---\n\n`;
    });
    bot.sendMessage(chatId, responseText, { parse_mode: "Markdown", reply_to_message_id: msg.message_id });
  } catch (error) {
    console.error("❌ خطا در اجرای دستور /search:", error.message);
    bot.sendMessage(chatId, "متاسفانه مشکلی در جستجو پیش آمد.");
  }
});

// --- MESSAGE HANDLER: RAG-based Q&A ---
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userMessage = msg.text;
  if (!userMessage || userMessage.startsWith("/")) return;

  try {
    const botInfo = await bot.getMe();
    const botUsername = `@${botInfo.username}`;
    if (userMessage.includes(botUsername)) {
      const userQuery = userMessage.replace(botUsername, "").trim();
      if (!userQuery) return;

      console.log(`[Chat ID: ${chatId}] | Q&A | Query: "${userQuery}"`);
      bot.sendChatAction(chatId, "typing");

      if (!conversationHistory[chatId]) conversationHistory[chatId] = [];
      conversationHistory[chatId].push(`User: ${userQuery}`);
      if (conversationHistory[chatId].length > HISTORY_LIMIT) {
        conversationHistory[chatId].splice(0, conversationHistory[chatId].length - HISTORY_LIMIT);
      }

      const retrievedContext = await search(userQuery, 5);
      if (retrievedContext.length === 0) {
        bot.sendMessage(chatId, "متاسفانه نتوانستم بخش مرتبطی در متن برای پاسخ به سوال شما پیدا کنم.", {
          reply_to_message_id: msg.message_id,
        });
        return;
      }

      const repliedMessageContext = msg.reply_to_message?.text
        ? `The user's message is a reply to this previous message: "${msg.reply_to_message.text}"`
        : "";
      const prompt = createRAGPrompt({
        userQuery,
        retrievedContext,
        conversationHistory: conversationHistory[chatId].join("\n"),
        repliedMessageContext,
      });

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      conversationHistory[chatId].push(`Assistant: ${responseText}`);
      bot.sendMessage(chatId, responseText, { parse_mode: "Markdown", reply_to_message_id: msg.message_id });
    }
  } catch (error) {
    console.error("❌ خطا در پردازش پیام:", error.message);
    bot.sendMessage(chatId, "مشکلی در پردازش درخواست شما پیش آمد. لطفاً دوباره تلاش کنید.");
  }
});

// --- ERROR HANDLING ---
bot.on("polling_error", (error) => {
  console.error(`❌ خطای Polling: [${error.code}] ${error.message}`);
});

// --- START THE BOT ---
main();
