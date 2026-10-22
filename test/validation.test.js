import test from "node:test";
import assert from "node:assert/strict";

import { sanitizeExtractedBook, sanitizeMetadata, sanitizeStoredBook } from "../src/lib/validation.js";

test("sanitizes and clamps model extraction output", () => {
  assert.deepEqual(sanitizeExtractedBook({
    title: "  Sapiens  ",
    author: ["invalid"],
    confidence: 4,
  }), {
    title: "Sapiens",
    titleRoman: "",
    author: "",
    authorRoman: "",
    confidence: 1,
  });
});

test("rejects malformed and out-of-range metadata", () => {
  assert.deepEqual(sanitizeMetadata({
    year: { value: 2020 },
    pages: -3,
    country: ["Iran"],
    genre: "Invented category",
    language: "Persian",
  }), { language: "Persian" });
});

test("stored records cannot retain invalid known fields", () => {
  const book = sanitizeStoredBook({ title: "A Book", confidence: "0.8", pages: "320", country: {} });
  assert.equal(book.confidence, 0.8);
  assert.equal(book.pages, 320);
  assert.equal(book.country, null);
});

test("legacy records without IDs receive stable fallback IDs", () => {
  const first = sanitizeStoredBook({ title: "A Book", author: "An Author" });
  const second = sanitizeStoredBook({ title: "A Book", author: "An Author" });
  assert.equal(first.id, second.id);
});

test("stored records keep English identity and Wikidata sources", () => {
  const book = sanitizeStoredBook({
    title: "بوف کور",
    titleEnglish: "  The Blind Owl ",
    authorEnglish: 42,
    metadataSource: { titleEnglish: "wikidata", year: "wikidata", pages: "guess" },
  });
  assert.equal(book.titleEnglish, "The Blind Owl");
  assert.equal(book.authorEnglish, "42");
  assert.deepEqual(book.metadataSource, { titleEnglish: "wikidata", year: "wikidata" });
});
