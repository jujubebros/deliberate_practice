require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");

const geminiApiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(geminiApiKey);

// استفاده از مدل مخصوص برای ساخت Embedding
const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });

// تابعی برای تقسیم متن به قطعات کوچکتر (chunks)
function chunkText(text, chunkSize = 1000, overlap = 100) {
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.substring(i, i + chunkSize));
    i += chunkSize - overlap;
  }
  return chunks;
}

async function processAndEmbedThesis() {
  console.log("شروع خواندن فایل پایان‌نامه...");
  const thesisText = fs.readFileSync("thesis.txt", "utf-8");

  console.log("تقسیم متن به قطعات کوچکتر...");
  const chunks = chunkText(thesisText);
  console.log(`متن به ${chunks.length} قطعه تقسیم شد.`);

  console.log("شروع ساخت embeddings برای هر قطعه...");
  const result = await embeddingModel.batchEmbedContents({
    requests: chunks.map((chunk) => ({ content: chunk })),
  });

  const embeddings = result.embeddings;

  const embeddedChunks = chunks.map((chunk, index) => ({
    text: chunk,
    embedding: embeddings[index].values,
  }));

  console.log("ذخیره کردن embeddings در فایل thesis-embeddings.json...");
  fs.writeFileSync("thesis-embeddings.json", JSON.stringify(embeddedChunks, null, 2));

  console.log("پردازش با موفقیت تمام شد!");
}

processAndEmbedThesis();
