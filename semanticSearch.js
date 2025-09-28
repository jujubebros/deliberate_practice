const fs = require("fs");
const cosineSimilarity = require("compute-cosine-similarity");

let pipeline;
const loadModelPromise = import("@xenova/transformers").then((module) => {
  pipeline = module.pipeline;
});

let modelPipeline = null;
let corpusVectors = [];
let corpusTexts = [];

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
    // استفاده از مدل کوچک و سبک که برای هاست رایگان مناسب است.
    const modelName = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2";

    console.log(`⏳ در حال بارگذاری مدل ${modelName} با دستور صریح برای نادیده گرفتن نسخه کوانتیزه...`);

    // *** راه حل نهایی و قطعی بر اساس تشخیص صحیح شما ***
    // به صراحت به کتابخانه می‌گوییم که نسخه کوانتیزه را بارگذاری نکند.
    modelPipeline = await pipeline("feature-extraction", modelName, {
      quantized: false,
    });

    console.log("✅ مدل با موفقیت بارگذاری و آماده استفاده شد.");
  } catch (error) {
    console.error("❌ خطا در بارگذاری مدل از Hugging Face:", error);
    throw error;
  }
}

// ... بقیه کد بدون هیچ تغییری صحیح است ...
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
