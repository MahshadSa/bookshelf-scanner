import test from "node:test";
import assert from "node:assert/strict";

import { enrichBook } from "../src/api/enricher.js";
import { BLIND_OWL, BLIND_OWL_FILM, RELATED } from "./fixtures.js";

const ZAI = { provider: "zai", apiKey: "test-key", model: "glm-test" };
const NO_MODEL = { provider: "zai", apiKey: "", model: "glm-test" };

const ENGLISH_EDITION = {
  title: "The Blind Owl",
  author_name: ["Sadegh Hedayat"],
  first_publish_year: 1937,
  number_of_pages_median: 130,
  subject: ["Fiction"],
  language: ["eng"],
  isbn: ["9780802131805"],
  cover_i: 42,
};

/**
 * Replace global fetch with a router over the three services. `chat` is
 * called with the parsed request body and returns the reply text.
 */
function mockFetch(t, { wikidata = true, openLibrary = () => [], chat = () => "{}" }) {
  const calls = { chat: [], openLibrary: [] };
  t.mock.method(globalThis, "fetch", async (input, options = {}) => {
    const url = new URL(input);
    const json = (body) => new Response(JSON.stringify(body), { status: 200 });

    if (url.hostname === "www.wikidata.org") {
      if (!wikidata) return json({ search: [] });
      if (url.searchParams.get("action") === "wbsearchentities") {
        return json({ search: [{ id: BLIND_OWL_FILM.id }, { id: BLIND_OWL.id }] });
      }
      const ids = url.searchParams.get("ids").split("|");
      const all = { [BLIND_OWL.id]: BLIND_OWL, [BLIND_OWL_FILM.id]: BLIND_OWL_FILM, ...RELATED };
      return json({ entities: Object.fromEntries(ids.map((id) => [id, all[id]])) });
    }
    if (url.hostname === "openlibrary.org") {
      const title = url.searchParams.get("title");
      calls.openLibrary.push(title);
      return json({ docs: openLibrary(title) });
    }
    if (url.hostname === "api.z.ai") {
      const body = JSON.parse(options.body);
      calls.chat.push(body);
      return json({ choices: [{ message: { content: chat(body) } }] });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  return calls;
}

const BLIND_OWL_SPINE = { id: 1, title: "بوف کور", titleRoman: "Boof-e Koor", author: "صادق هدایت", authorRoman: "Sadegh Hedayat" };

test("Wikidata supplies the English title and work facts; an English edition supplies no edition data", async (t) => {
  const calls = mockFetch(t, {
    openLibrary: (title) => (title === "The Blind Owl" ? [ENGLISH_EDITION] : []),
    chat: () => "{\"country\": \"Iran\"}",
  });

  const book = await enrichBook(BLIND_OWL_SPINE, ZAI);

  assert.deepEqual(calls.openLibrary, ["Boof-e Koor", "بوف کور", "The Blind Owl"]);
  assert.equal(calls.chat.length, 1, "the model is asked only for the missing country");
  assert.match(calls.chat[0].messages[0].content, /Fill in only these fields: country./);
  assert.equal(book.titleEnglish, "The Blind Owl");
  assert.equal(book.authorEnglish, "Sadegh Hedayat");
  assert.equal(book.year, 1937);
  assert.equal(book.language, "Persian");
  assert.equal(book.country, "Iran");
  assert.equal(book.genre, "Fiction");
  assert.equal(book.pages, null);
  assert.equal(book.isbn, null);
  assert.equal(book.coverUrl, null);
  assert.deepEqual(book.metadataSource, {
    titleEnglish: "wikidata", authorEnglish: "wikidata",
    year: "wikidata", language: "wikidata", genre: "openlibrary", country: "model",
  });
});

test("falls back to the model for the English title when Wikidata has no match", async (t) => {
  const calls = mockFetch(t, {
    wikidata: false,
    openLibrary: (title) => (title === "The Blind Owl" ? [ENGLISH_EDITION] : []),
    chat: (body) => (body.messages[0].content.includes("called in English")
      ? "<think>Hedayat's novella.</think>{\"title_en\": \"The Blind Owl\", \"author_en\": \"Sadegh Hedayat\"}"
      : "{\"country\": \"Iran\", \"language\": \"Persian\"}"),
  });

  const book = await enrichBook(BLIND_OWL_SPINE, ZAI);

  assert.equal(calls.chat.length, 2);
  assert.equal(calls.chat[0].model, "glm-test");
  assert.equal(book.titleEnglish, "The Blind Owl");
  assert.equal(book.metadataSource.titleEnglish, "model");
  assert.equal(book.year, 1937);
  assert.equal(book.metadataSource.year, "openlibrary");
  assert.equal(book.country, "Iran");
  assert.equal(book.metadataSource.country, "model");
  assert.ok(!calls.chat[1].messages[0].content.includes("pages"), "the model is not asked for page counts");
});

test("an English title the user typed is used as is", async (t) => {
  const calls = mockFetch(t, { openLibrary: () => [] });
  const book = await enrichBook({ ...BLIND_OWL_SPINE, titleEnglish: "My Title" }, NO_MODEL);
  assert.equal(book.titleEnglish, "My Title");
  assert.equal(book.metadataSource.titleEnglish, "user");
  assert.ok(calls.openLibrary.includes("My Title"));
});

test("Latin-script titles skip the English title lookup", async (t) => {
  const calls = mockFetch(t, { openLibrary: () => [] });
  const book = await enrichBook({ id: 2, title: "Sapiens", author: "Yuval Noah Harari" }, NO_MODEL);
  assert.equal(book.titleEnglish, null);
  assert.deepEqual(calls.openLibrary, ["Sapiens"]);
});
