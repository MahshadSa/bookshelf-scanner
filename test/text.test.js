import test from "node:test";
import assert from "node:assert/strict";

import { normalizeText, textSimilarity, areLikelySameBook } from "../src/lib/text.js";

test("normalizes Persian and Arabic character variants", () => {
  assert.equal(normalizeText("  ي ك آ\u200cب  "), "ی ک اب");
});

test("similarity tolerates small OCR differences", () => {
  assert.ok(textSimilarity("The Blind Owl", "The Blimd Owl") > 0.9);
});

test("book identity compares original and romanized forms", () => {
  const first = { title: "بوف کور", titleRoman: "The Blind Owl", author: "صادق هدایت", authorRoman: "Sadegh Hedayat" };
  const second = { title: "بوف کور", author: "صادق هدايت" };
  assert.equal(areLikelySameBook(first, second), true);
});

test("book identity does not merge similar titles by different authors", () => {
  const first = { title: "Collected Poems", author: "Author One" };
  const second = { title: "Collected Poems", author: "Author Two" };
  assert.equal(areLikelySameBook(first, second), false);
});
