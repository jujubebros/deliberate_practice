const fs = require("fs");
const cosineSimilarity = require("compute-cosine-similarity");

const hfToken = process.env.HUGGINGFACE_TOKEN;
if (!hfToken) {
  throw new Error("❌ توکن Hugging Face (HUGGINGFACE_TOKEN) تعریف نشده.");
}
const modelApiUrl =
  "https://api-inference.huggingface.co/pipeline/feature-extraction/heydariAI/persian-embeddings";

// ۲. بارگذاری و آماده‌سازی داده‌های رساله از فایل JSON
let corpusVectors = [];
let corpusTexts = [];
try {
  console.log("📥 بارگذاری بردارهای رساله برای جستجو...");
  const rawData = fs.readFileSync("thesis_embeddings.json", "utf-8");
  const thesisEmbeddings = JSON.parse(rawData);

  corpusVectors = thesisEmbeddings.map((item) => item.vector);
  corpusTexts = thesisEmbeddings.map((item) => item.text.text);

  console.log(`✅ ${corpusTexts.length} پاراگراف برای جستجوی معنایی آماده شد.`);
} catch (error) {
  console.error("❌ خطا در بارگذاری یا پردازش thesis_embeddings.json:", error.message);
  process.exit(1);
}

async function getQueryVector(query) {
  const response = await fetch(modelApiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${hfToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ inputs: [query], options: { wait_for_model: true } }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`خطا در ارتباط با Hugging Face API: ${response.statusText} | ${errorBody}`);
  }

  const vectors = await response.json();
  return vectors[0];
}

async function search(query, top_k = 5) {
  try {
    const queryVector = await getQueryVector(query);

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
    console.error("خطا در تابع جستجو:", error);
    return [];
  }
}

module.exports = { search };
