// src/lib/library.js
// Library persistence using IndexedDB (via idb-keyval, ~600 bytes).
//
// Why IndexedDB and not localStorage:
// - localStorage caps at ~5MB. With cover URLs, romanizations, and source
//   image references, a few hundred books gets close to that.
// - IndexedDB is async, which keeps the UI responsive on bigger reads.
// - It survives across origins more reliably and is easier to inspect in
//   devtools while debugging.
//
// The whole library is stored under one key as a JSON-serializable array.
// At a few hundred books this is fine; if it ever grows past that, the
// next step would be one record per book under separate keys.

import { get, set, del } from "idb-keyval";
import { areLikelySameBook } from "./text.js";
import { sanitizeStoredBook } from "./validation.js";
import { migrateSettings } from "./providers.js";

const LIBRARY_KEY = "library:v1";
const SETTINGS_KEY = "settings:v1";

// --- Library ---

export async function loadLibrary() {
  try {
    const stored = await get(LIBRARY_KEY);
    if (!Array.isArray(stored)) return [];
    return stored.map(sanitizeStoredBook).filter(Boolean);
  } catch (err) {
    console.error("Failed to load library:", err);
    return [];
  }
}

export async function saveLibrary(books) {
  try {
    await set(LIBRARY_KEY, books);
  } catch (err) {
    console.error("Failed to save library:", err);
    throw err;
  }
}

/**
 * Merge new books into the existing library, skipping near-duplicates.
 * Dedup uses normalized title + author keys (handles Persian/Arabic
 * character variants and ZWNJ).
 */
export async function addBooksToLibrary(newBooks) {
  const existing = await loadLibrary();
  const toAdd = [];
  for (const candidate of newBooks.map(sanitizeStoredBook).filter(Boolean)) {
    if ([...existing, ...toAdd].some((book) => areLikelySameBook(book, candidate))) continue;
    toAdd.push(candidate);
  }

  const updated = [...existing, ...toAdd];
  await saveLibrary(updated);
  return { library: updated, added: toAdd.length, skipped: newBooks.length - toAdd.length };
}

export async function updateBookInLibrary(bookId, patch) {
  const library = await loadLibrary();
  const updated = library.map((b) => (b.id === bookId ? { ...b, ...patch } : b));
  await saveLibrary(updated);
  return updated;
}

export async function removeBookFromLibrary(bookId) {
  const library = await loadLibrary();
  const updated = library.filter((b) => b.id !== bookId);
  await saveLibrary(updated);
  return updated;
}

export async function clearLibrary() {
  await del(LIBRARY_KEY);
}

// --- Settings (API key, model choice) ---

export async function loadSettings() {
  try {
    return migrateSettings(await get(SETTINGS_KEY));
  } catch {
    return migrateSettings({});
  }
}

export async function saveSettings(settings) {
  await set(SETTINGS_KEY, settings);
}

// --- Export ---

export function exportAsCSV(books) {
  const headers = [
    "Title", "Title (Romanized)", "Title (English)",
    "Author", "Author (Romanized)", "Author (English)",
    "Year", "Country", "Genre", "Pages", "Language", "ISBN", "Confidence",
  ];

  const rows = books.map((b) => [
    csvEscape(b.title),
    csvEscape(b.titleRoman),
    csvEscape(b.titleEnglish),
    csvEscape(b.author),
    csvEscape(b.authorRoman),
    csvEscape(b.authorEnglish),
    b.year || "",
    csvEscape(b.country),
    csvEscape(b.genre),
    b.pages || "",
    csvEscape(b.language),
    csvEscape(b.isbn),
    Number.isFinite(Number(b.confidence)) ? Number(b.confidence).toFixed(2) : "",
  ]);

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

export function exportAsJSON(books) {
  return JSON.stringify(books, null, 2);
}

export function downloadFile(content, filename, mimeType = "text/csv") {
  // BOM helps Excel display Persian text correctly
  const prefix = mimeType === "text/csv" ? "\uFEFF" : "";
  const blob = new Blob([prefix + content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function csvEscape(str) {
  if (!str) return "";
  const s = String(str);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
