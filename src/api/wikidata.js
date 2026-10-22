// src/api/wikidata.js
// Finds a Persian book on Wikidata and returns its English identity
// (English title and author name) plus work-level facts: original
// publication year and original language. Country is left to the model: the
// app means the author's country, and Wikidata's "country of origin" is
// where the work was first published (Argentina for García Márquez).
//
// Wikidata search matches Persian labels directly, so for well-known works
// this needs no model at all. Search results also include films, species and
// scholarly articles with the same name, so a candidate is only accepted if it
// has an author (P50) whose name matches the author read from the spine.

import { fetchWithTimeout } from "../lib/http.js";
import { bestPairScore } from "../lib/text.js";
import { sanitizeMetadata } from "../lib/validation.js";

const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const SCHOLARLY_ARTICLE = "Q13442814";

async function wikidataGet(params, signal) {
  const url = new URL(WIKIDATA_API);
  for (const [key, value] of Object.entries({ format: "json", origin: "*", ...params })) {
    url.searchParams.set(key, value);
  }
  // Browsers cannot set User-Agent; Wikimedia asks for this header instead.
  const response = await fetchWithTimeout(url.href, {
    headers: { "Api-User-Agent": "bookshelf-scanner (personal catalog tool)" },
  }, 12000, signal);
  if (!response.ok) throw new Error(`Wikidata HTTP ${response.status}`);
  return response.json();
}

/**
 * Look up a book with an Arabic-script title. Returns null when no candidate
 * passes the title and author checks.
 */
export async function findWorkOnWikidata(book, signal) {
  if (!book.title) return null;
  try {
    const search = await wikidataGet({
      action: "wbsearchentities",
      search: book.title,
      language: "fa",
      uselang: "en",
      type: "item",
      limit: "7",
    }, signal);
    const ids = (search.search || []).map((result) => result.id);
    if (ids.length === 0) return null;

    const works = await wikidataGet({
      action: "wbgetentities",
      ids: ids.join("|"),
      props: "labels|aliases|claims",
      languages: "en|fa",
    }, signal);
    const candidates = ids.map((id) => works.entities?.[id]).filter(isWrittenWork);
    if (candidates.length === 0) return null;

    const relatedIds = [...new Set(candidates.flatMap((entity) => [
      ...claimIds(entity, "P50"),
      ...claimIds(entity, "P407"),
    ]))].slice(0, 50);
    const related = relatedIds.length === 0 ? {} : (await wikidataGet({
      action: "wbgetentities",
      ids: relatedIds.join("|"),
      props: "labels|aliases",
      languages: "en|fa",
    }, signal)).entities || {};

    return chooseWork(book, candidates, related);
  } catch (err) {
    if (signal?.aborted || err.name === "AbortError") throw err;
    console.warn("Wikidata lookup failed:", err);
    return null;
  }
}

/**
 * Pick the candidate whose Persian title and author best match the spine.
 * Pure function over Wikidata entity JSON, exported for tests.
 */
export function chooseWork(book, candidates, related) {
  const spineAuthors = [book.author, book.authorRoman].filter(Boolean);

  const ranked = candidates.map((entity) => {
    const titleScore = bestPairScore([book.title], namesOf(entity));
    const authorNames = claimIds(entity, "P50").flatMap((id) => namesOf(related[id]));
    const authorScore = spineAuthors.length > 0 ? bestPairScore(spineAuthors, authorNames) : null;
    return { entity, titleScore, authorScore };
  });

  const accepted = ranked.filter(({ titleScore, authorScore }) => authorScore == null
    ? titleScore >= 0.95
    : titleScore >= 0.8 && authorScore >= 0.7);

  // Without an author, an exact title is still ambiguous if several works share it.
  if (accepted.length === 0 || (spineAuthors.length === 0 && accepted.length > 1)) return null;

  accepted.sort((a, b) => (b.titleScore + (b.authorScore ?? 0)) - (a.titleScore + (a.authorScore ?? 0)));
  const work = accepted[0].entity;
  const authorEntity = related[claimIds(work, "P50")[0]];

  return {
    titleEnglish: work.labels?.en?.value || null,
    authorEnglish: authorEntity?.labels?.en?.value || null,
    ...sanitizeMetadata({
      year: earliestYear(work),
      language: related[claimIds(work, "P407")[0]]?.labels?.en?.value,
    }),
  };
}

function isWrittenWork(entity) {
  if (!entity?.claims) return false;
  return claimIds(entity, "P50").length > 0 && !claimIds(entity, "P31").includes(SCHOLARLY_ARTICLE);
}

function claimIds(entity, property) {
  return (entity?.claims?.[property] || [])
    .filter((claim) => claim.rank !== "deprecated")
    .map((claim) => claim.mainsnak?.datavalue?.value?.id)
    .filter(Boolean);
}

function namesOf(entity) {
  if (!entity) return [];
  return [
    ...Object.values(entity.labels || {}).map((label) => label.value),
    ...Object.values(entity.aliases || {}).flat().map((alias) => alias.value),
  ].filter(Boolean);
}

function earliestYear(entity) {
  const years = (entity.claims?.P577 || [])
    .filter((claim) => claim.rank !== "deprecated")
    .map((claim) => /^\+(\d{1,4})-/.exec(claim.mainsnak?.datavalue?.value?.time || "")?.[1])
    .filter(Boolean)
    .map(Number);
  return years.length > 0 ? Math.min(...years) : null;
}

