// src/api/enricher.js
// Metadata enrichment, in this order:
//   1. English identity for non-Latin titles: Wikidata first (exact, free),
//      then the text model if Wikidata has no match. Open Library catalogues
//      Persian classics and translations under their English titles, which
//      a phonetic romanization ("Boof-e Koor") rarely matches.
//   2. Open Library (free, no key). Romanized and original-script searches can
//      find the actual edition; the English-title search finds the *work*, so
//      only work-level fields (year, genre) are taken from it, never the
//      pages, ISBN or cover of an English edition.
//   3. LLM fallback for fields still missing (fills gaps from training
//      knowledge). Neither Open Library nor the Wikidata step returns the
//      author's country of origin, so country always comes from the model.

import { textSimilarity } from "../lib/text.js";
import { sanitizeMetadata, sanitizeEnglishIdentity } from "../lib/validation.js";
import { fetchWithTimeout } from "../lib/http.js";
import { chatCompletion, parseJsonReply } from "../lib/llm.js";
import { findWorkOnWikidata } from "./wikidata.js";

const OPEN_LIBRARY_URL = "https://openlibrary.org/search.json";

// Fields that describe the work rather than a particular edition.
const WORK_FIELDS = ["year", "genre"];

// --- Open Library ---

async function searchOpenLibrary(title, author, signal) {
  const params = new URLSearchParams({
    title,
    author,
    limit: "8",
    fields: "title,author_name,first_publish_year,number_of_pages_median,subject,language,cover_i,isbn",
  });

  try {
    const response = await fetchWithTimeout(`${OPEN_LIBRARY_URL}?${params}`, {}, 12000, signal);
    if (!response.ok) return null;

    const data = await response.json();
    if (!data.docs || data.docs.length === 0) return null;

    const doc = chooseBestMatch(data.docs, title, author);
    if (!doc) return null;
    return sanitizeMetadata({
      year: doc.first_publish_year || null,
      pages: doc.number_of_pages_median || null,
      genre: extractGenre(doc.subject),
      language: extractLanguage(doc.language),
      isbn: (doc.isbn && doc.isbn[0]) || null,
      coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null,
      // Open Library does not reliably provide author nationality, so we
      // leave country to the LLM step.
      country: null,
    });
  } catch (err) {
    if (signal?.aborted || err.name === "AbortError") throw err;
    console.warn("Open Library search failed:", err);
    return null;
  }
}

function chooseBestMatch(docs, title, author) {
  const ranked = docs.map((doc) => {
    const titleScore = textSimilarity(title, doc.title);
    const authorScore = author
      ? Math.max(0, ...(doc.author_name || []).map((name) => textSimilarity(author, name)))
      : null;
    const score = authorScore == null ? titleScore : titleScore * 0.75 + authorScore * 0.25;
    return { doc, titleScore, authorScore, score };
  }).sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best) return null;
  if (best.authorScore == null) return best.titleScore >= 0.78 ? best.doc : null;
  return best.titleScore >= 0.62 && best.authorScore >= 0.55 && best.score >= 0.68
    ? best.doc
    : null;
}

const GENRE_KEYWORDS = {
  Fiction:     ["fiction", "novel", "stories", "literary fiction", "short stories"],
  "Non-fiction": ["non-fiction", "nonfiction"],
  History:     ["history", "historical"],
  Philosophy:  ["philosophy", "philosophical"],
  Science:     ["science", "scientific", "physics", "biology", "chemistry", "mathematics"],
  Poetry:      ["poetry", "poems", "verse"],
  Biography:   ["biography", "autobiography", "memoir"],
  "Self-help": ["self-help", "personal development"],
  Religion:    ["religion", "religious", "islam", "christianity", "spirituality", "sufi"],
  Politics:    ["politics", "political science", "government"],
  Psychology:  ["psychology", "psychological"],
  Art:         ["art", "painting", "sculpture", "design"],
  Drama:       ["drama", "plays", "theater", "theatre"],
};

