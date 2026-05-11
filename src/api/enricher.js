// src/api/enricher.js
// Two-tier metadata enrichment:
//   1. Open Library API (free, no key, but sparse for Persian publishers)
//   2. LLM fallback via HuggingFace (fills gaps from training knowledge)
//
// The LLM is called per-missing-field, not only when everything is missing.
// Open Library reliably returns year and pages but rarely returns the
// author's country of origin, so country almost always needs the LLM.

const OPEN_LIBRARY_URL = "https://openlibrary.org/search.json";
const HF_API_URL = "https://router.huggingface.co/v1/chat/completions";

// --- Open Library ---

async function searchOpenLibrary(title, author) {
  const params = new URLSearchParams({
    title,
    author,
    limit: "3",
    fields: "title,author_name,first_publish_year,number_of_pages_median,subject,language,cover_i,isbn",
  });

  try {
    const response = await fetch(`${OPEN_LIBRARY_URL}?${params}`);
    if (!response.ok) return null;

    const data = await response.json();
    if (!data.docs || data.docs.length === 0) return null;

    const doc = data.docs[0];
    return {
      year: doc.first_publish_year || null,
      pages: doc.number_of_pages_median || null,
      genre: extractGenre(doc.subject),
      language: extractLanguage(doc.language),
      isbn: (doc.isbn && doc.isbn[0]) || null,
      coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null,
      // Open Library does not reliably provide author nationality, so we
      // leave country to the LLM step.
      country: null,
    };
  } catch (err) {
    console.warn("Open Library search failed:", err);
    return null;
  }
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

// --- LLM fallback ---

async function enrichWithLLM(title, author, missingFields, apiKey, model) {
  if (!apiKey) return null;

  const fieldsList = missingFields.join(", ");
  const prompt = `I need metadata for this book. Fill in only these fields: ${fieldsList}.

Title: ${title}
Author: ${author}

Return ONLY a JSON object with the requested fields. Use null for any you genuinely don't know. Do not guess.

Schema:
{
  "year": <integer or null>,
  "country": <author's country of origin as a string, or null>,
  "genre": <one of: Fiction, Non-fiction, History, Philosophy, Science, Poetry, Biography, Self-help, Religion, Politics, Psychology, Art, Drama; or null>,
  "pages": <integer or null>,
  "language": <original language as a string, or null>
}`;

  try {
    const response = await fetch(HF_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 256,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      console.warn(`LLM enrichment HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const cleaned = content.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch (err) {
    console.warn("LLM enrichment failed:", err);
    return null;
  }
}

// --- Main entry point ---

/**
 * Enrich a single book. Mutation-free: returns a new object.
 */
export async function enrichBook(book, apiKey, textModel) {
  // Prefer romanized terms for Open Library; coverage is much better.
  const searchTitle = book.titleRoman || book.title;
  const searchAuthor = book.authorRoman || book.author;

  let metadata = await searchOpenLibrary(searchTitle, searchAuthor);

  // Retry with original script if romanized got nothing
  if (!metadata && book.titleRoman) {
    metadata = await searchOpenLibrary(book.title, book.author);
  }

  let result = {
    ...book,
    year:     book.year     ?? metadata?.year     ?? null,
    pages:    book.pages    ?? metadata?.pages    ?? null,
    genre:    book.genre    ?? metadata?.genre    ?? null,
    language: book.language ?? metadata?.language ?? null,
    country:  book.country  ?? metadata?.country  ?? null,
    isbn:     book.isbn     ?? metadata?.isbn     ?? null,
    coverUrl: book.coverUrl ?? metadata?.coverUrl ?? null,
  };

  // Identify gaps the LLM might know
  const missing = [];
  if (!result.year)     missing.push("year");
  if (!result.country)  missing.push("country");
  if (!result.genre)    missing.push("genre");
  if (!result.pages)    missing.push("pages");
  if (!result.language) missing.push("language");

  if (missing.length > 0 && apiKey) {
    const titleQ = book.title + (book.titleRoman ? ` (${book.titleRoman})` : "");
    const authorQ = book.author + (book.authorRoman ? ` (${book.authorRoman})` : "");
    const llmData = await enrichWithLLM(titleQ, authorQ, missing, apiKey, textModel);
    if (llmData) {
      for (const field of missing) {
        if (llmData[field] != null && llmData[field] !== "") {
          result[field] = llmData[field];
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
export async function enrichBooks(books, apiKey, textModel, onProgress) {
  const enriched = [];
  for (let i = 0; i < books.length; i++) {
    onProgress?.(i, books.length, books[i].titleRoman || books[i].title);
    const result = await enrichBook(books[i], apiKey, textModel);
    enriched.push(result);

    // Modest delay between calls to be polite to free APIs
    if (i < books.length - 1) {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  onProgress?.(books.length, books.length, null);
  return enriched;
}
