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
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });

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
const HISTORY_LIMIT = 20; // تعداد آخرین پیام‌ها که برای حفظ بافتار ذخیره می‌شود

console.log("بات حرفه‌ای دستیار پایان‌نامه (نسخه متمرکز) آنلاین شد...");

// ===== پردازشگر اصلی پیام‌ها =====
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userMessage = msg.text;

  if (!userMessage) return;

  // مرحله ۱: ذخیره تمام پیام‌ها برای حفظ بافتار مکالمه
  if (!conversationHistory[chatId]) {
    conversationHistory[chatId] = [];
  }
  const messageData = `${msg.from.first_name || "User"}: ${userMessage}`;
  conversationHistory[chatId].push(messageData);
  if (conversationHistory[chatId].length > HISTORY_LIMIT) {
    conversationHistory[chatId].shift(); // حذف پیام‌های قدیمی
  }

  // مرحله ۲: بررسی اینکه آیا بات باید پاسخ دهد (فقط در صورت منشن شدن)
  try {
    const botInfo = await bot.getMe();
    const botUsername = `@${botInfo.username}`;

    if (userMessage.includes(botUsername)) {
      const userQuery = userMessage.replace(botUsername, "").trim();
      if (!userQuery) return;

      console.log(`[Chat ID: ${chatId}] درخواست جدید دریافت شد: "${userQuery}"`);
      bot.sendChatAction(chatId, "typing");

      // مرحله ۳: استفاده از حافظه موقت گروه
      const chatHistory = conversationHistory[chatId].join("\n");

      // مرحله ۴: ساخت پرامپت نهایی با ترکیب دانش و تاریخچه
      const augmentedPrompt = `
                نقش شما: شما یک دستیار هوشمند و متخصص رساله بررسی ماهیت و کارکرد ادبیات الکترونیک و جایگاه آن در زبان فارسی نوشته عاطفه عطری هستید.

                دستورالعمل اصلی:
                1.  برای پاسخ به سوال کاربر، ابتدا "تاریخچه مکالمات اخیر گروه" را بخوان تا بافتار سوال را درک کنی.
                2.  سپس، فقط و فقط بر اساس "متن اصلی" که در زیر آمده، به سوال پاسخ بده.
                3.  به هیچ وجه از دانش عمومی خود استفاده نکن. اگر پاسخ در "متن اصلی" نبود، به صراحت بگو: "پاسخ این سوال در متن خلاصه شده‌ای که در اختیار من است، وجود ندارد."
                4.  پاسخ خود را به زبان فارسی، واضح و محترمانه ارائه بده.

                --- متن اصلی (تنها منبع دانش شما) ---
                ${thesisKnowledge}
                ----------------------------------------

                --- تاریخچه مکالمات اخیر گروه (برای درک بافتار) ---
                ${chatHistory}
                --------------------------------------------------

                سوال/درخواست نهایی کاربر: "${userQuery}"
            `;

      // مرحله ۵: ارسال به مدل و دریافت پاسخ
      const result = await model.generateContent(augmentedPrompt);
      const responseText = result.response.text();

      bot.sendMessage(chatId, responseText);
      console.log(`[Chat ID: ${chatId}] پاسخ تخصصی ارسال شد.`);
    }
  } catch (error) {
    console.error("خطا در پردازش پیام:", error);
    bot.sendMessage(chatId, "متاسفانه مشکلی در پردازش درخواست شما پیش آمد.");
  }
});

bot.on("polling_error", (error) => {
  console.error(`خطای Polling: [${error.code}] ${error.message}`);
});
