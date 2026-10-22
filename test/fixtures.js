// Minimal Wikidata entity JSON in the shape wbgetentities returns.

export function entity(id, { fa, en, claims = {}, aliases = {} } = {}) {
  const labels = {};
  if (fa) labels.fa = { language: "fa", value: fa };
  if (en) labels.en = { language: "en", value: en };
  const claimJson = Object.fromEntries(Object.entries(claims).map(([property, values]) => [
    property,
    values.map((value) => ({
      mainsnak: { datavalue: { value: property === "P577" ? { time: value } : { id: value } } },
    })),
  ]));
  return { id, labels, aliases, claims: claimJson };
}

export const BLIND_OWL = entity("Q1211660", {
  fa: "بوف کور",
  en: "The Blind Owl",
  claims: { P31: ["Q7725634"], P50: ["Q315017"], P577: ["+1937-00-00T00:00:00Z"], P407: ["Q9168", "Q1860"] },
});

export const BLIND_OWL_FILM = entity("Q12136571", {
  fa: "بوف کور",
  en: "The Blind Owl",
  claims: { P31: ["Q11424"], P57: ["Q1"] },
});

export const RELATED = {
  Q315017: entity("Q315017", { fa: "صادق هدایت", en: "Sadegh Hedayat" }),
  Q9168: entity("Q9168", { en: "Persian" }),
};
