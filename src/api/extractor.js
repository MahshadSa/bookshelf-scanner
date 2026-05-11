// src/api/extractor.js
// Extracts book titles and authors from shelf images using a vision-language
// model via the HuggingFace Router (OpenAI-compatible endpoint).
//
// Default model: Qwen2.5-VL-72B-Instruct, which handles non-Latin scripts
// noticeably better than smaller open-weight VLMs.

import { dedupKey } from "../lib/text.js";

const HF_API_URL = "https://router.huggingface.co/v1/chat/completions";

const EXTRACTION_PROMPT = `You are analyzing a photograph of a bookshelf. List every book whose spine is visible.

For EACH book, provide:
- title: the title exactly as printed (in original script)
- title_roman: romanized/English version of the title (leave empty string if already in Latin script)
- author: author name exactly as printed (in original script)
- author_roman: romanized/English version of the author (leave empty string if already in Latin script)
- confidence: your confidence in the reading from 0.0 to 1.0

Return ONLY a valid JSON array, no other text. Example:
[
  {"title": "بوف کور", "title_roman": "Boof-e Koor", "author": "صادق هدایت", "author_roman": "Sadegh Hedayat", "confidence": 0.92},
  {"title": "Sapiens", "title_roman": "", "author": "Yuval Noah Harari", "author_roman": "", "confidence": 0.97}
]

Be thorough. Include every book you can see, even partially obscured. For partially readable spines, do your best and lower the confidence. If you cannot read any books, return [].`;

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Extract books from a single shelf image.
 */
async function extractFromImage(imageFile, apiKey, model) {
  const dataUrl = await fileToBase64(imageFile);

  const response = await fetch(HF_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: dataUrl } },
          { type: "text", text: EXTRACTION_PROMPT },
        ],
      }],
      max_tokens: 4096,
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Extraction API error (${response.status}): ${body.slice(0, 300)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  return parseBooksFromResponse(content);
}

function parseBooksFromResponse(content) {
  // Strip markdown fences if present
  const cleaned = content.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();

  // Try parsing as-is first; fall back to regex extraction of an array
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) {
      console.warn("Could not find JSON array in VLM response:", content.slice(0, 200));
      return [];
    }
    try {
      parsed = JSON.parse(match[0]);
    } catch (e) {
      console.warn("JSON parse error:", e);
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((b) => b && (b.title || b.title_roman))
    .map((b) => ({
      title: b.title || "",
      titleRoman: b.title_roman || "",
      author: b.author || "",
      authorRoman: b.author_roman || "",
      confidence: typeof b.confidence === "number" ? b.confidence : 0.5,
    }));
}

/**
 * Deduplicate within the current extraction batch using normalized keys.
 * Keeps the entry with higher confidence on conflict.
 */
function deduplicateBatch(books) {
  const byKey = new Map();
  for (const book of books) {
    const key = dedupKey(book.titleRoman || book.title) + "|" + dedupKey(book.authorRoman || book.author);
    const existing = byKey.get(key);
    if (!existing || book.confidence > existing.confidence) {
      byKey.set(key, book);
    }
  }
  return Array.from(byKey.values());
}

/**
 * Process a batch of images, returning a deduplicated list of extracted books.
 *
 * @param {File[]} imageFiles
 * @param {string} apiKey  HuggingFace token
 * @param {string} model   VLM model id
 * @param {function} onProgress  (completed, total, currentFilename) => void
 * @returns {Promise<{books: Array, errors: Array}>}
 */
export async function extractBooksFromImages(imageFiles, apiKey, model, onProgress) {
  if (!apiKey) throw new Error("API key required. Open Settings to add one.");

  const allBooks = [];
  const errors = [];
  let idCounter = Date.now();

  for (let i = 0; i < imageFiles.length; i++) {
    const file = imageFiles[i];
    onProgress?.(i, imageFiles.length, file.name);

    try {
      const books = await extractFromImage(file, apiKey, model);
      books.forEach((book) => {
        allBooks.push({ ...book, id: idCounter++, sourceImage: file.name });
      });
    } catch (err) {
      console.error(`Error on ${file.name}:`, err);
      errors.push({ filename: file.name, message: err.message });
    }
  }

  onProgress?.(imageFiles.length, imageFiles.length, null);

  return { books: deduplicateBatch(allBooks), errors };
}
