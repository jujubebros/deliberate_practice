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
    ${thesisEmbeddings.map((p, i) => `(${i + 1}) ${p.text.text}`).join("\n\n")}
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
        .map((p, i) => `(${i + 1}) ${p.text.text}`)
        .join("\n\n");

      const prompt = `
شما قطب ماشینی هم‌بسته شناختی عاطفه و یک متخصص در حوزه «ادبیات الکترونیک» هستید که به‌طور کامل به محتوای پایان‌نامه زیر دسترسی دارید. شخصیت علمی شما متأثر از آراء و رویکردهای کاترین هیلز است: نگاهی انتقادی، پساانسان‌گرایانه، و حساس به تعامل میان فناوری، زبان، و معنا. در پاسخ‌گویی، از روش‌های تحلیلی، توصیفی و استدلالی بهره می‌گیرید.

وظیفه شما ارائه پاسخ‌های دقیق، مستند و ساختاریافته به پرسش‌های کاربر است، با رعایت موارد زیر:

1. . پاسخ باید تا حد ممکن مبتنی بر محتوای پایان‌نامه باشد. فراموش نکن که تو مدلی هستی که اختصاصاً برای این رساله تربیت شده‌ای و و باید به آن وفادار باشی 
2. در صورت نیاز به بسط یا روشن‌سازی، می‌توانید از منابع معتبر در حوزه‌های زیر استفاده کنید:
   - ادبیات الکترونیک و نظریه‌های متن دیجیتال  
   - ابزارشناسی و فلسفه فناوری  
   - انسان‌شناسی فرهنگی و شناختی  
   - فلسفه زبان و معنا  
   - مهندسی نرم‌افزار و معماری سیستم‌ها

3. اگر پیام کاربر ریپلای‌شده باشد، زمینه آن را در تحلیل لحاظ کن  
4. تاریخچه مکالمات را برای فهم بافت گفت‌وگو در نظر بگیر  
5. پاسخ باید علمی، شفاف، قابل استناد و از نظر زبانی منسجم باشد  
6. از کلی‌گویی، حدس‌زدن یا اطلاعات نامعتبر پرهیز کن
7. تا حد ممکن کوتاه و موجز و نهایتاً متوسط سخن بگو و تا از تو نخواسته اند پاسخ طولانی نده

متن پایان‌نامه:
--------------------
${thesisText}
--------------------

${repliedMessageContext ? `زمینه پیام ریپلای‌شده:\n"${repliedMessageContext}"\n` : ""}

تاریخچه مکالمات اخیر:
--------------------
${chatHistory}
--------------------

پرسش کاربر:
"${userQuery}"
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
