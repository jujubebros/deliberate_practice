const fs = require("fs");
const cosineSimilarity = require("compute-cosine-similarity");

// از نسخه ESM کتابخانه ترانسفورمرز استفاده می‌کنیم
let pipeline;
const loadModelPromise = import("@xenova/transformers").then((module) => {
  pipeline = module.pipeline;
});

// ۱. تعریف متغیرهای مدل و داده‌ها
let modelPipeline = null;
let corpusVectors = [];
let corpusTexts = [];

// ۲. تابع اصلی برای آماده‌سازی سرویس جستجو
async function initializeSearchService() {
  // منتظر می‌مانیم تا ماژول ترانسفورمرز بارگذاری شود
  await loadModelPromise;

  // بارگذاری داده‌های رساله از فایل JSON
  try {
    console.log("📥 بارگذاری بردارهای رساله برای جستجو...");
    const rawData = fs.readFileSync("thesis_embeddings.json", "utf-8");
    const thesisEmbeddings = JSON.parse(rawData);

    corpusVectors = thesisEmbeddings.map((item) => item.vector);
    corpusTexts = thesisEmbeddings.map((item) => item.text.text);

    console.log(`✅ ${corpusTexts.length} پاراگراف برای جستجوی معنایی آماده شد.`);
  } catch (error) {
    console.error("❌ خطا در بارگذاری یا پردازش thesis_embeddings.json:", error.message);
    throw error;
  }

  // بارگذاری مدل هوش مصنوعی به صورت محلی
  try {
    console.log(
      "⏳ در حال بارگذاری مدل heydariAI/persian-embeddings... (این مرحله فقط یک بار در شروع اجرا می‌شود و ممکن است زمان‌بر باشد)"
    );
    modelPipeline = await pipeline("feature-extraction", "heydariAI/persian-embeddings", {
      quantized: true, // مهم: برای کاهش مصرف حافظه در هاست‌های رایگان
    });
    console.log("✅ مدل با موفقیت بارگذاری و آماده استفاده شد.");
  } catch (error) {
    console.error("❌ خطا در بارگذاری مدل از Hugging Face:", error);
    throw error;
  }
}

// ۳. تابع اصلی جستجوی معنایی
async function search(query, top_k = 5) {
  if (!modelPipeline) {
    console.error("سرویس جستجو هنوز آماده نشده است. لطفاً چند لحظه صبر کنید.");
    return [];
  }

  try {
    // مرحله ۱: بردارسازی سوال کاربر با استفاده از مدل محلی (شامل Pooling)
    const queryEmbedding = await modelPipeline(query, {
      pooling: "mean",
      normalize: true,
    });
    const queryVector = Array.from(queryEmbedding.data);

    // مرحله ۲: محاسبه شباهت
    const similarities = corpusVectors.map((corpusVector) => cosineSimilarity(queryVector, corpusVector));

    // مرحله ۳: پیدا کردن نتایج برتر
    const topResults = similarities
      .map((score, index) => ({ score, index }))
      .sort((a, b) => b.score - a.score)
      .slice(0, top_k);

    // مرحله ۴: برگرداندن پاراگراف‌های متناظر
    return topResults.map((result) => ({
      text: corpusTexts[result.index],
      score: result.score,
      paragraphNumber: result.index + 1,
    }));
  } catch (error) {
    console.error("خطا در حین اجرای جستجوی معنایی:", error);
    return [];
  }
}

module.exports = { search, initializeSearchService };
