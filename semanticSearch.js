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
  await loadModelPromise;

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

  try {
    // *** تغییر ۱: استفاده از مدل کوچک‌تر و سبک‌تر (تصمیم صحیح شما) ***
    const modelName = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2";

    console.log(`⏳ در حال بارگذاری نسخه کامل مدل سبک (${modelName})...`);

    // *** تغییر ۲: حذف کامل گزینه "quantized: true" (تصحیح اشتباه من) ***
    modelPipeline = await pipeline("feature-extraction", modelName);

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
    const queryEmbedding = await modelPipeline(query, {
      pooling: "mean",
      normalize: true,
    });
    const queryVector = Array.from(queryEmbedding.data);

    const similarities = corpusVectors.map((corpusVector) => cosineSimilarity(queryVector, corpusVector));

    const topResults = similarities
      .map((score, index) => ({ score, index }))
      .sort((a, b) => b.score - a.score)
      .slice(0, top_k);

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
