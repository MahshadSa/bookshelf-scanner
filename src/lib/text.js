// src/lib/text.js
// Text normalization helpers, with focus on Persian/Arabic.
//
// Persian and Arabic share many characters that look identical but have
// different code points (e.g. Persian ya U+06CC vs Arabic ya U+064A). Spine
// text often mixes them, and so do API search indexes. Normalizing both
// sides before comparison or search dramatically improves match rates.

/**
 * Normalize a string for fuzzy comparison and search.
 * Strips ZWNJ, tatweel, and other invisibles; folds Arabic-only forms
 * to their Persian equivalents; lowercases and trims whitespace.
 */
export function normalizeText(s) {
  if (!s) return "";
  return s
    // Arabic ya -> Persian ya
    .replace(/\u064A/g, "\u06CC")
    // Arabic kaf -> Persian kaf
    .replace(/\u0643/g, "\u06A9")
    // Alef variants -> plain alef
    .replace(/[\u0622\u0623\u0625]/g, "\u0627")
    // Hamza-on-waw / hamza-on-ya -> plain forms
    .replace(/\u0624/g, "\u0648")
    .replace(/\u0626/g, "\u06CC")
    // Strip ZWNJ, ZWJ, tatweel, Arabic diacritics (harakat)
    .replace(/[\u200C\u200D\u0640\u064B-\u0652\u0670]/g, "")
    // Normalize whitespace
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

/**
 * Stricter normalization for dedup keys: drops punctuation entirely.
 */
export function dedupKey(s) {
  return normalizeText(s).replace(/[\s\-_.,:;!?'"()\[\]\/]/g, "");
}
