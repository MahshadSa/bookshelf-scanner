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

/**
 * Similarity score in the 0..1 range. Combines edit-distance similarity with
 * token overlap so it works for both short spine text and multi-word titles.
 */
export function textSimilarity(a, b) {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return 0;
  if (left === right) return 1;

  const compactLeft = dedupKey(left);
  const compactRight = dedupKey(right);
  const longest = Math.max(compactLeft.length, compactRight.length);
  const editScore = longest === 0
    ? 0
    : 1 - levenshteinDistance(compactLeft, compactRight) / longest;

  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  const tokenScore = union > 0 ? intersection / union : 0;

  return Math.max(editScore, tokenScore);
}

/**
 * Conservative fuzzy identity check for catalog deduplication. Both original
 * and romanized forms are considered when available.
 */
export function areLikelySameBook(a, b) {
  const titlesA = [a?.title, a?.titleRoman].filter(Boolean);
  const titlesB = [b?.title, b?.titleRoman].filter(Boolean);
  const authorsA = [a?.author, a?.authorRoman].filter(Boolean);
  const authorsB = [b?.author, b?.authorRoman].filter(Boolean);

  const titleScore = bestPairScore(titlesA, titlesB);
  if (titleScore === 0) return false;

  const bothHaveAuthors = authorsA.length > 0 && authorsB.length > 0;
  if (!bothHaveAuthors) return titleScore >= 0.94;

  const authorScore = bestPairScore(authorsA, authorsB);
  return titleScore >= 0.86 && authorScore >= 0.82;
}

export function bestPairScore(left, right) {
  let best = 0;
  for (const a of left) {
    for (const b of right) best = Math.max(best, textSimilarity(a, b));
  }
  return best;
}

function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[b.length];
}
