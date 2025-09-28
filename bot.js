require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");

const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!telegramToken || !geminiApiKey) {
  console.error("خطا: توکن تلگرام یا کلید API جمنای در متغیرهای محیطی تعریف نشده است.");
  process.exit(1);
}

const bot = new TelegramBot(telegramToken, { polling: true });
const genAI = new GoogleGenerativeAI(geminiApiKey);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

let thesisKnowledge = "";
try {
  console.log("در حال بارگذاری دانش متمرکز از فایل...");
  thesisKnowledge = fs.readFileSync("thesis.txt", "utf-8");
  console.log("دانش متمرکز با موفقیت بارگذاری شد.");
} catch (error) {
  console.error("خطا: فایل 'thesis.txt' پیدا نشد. لطفا ابتدا این فایل را بسازید.");
  process.exit(1);
}

const conversationHistory = {};
const HISTORY_LIMIT = 20;

console.log("بات دستیار آنلاین شد...");

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

bot.onText(/\/بگرد (.+)|\/search (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const keyword = match[1];
  console.log(`[Chat ID: ${chatId}] درخواست جستجو برای "${keyword}" دریافت شد.`);

  const paragraphs = thesisKnowledge.split(/\n\s*\n/);
  const results = paragraphs.filter((p) => p.toLowerCase().includes(keyword.toLowerCase()));

  if (results.length > 0) {
    let fullResponse = `✅ ${results.length} نتیجه برای کلمه «${keyword}» یافت شد:\n\n`;
    fullResponse += results.join("\n\n---\n\n");

    const MAX_MESSAGE_LENGTH = 4096;

    if (fullResponse.length > MAX_MESSAGE_LENGTH) {
      bot.sendMessage(
        chatId,
        `✅ ${results.length} نتیجه برای کلمه «${keyword}» یافت شد. به دلیل طولانی بودن، نتایج در چند پیام ارسال می‌شود:`,
        { reply_to_message_id: msg.message_id }
      );

      let currentMessage = "";
      results.forEach((paragraph, index) => {
        const separator = "\n\n---\n\n";
        if (currentMessage.length + paragraph.length + separator.length > MAX_MESSAGE_LENGTH) {
          bot.sendMessage(chatId, currentMessage);
          currentMessage = paragraph;
        } else {
          currentMessage += (currentMessage ? separator : "") + paragraph;
        }
      });

      if (currentMessage) {
        bot.sendMessage(chatId, currentMessage);
      }
    } else {
      bot.sendMessage(chatId, fullResponse, { reply_to_message_id: msg.message_id });
    }
  } else {
    bot.sendMessage(chatId, `❌ هیچ نتیجه‌ای برای کلمه «${keyword}» در متن یافت نشد.`, {
      reply_to_message_id: msg.message_id,
    });
  }
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userMessage = msg.text;

  if (!userMessage || userMessage.startsWith("/")) return;

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

    if (userMessage.includes(botUsername)) {
      const userQuery = userMessage.replace(botUsername, "").trim();
      if (!userQuery) return;

      console.log(`[Chat ID: ${chatId}] درخواست جدید دریافت شد: "${userQuery}"`);
      bot.sendChatAction(chatId, "typing");

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
                نقش شما: شما یک همکار پژوهشی برجسته در حوزه ادبیات الکترونیک با دانش عمیق کاترین هیلز هستید. شما بسیار دقیق، سنجیده، علمی و ساختاریافته صحبت می‌کنید.

                دستورالعمل اصلی:
                1.  دانش اصلی و مرجع شما، "متن پایان‌نامه" است که در زیر آمده. در پاسخ‌هایت به این متن اولویت بده و در صورت امکان به آن استناد کن.
                2.  با این حال، دانش شما محدود به این متن نیست. شما می‌توانید از دانش عمومی خود به عنوان یک متخصص ادبیات الکترونیک، فلسفه، ابزارشناسی، انسان‌شناسی و مهندسی نرم افزار برای تکمیل، غنی‌سازی و ارائه دیدگاه‌های عمیق‌تر استفاده کنی، اما پاسخ اصلی بهتر است با متن پایان‌نامه مرتبط باشد.
                3.  از "پیام ریپلای شده" (اگر وجود دارد) و "تاریخچه مکالمات" برای درک کامل بافتار سوال کاربر استفاده کن.
                4. تا از تو نخواسته اند که طولانی و مفصل توضیح دهی، این کار را نکن و سعی کن کوتاه پاسخ دهی. 
                --- متن پایان‌نامه (منبع اصلی دانش) ---
                ${thesisKnowledge}
                ----------------------------------------
                
                ${repliedMessageContext}

                --- تاریخچه مکالمات اخیر گروه (برای بافتار) ---
                ${chatHistory}
                --------------------------------------------------

                سوال/درخواست نهایی کاربر: "${userQuery}"
            `;

      const result = await model.generateContent(augmentedPrompt);
      const responseText = result.response.text();

      bot.sendMessage(chatId, responseText, { reply_to_message_id: msg.message_id });
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
