// ===== کتابخانه‌های مورد نیاز =====
require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");

// ===== تنظیمات اولیه و خواندن کلیدهای API =====
const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!telegramToken || !geminiApiKey) {
  console.error("خطا: توکن تلگرام یا کلید API جمنای در متغیرهای محیطی تعریف نشده است.");
  process.exit(1);
}

const bot = new TelegramBot(telegramToken, { polling: true });
const genAI = new GoogleGenerativeAI(geminiApiKey);
// تصحیح نام مدل به آخرین نسخه پایدار
const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

// ===== بارگذاری دانش متمرکز از فایل knowledge.txt =====
let thesisKnowledge = "";
try {
  console.log("در حال بارگذاری دانش متمرکز از فایل...");
  thesisKnowledge = fs.readFileSync("thesis.txt", "utf-8");
  console.log("دانش متمرکز با موفقیت بارگذاری شد.");
} catch (error) {
  console.error("خطا: فایل 'thesis.txt' پیدا نشد. لطفا ابتدا این فایل را بسازید.");
  process.exit(1);
}

// ===== حافظه موقت برای مکالمات گروه =====
const conversationHistory = {};
const HISTORY_LIMIT = 20;

console.log("بات «بی‌بی بتول» آنلاین شد...");

// ===== پردازشگر اصلی پیام‌ها (برای منشن و ریپلای) =====
bot.on("message", async (msg) => {
  // اگر پیام یک دستور بود، توسط پردازشگرهای دیگر مدیریت می‌شود، پس اینجا کاری نکن
  if (msg.text && msg.text.startsWith("/")) return;

  const chatId = msg.chat.id;
  const userMessage = msg.text;

  if (!userMessage) return;

  // ذخیره پیام‌ها در تاریخچه
  if (!conversationHistory[chatId]) {
    conversationHistory[chatId] = [];
  }
  const messageData = `${msg.from.first_name || "User"}: ${userMessage}`;
  conversationHistory[chatId].push(messageData);
  if (conversationHistory[chatId].length > HISTORY_LIMIT) {
    conversationHistory[chatId].shift();
  }

  try {
    const botInfo = await bot.getMe();
    const botUsername = `@${botInfo.username}`;

    // فقط در صورت منشن شدن پاسخ بده
    if (userMessage.includes(botUsername)) {
      const userQuery = userMessage.replace(botUsername, "").trim();
      if (!userQuery) return;

      console.log(`[Chat ID: ${chatId}] درخواست جدید دریافت شد: "${userQuery}"`);
      bot.sendChatAction(chatId, "typing");

      // بررسی وجود ریپلای
      let repliedMessageContext = "";
      if (msg.reply_to_message && msg.reply_to_message.text) {
        const originalSender = msg.reply_to_message.from.first_name || "User";
        const originalText = msg.reply_to_message.text;
        repliedMessageContext = `
                --- پیام ریپلای شده (بافتار اصلی سوال این است) ---
                کاربر به این پیام از "${originalSender}" ریپلای کرده است: "${originalText}"
                ----------------------------------------------------
                `;
      }

      const chatHistory = conversationHistory[chatId].join("\n");

      const augmentedPrompt = `
                نقش شما: شما باباعلی هستید، یک دستیار هوش مصنوعی متخصص در حوزه ادبیات الکترونیک با دانش کاترین هیلز. شما بسیار دقیق، سنجیده، علمی و ساختاریافته صحبت می‌کنید.

                دستورالعمل اصلی:
                1.  برای پاسخ به سوال کاربر، ابتدا "پیام ریپلای شده" (اگر وجود دارد) و سپس "تاریخچه مکالمات" را بخوان تا بافتار سوال را کاملاً درک کنی.
                2.  سپس، فقط و فقط بر اساس "متن اصلی پایان‌نامه" که در زیر آمده، به سوال پاسخ بده.
                3.  به هیچ وجه از دانش عمومی خود استفاده نکن. اگر پاسخ در "متن اصلی" نبود، به صراحت بگو: "پاسخ این سوال در متن خلاصه شده‌ای که در اختیار من است، یافت نشد."

                --- متن اصلی (تنها منبع دانش شما) ---
                ${thesisKnowledge}
                ----------------------------------------
                
                ${repliedMessageContext}

                --- تاریخچه مکالمات اخیر گروه (برای بافتار کلی) ---
                ${chatHistory}
                --------------------------------------------------

                سوال/درخواست نهایی کاربر: "${userQuery}"
            `;

      const result = await model.generateContent(augmentedPrompt);
      const responseText = result.response.text();

      // به پیام کاربر ریپلای می‌کند
      bot.sendMessage(chatId, responseText, { reply_to_message_id: msg.message_id });
      console.log(`[Chat ID: ${chatId}] پاسخ تخصصی ارسال شد.`);
    }
  } catch (error) {
    console.error("خطا در پردازش پیام:", error);
    bot.sendMessage(chatId, "متاسفانه مشکلی در پردازش درخواست شما پیش آمد.");
  }
});

