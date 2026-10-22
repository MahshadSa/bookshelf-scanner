const GENRES = new Set([
  "Fiction", "Non-fiction", "History", "Philosophy", "Science", "Poetry",
  "Biography", "Self-help", "Religion", "Politics", "Psychology", "Art", "Drama",
]);

export function sanitizeExtractedBook(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const book = {
    title: cleanText(value.title),
    titleRoman: cleanText(value.title_roman ?? value.titleRoman),
    author: cleanText(value.author),
    authorRoman: cleanText(value.author_roman ?? value.authorRoman),
    confidence: cleanConfidence(value.confidence),
  };

  return book.title || book.titleRoman ? book : null;
}

/**
 * Clean an English identity from a model reply ({title_en, author_en}) or
 * from Wikidata ({titleEnglish, authorEnglish}).
 */
export function sanitizeEnglishIdentity(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output = {};
  const titleEnglish = cleanText(value.title_en ?? value.titleEnglish);
  const authorEnglish = cleanText(value.author_en ?? value.authorEnglish);
  if (titleEnglish) output.titleEnglish = titleEnglish;
  if (authorEnglish) output.authorEnglish = authorEnglish;
  return output;
}

export function sanitizeMetadata(value, allowedFields = null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allow = allowedFields ? new Set(allowedFields) : null;
  const output = {};
  const assign = (field, cleaned) => {
    if ((!allow || allow.has(field)) && cleaned != null && cleaned !== "") output[field] = cleaned;
  };

  assign("year", cleanInteger(value.year, 0, new Date().getFullYear() + 1));
  assign("pages", cleanInteger(value.pages, 1, 100000));
  assign("country", cleanText(value.country));
  assign("language", cleanText(value.language));
  assign("isbn", cleanText(value.isbn, 40));
  assign("coverUrl", cleanHttpUrl(value.coverUrl));
  if ((!allow || allow.has("genre")) && GENRES.has(value.genre)) output.genre = value.genre;

  return output;
}

export function sanitizeStoredBook(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const identity = sanitizeExtractedBook(value);
  if (!identity) return null;
  const metadata = sanitizeMetadata(value);
  const english = sanitizeEnglishIdentity(value);
  return {
    ...value,
    ...identity,
    titleEnglish: english.titleEnglish || null,
    authorEnglish: english.authorEnglish || null,
    year: metadata.year ?? null,
    pages: metadata.pages ?? null,
    country: metadata.country || null,
    language: metadata.language || null,
    genre: metadata.genre || null,
    isbn: metadata.isbn || null,
    coverUrl: metadata.coverUrl || null,
    id: typeof value.id === "string" || typeof value.id === "number" ? value.id : createStableId(identity),
    sourceImage: cleanText(value.sourceImage, 260),
    metadataSource: sanitizeSources(value.metadataSource),
  };
}

export function cleanInteger(value, min, max) {
  if (value == null || value === "") return null;
  const number = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(number)) return null;
  const integer = Math.round(number);
  return integer >= min && integer <= max ? integer : null;
}

function cleanText(value, maxLength = 500) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanConfidence(value) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return 0.5;
  return Math.min(1, Math.max(0, number));
}

function cleanHttpUrl(value) {
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

const METADATA_SOURCE_FIELDS = [
  "titleEnglish", "authorEnglish", "year", "pages", "country", "language", "genre", "isbn", "coverUrl",
];

function sanitizeSources(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([field, source]) =>
      METADATA_SOURCE_FIELDS.includes(field)
      && ["wikidata", "openlibrary", "model", "user"].includes(source)
    )
  );
}

function createStableId(book) {
  const value = `${book.title}|${book.titleRoman}|${book.author}|${book.authorRoman}`;
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `legacy-${(hash >>> 0).toString(36)}`;
}