function extractGenre(subjects) {
  if (!subjects || subjects.length === 0) return null;
  const lower = subjects.map((s) => String(s).toLowerCase());
  for (const [genre, keywords] of Object.entries(GENRE_KEYWORDS)) {
    if (keywords.some((kw) => lower.some((s) => s.includes(kw)))) {
      return genre;
    }
  }
  return null;
}

const LANG_MAP = {
  eng: "English", per: "Persian", fas: "Persian", ara: "Arabic",
  fre: "French", fra: "French", ger: "German", deu: "German",
  spa: "Spanish", rus: "Russian", tur: "Turkish", ita: "Italian",
  jpn: "Japanese", chi: "Chinese", zho: "Chinese", por: "Portuguese",
  dut: "Dutch", nld: "Dutch", swe: "Swedish",
};

function extractLanguage(languages) {
  if (!languages || languages.length === 0) return null;
  return LANG_MAP[languages[0]] || languages[0];
}

// --- English identity ---

const NON_LATIN_LETTER = /(?!\p{Script=Latin})\p{L}/u;
const ARABIC_SCRIPT = /\p{Script=Arabic}/u;

async function identifyWithLLM(book, llm, signal) {
  const prompt = `A book spine on a shelf reads:

Title: ${describe(book.title, book.titleRoman)}
Author: ${describe(book.author, book.authorRoman)}

What is this work called in English? Give the title of its published English translation, or, if it is itself a translation into this language, its original title when that is English, otherwise the title it is commonly known by in English. Also give the author's name as usually written in English.

Return ONLY a JSON object: {"title_en": <string or null>, "author_en": <string or null>}
Use null for title_en if you do not recognize this specific book. Do not translate the title word by word.`;

  try {
    const content = await chatCompletion({
      llm, signal,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 200,
    });
    return sanitizeEnglishIdentity(parseJsonReply(content, "object"));
  } catch (err) {
    if (signal?.aborted || err.name === "AbortError") throw err;
    console.warn("English title lookup failed:", err);
    return {};
  }
}

/**
 * Returns { titleEnglish, authorEnglish, source, work } where work holds
 * Wikidata's year / language / country when Wikidata matched.
 */
async function resolveEnglishIdentity(book, llm, signal) {
  if (book.titleEnglish) {
    return {
      titleEnglish: book.titleEnglish,
      authorEnglish: book.authorEnglish || null,
      source: book.metadataSource?.titleEnglish || "user",
      work: {},
    };
  }
  if (!NON_LATIN_LETTER.test(book.title || "")) return { work: {} };

  // Wikidata may know the work but have no English label for it; its year,
  // and language are still kept.
  const found = ARABIC_SCRIPT.test(book.title) ? await findWorkOnWikidata(book, signal) : null;
  const { titleEnglish, authorEnglish, ...work } = found || {};
  if (titleEnglish) return { titleEnglish, authorEnglish, source: "wikidata", work };

  if (!llm?.apiKey) return { work };
  const guess = await identifyWithLLM(book, llm, signal);
  return guess.titleEnglish ? { ...guess, source: "model", work } : { work };
}

// --- LLM fallback ---

async function enrichWithLLM(book, titleEnglish, missingFields, llm, signal) {
  if (!llm?.apiKey) return null;

  const fieldsList = missingFields.join(", ");
  const englishNote = titleEnglish ? `\nKnown in English as: ${titleEnglish}` : "";
  const prompt = `I need metadata for this book. Fill in only these fields: ${fieldsList}.

Title: ${describe(book.title, book.titleRoman)}${englishNote}
Author: ${describe(book.author, book.authorRoman)}

Return ONLY a JSON object with the requested fields. Use null for any you genuinely don't know. Do not guess.

Schema:
{
  "year": <year the work was first published, integer or null>,
  "country": <author's country of origin as a string, or null>,
  "genre": <one of: Fiction, Non-fiction, History, Philosophy, Science, Poetry, Biography, Self-help, Religion, Politics, Psychology, Art, Drama; or null>,
  "language": <original language as a string, or null>
}`;

  try {
    const content = await chatCompletion({
      llm, signal,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 300,
    });
    const parsed = parseJsonReply(content, "object");
    return parsed ? sanitizeMetadata(parsed, missingFields) : null;
  } catch (err) {
    if (signal?.aborted || err.name === "AbortError") throw err;
    console.warn("LLM enrichment failed:", err);
    return null;
  }
}