// ===== پردازشگر دستور /خلاصه =====
bot.onText(/\/خلاصه|\/summary/, async (msg) => {
  const chatId = msg.chat.id;
  console.log(`[Chat ID: ${chatId}] درخواست خلاصه دریافت شد.`);
  bot.sendChatAction(chatId, "typing");

  const history = conversationHistory[chatId]
    ? conversationHistory[chatId].join("\n")
    : "هیچ مکالمه‌ای ثبت نشده است.";

  if (history === "هیچ مکالمه‌ای ثبت نشده است.") {
    bot.sendMessage(chatId, "هنوز مکالمه‌ای برای خلاصه کردن وجود ندارد.");
    return;
  }

  const summaryPrompt = `
        نقش شما: شما یک دستیار هوشمند هستید که در خلاصه‌سازی مکالمات مهارت دارید.
        دستورالعمل: مکالمات زیر را که بین چند نفر در یک گروه تلگرامی صورت گرفته، در چند جمله کوتاه و کلیدی خلاصه کن.

        --- مکالمات گروه ---
        ${history}
        --------------------
    `;

  try {
    const result = await model.generateContent(summaryPrompt);
    const responseText = result.response.text();
    bot.sendMessage(chatId, responseText);
  } catch (error) {
    console.error("خطا در خلاصه سازی:", error);
    bot.sendMessage(chatId, "متاسفانه در خلاصه کردن مکالمات مشکلی پیش آمد.");
  }
});

// ===== پردازشگر دستور /بگرد =====
bot.onText(/\/بگرد (.+)|\/search (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const keyword = match[1]; // متن بعد از دستور
  console.log(`[Chat ID: ${chatId}] درخواست جستجو برای "${keyword}" دریافت شد.`);

  // تقسیم متن به پاراگراف‌ها (بر اساس خطوط خالی)
  const paragraphs = thesisKnowledge.split(/\n\s*\n/);

  // پیدا کردن پاراگراف‌هایی که شامل کلیدواژه هستند
  const results = paragraphs.filter((p) => p.includes(keyword));

  if (results.length > 0) {
    let response = `✅ نتایج یافت شده برای کلمه «${keyword}»:\n\n`;
    // ارسال حداکثر ۳ پاراگراف برای جلوگیری از اسپم
    response += results.slice(0, 3).join("\n\n---\n\n");

    if (results.length > 3) {
      response += `\n\n... و ${results.length - 3} نتیجه دیگر نیز یافت شد.`;
    }

    bot.sendMessage(chatId, response);
  } else {
    bot.sendMessage(chatId, `❌ هیچ نتیجه‌ای برای کلمه «${keyword}» در متن یافت نشد.`);
  }
});

// ===== مدیریت خطاهای کلی Polling =====
bot.on("polling_error", (error) => {
  console.error(`خطای Polling: [${error.code}] ${error.message}`);
});
