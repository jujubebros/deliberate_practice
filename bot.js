// فراخوانی کتابخانه‌ها
require("dotenv").config(); // برای خواندن متغیرها از فایل .env
const TelegramBot = require("node-telegram-bot-api");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// گرفتن توکن‌ها از فایل .env
const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const geminiApiKey = process.env.GEMINI_API_KEY;

// ----- تنظیمات اولیه -----
// ساخت یک نمونه از بات تلگرام با حالت "polling" برای دریافت پیام‌ها
const bot = new TelegramBot(telegramToken, { polling: true });

// ساخت یک نمونه از مدل هوش مصنوعی
const genAI = new GoogleGenerativeAI(geminiApiKey);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

console.log("Bot has been started...");

// ----- پردازش پیام‌ها -----
// گوش دادن به هر نوع پیامی که از نوع متنی باشد
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userMessage = msg.text;

  // اگر پیام متنی نباشد، کاری انجام نده
  if (!userMessage) return;

  try {
    const botInfo = await bot.getMe();
    const botUsername = `@${botInfo.username}`;

    // بررسی اینکه آیا بات در پیام منشن شده است یا خیر
    if (userMessage.includes(botUsername)) {
      // حذف نام کاربری بات از پیام برای ارسال به هوش مصنوعی
      const prompt = userMessage.replace(botUsername, "").trim();

      // اگر بعد از حذف نام بات، پیامی باقی نمانده بود، کاری نکن
      if (!prompt) return;

      console.log(`Received prompt from chat ${chatId}: "${prompt}"`);

      // نمایش حالت "در حال تایپ کردن..." در تلگرام
      bot.sendChatAction(chatId, "typing");

      // ارسال پرامپت به مدل Gemini و گرفتن نتیجه
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const responseText = response.text();

      // ارسال پاسخ به کاربر در تلگرام
      bot.sendMessage(chatId, responseText);
      console.log(`Sent response to chat ${chatId}`);
    }
  } catch (error) {
    console.error("Error processing message:", error);
    bot.sendMessage(chatId, "متاسفانه مشکلی در پردازش درخواست شما پیش آمد.");
  }
});