function describe(original, roman) {
  return (original || "") + (roman ? ` (${roman})` : "");
}

// --- Main entry point ---

/**
 * Enrich a single book. Mutation-free: returns a new object.
 */
export async function enrichBook(book, llm, signal) {
  const identity = await resolveEnglishIdentity(book, llm, signal);

  // Edition searches first: romanized (better coverage), then original script.
  const searchTitle = book.titleRoman || book.title;
  const searchAuthor = book.authorRoman || book.author;
  let metadata = await searchOpenLibrary(searchTitle, searchAuthor, signal);
  if (!metadata && book.titleRoman) {
    metadata = await searchOpenLibrary(book.title, book.author, signal);
  }

  // Then the work under its English title, keeping only work-level fields.
  if (!metadata && identity.titleEnglish) {
    const englishAuthor = identity.authorEnglish || book.authorRoman || "";
    const workMatch = await searchOpenLibrary(identity.titleEnglish, englishAuthor, signal);
    if (workMatch) {
      metadata = Object.fromEntries(WORK_FIELDS.filter((f) => workMatch[f] != null).map((f) => [f, workMatch[f]]));
    }
  }

  const metadataSource = { ...(book.metadataSource || {}) };
  const result = { ...book, metadataSource };

  for (const field of ["titleEnglish", "authorEnglish"]) {
    if (book[field]) metadataSource[field] ||= "user";
    else if (identity[field]) metadataSource[field] = identity.source;
    result[field] = book[field] || identity[field] || null;
  }

  // Precedence per field: user edit > Wikidata (year, language) > Open Library.
  for (const field of ["year", "pages", "genre", "language", "country", "isbn", "coverUrl"]) {
    if (book[field] != null && book[field] !== "") {
      metadataSource[field] ||= "user";
      result[field] = book[field];
    } else if (identity.work[field] != null) {
      metadataSource[field] = "wikidata";
      result[field] = identity.work[field];
    } else if (metadata?.[field] != null) {
      metadataSource[field] = "openlibrary";
      result[field] = metadata[field];
    } else {
      result[field] = null;
    }
  }

  // Ask the model only for work-level facts it can know. Page counts depend
  // on the edition in hand, so a model's answer would be a guess.
  const missing = ["year", "country", "genre", "language"].filter((field) => !result[field]);

  if (missing.length > 0 && llm?.apiKey) {
    const llmData = await enrichWithLLM(book, result.titleEnglish, missing, llm, signal);
    if (llmData) {
      for (const field of missing) {
        if (llmData[field] != null && llmData[field] !== "") {
          result[field] = llmData[field];
          metadataSource[field] = "model";
        }
      }
    }
  }

  return result;
}

/**
 * Enrich a batch of books with progress callbacks.
 *
 * @param {function} onProgress  (completed, total, currentTitle) => void
 */
export async function enrichBooks(books, llm, onProgress, signal, concurrency = 2) {
  const enriched = new Array(books.length);
  let nextIndex = 0;
  let completed = 0;

  const worker = async () => {
    while (nextIndex < books.length) {
      signal?.throwIfAborted();
      const index = nextIndex++;
      const book = books[index];
      onProgress?.(completed, books.length, book.titleRoman || book.title);
      enriched[index] = await enrichBook(book, llm, signal);
      completed += 1;
    }
  };

  const workerCount = Math.max(1, Math.min(concurrency, books.length));
  await Promise.all(Array.from({ length: workerCount }, worker));
  onProgress?.(books.length, books.length, null);
  return enriched;
}
