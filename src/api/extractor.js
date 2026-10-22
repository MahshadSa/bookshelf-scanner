// src/api/extractor.js
// Extracts book titles and authors from shelf images using a vision-language
// model from the configured provider (see lib/providers.js; Gemini Flash on
// Google's free tier by default).

import { areLikelySameBook } from "../lib/text.js";
import { sanitizeExtractedBook } from "../lib/validation.js";
import { chatCompletion, parseJsonReply } from "../lib/llm.js";

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

// Z.ai accepts images under 5 MB and at most 6000 px per side, in JPEG or
// PNG. 3072 px on the long side keeps spine text legible while staying well
// inside those limits, and fewer pixels also means fewer tokens per photo.
const MAX_IMAGE_SIDE = 3072;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Return the photo as a data URL, re-encoded as JPEG when it is too large or
 * in a format other than JPEG/PNG.
 */
async function prepareImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const acceptedFormat = file.type === "image/jpeg" || file.type === "image/png";
  if (scale === 1 && acceptedFormat && file.size <= MAX_IMAGE_BYTES) {
    bitmap.close();
    return fileToDataUrl(file);
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.9);
}

/**
 * Extract books from a single shelf image.
 */
async function extractFromImage(imageFile, llm, signal) {
  const dataUrl = await prepareImage(imageFile);

  const content = await chatCompletion({
    llm, signal,
    messages: [{
      role: "user",
      content: [
        { type: "image_url", image_url: { url: dataUrl } },
        { type: "text", text: EXTRACTION_PROMPT },
      ],
    }],
    maxTokens: 4096,
    timeoutMs: 240000,
  });
  return parseBooksFromResponse(content);
}

function parseBooksFromResponse(content) {
  const parsed = parseJsonReply(content, "array");
  if (!Array.isArray(parsed)) {
    console.warn("Could not find JSON array in VLM response:", content.slice(0, 200));
    return [];
  }
  return parsed.map(sanitizeExtractedBook).filter(Boolean);
}

/**
 * Deduplicate within the current extraction batch using normalized keys.
 * Keeps the entry with higher confidence on conflict.
 */
function deduplicateBatch(books) {
  const unique = [];
  for (const book of books) {
    const index = unique.findIndex((existing) => areLikelySameBook(existing, book));
    if (index === -1) {
      unique.push(book);
    } else if (book.confidence > unique[index].confidence) {
      unique[index] = book;
    }
  }
  return unique;
}

/**
 * Process a batch of images, returning a deduplicated list of extracted books.
 *
 * @param {File[]} imageFiles
 * @param {{provider: string, apiKey: string, model: string}} llm  vision model connection
 * @param {function} onProgress  (completed, total, currentFilename) => void
 * @returns {Promise<{books: Array, errors: Array}>}
 */
export async function extractBooksFromImages(imageFiles, llm, onProgress, signal) {
  if (!llm?.apiKey) throw new Error("API key required. Open Settings to add one.");

  const allBooks = [];
  const errors = [];
  let idCounter = Date.now();

  for (let i = 0; i < imageFiles.length; i++) {
    signal?.throwIfAborted();
    const file = imageFiles[i];
    onProgress?.(i, imageFiles.length, file.name);

    try {
      const books = await extractFromImage(file, llm, signal);
      books.forEach((book) => {
        allBooks.push({ ...book, id: idCounter++, sourceImage: file.name });
      });
    } catch (err) {
      if (signal?.aborted || err.name === "AbortError") throw err;
      console.error(`Error on ${file.name}:`, err);
      errors.push({ filename: file.name, message: err.message });
    }
  }

  onProgress?.(imageFiles.length, imageFiles.length, null);

  return { books: deduplicateBatch(allBooks), errors };
}
