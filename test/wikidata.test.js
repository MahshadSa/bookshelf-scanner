import test from "node:test";
import assert from "node:assert/strict";

import { chooseWork } from "../src/api/wikidata.js";
import { BLIND_OWL, RELATED, entity } from "./fixtures.js";

test("returns the English identity and work facts of a matching work", () => {
  const work = chooseWork({ title: "بوف کور", author: "صادق هدايت" }, [BLIND_OWL], RELATED);
  assert.deepEqual(work, {
    titleEnglish: "The Blind Owl",
    authorEnglish: "Sadegh Hedayat",
    year: 1937,
    language: "Persian",
  });
});

test("rejects a title match whose author differs from the spine", () => {
  assert.equal(chooseWork({ title: "بوف کور", author: "محمود دولت‌آبادی" }, [BLIND_OWL], RELATED), null);
});

test("matches the spine's romanized author against the English label", () => {
  const work = chooseWork({ title: "بوف کور", authorRoman: "Sadegh Hedayat" }, [BLIND_OWL], RELATED);
  assert.equal(work?.titleEnglish, "The Blind Owl");
});

test("without an author, an exact title is accepted only when unambiguous", () => {
  const other = entity("Q2", { fa: "بوف کور", claims: { P50: ["Q3"] } });
  assert.equal(chooseWork({ title: "بوف کور" }, [BLIND_OWL], RELATED)?.year, 1937);
  assert.equal(chooseWork({ title: "بوف کور" }, [BLIND_OWL, other], RELATED), null);
});
