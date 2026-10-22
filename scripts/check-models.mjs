// scripts/check-models.mjs
// Checks that a provider's models answer, with the same request shape the
// app sends.
//
//   GEMINI_API_KEY=... npm run check-models [-- path/to/shelf.jpg] [--model gemini-3.8-flash]
//   GEMINI_API_KEY=... npm run check-models -- --list
//   ZAI_API_KEY=... npm run check-models -- --provider zai [path/to/shelf.jpg]
//   HF_TOKEN=hf_... npm run check-models -- --provider huggingface [path/to/shelf.jpg]
//
// --list prints the model IDs the key can use. --model replaces both
// default models. Prints the status, token usage and
// the start of the reply, and flags replies that are empty, cut off, or still
// contain reasoning. If the image request is rejected, the other image encoding
// (with or without the data: prefix) is tried so we learn which one works.
// The photo is sent as is, without the resizing the app does, so use one
// under 5 MB.

import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { buildChatRequest } from "../src/lib/llm.js";
import { DEFAULT_PROVIDER, PROVIDERS } from "../src/lib/providers.js";

const KEY_VARIABLES = { gemini: "GEMINI_API_KEY", zai: "ZAI_API_KEY", huggingface: "HF_TOKEN" };

const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const provider = flag("--provider") || DEFAULT_PROVIDER;
const modelOverride = flag("--model");
const imagePath = args.find((arg) => /\.(jpe?g|png|webp)$/i.test(arg));

const config = PROVIDERS[provider];
if (!config) {
  console.error(`Unknown provider "${provider}". Use one of: ${Object.keys(PROVIDERS).join(", ")}`);
  process.exit(1);
}
const apiKey = process.env[KEY_VARIABLES[provider]];
if (!apiKey) {
  console.error(`Set ${KEY_VARIABLES[provider]} to your ${config.keyLabel}.`);
  process.exit(1);
}

if (args.includes("--list")) {
  const response = await fetch(config.url.replace(/chat\/completions$/, "models"), {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const body = await response.text();
  if (!response.ok) {
    console.log(`FAIL ${response.status}: ${body.slice(0, 300)}`);
    process.exit(1);
  }
  for (const model of JSON.parse(body).data || []) console.log(model.id.replace(/^models\//, ""));
  process.exit(0);
}

const TEXT_PROMPT = `Book spine: Title: بوف کور (Boof-e Koor), Author: صادق هدایت (Sadegh Hedayat).
Return ONLY a JSON object: {"title_en": <English title or null>, "author_en": <string or null>}`;

async function check(model, content, maxTokens, providerConfig = config) {
  const original = PROVIDERS[provider];
  PROVIDERS[provider] = providerConfig;
  const { url, init } = buildChatRequest({ provider, apiKey, model }, [{ role: "user", content }], maxTokens);
  PROVIDERS[provider] = original;

  const started = Date.now();
  const response = await fetch(url, init);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const body = await response.text();
  if (!response.ok) {
    console.log(`  FAIL ${response.status} after ${seconds}s: ${body.slice(0, 300)}`);
    return response.status;
  }
  const data = JSON.parse(body);
  const message = data.choices?.[0]?.message || {};
  const reply = message.content || "";
  const problems = [
    !reply.trim() && "empty reply",
    /<\/think>/i.test(reply) && "reply contains <think> reasoning",
    data.choices?.[0]?.finish_reason === "length" && "reply was cut off at max_tokens",
  ].filter(Boolean);
  const servedBy = response.headers.get("x-inference-provider");
  console.log(`  ${problems.length ? "WARN" : "OK"} in ${seconds}s${servedBy ? ` via ${servedBy}` : ""}`);
  console.log(`  tokens: ${data.usage?.prompt_tokens ?? "?"} in / ${data.usage?.completion_tokens ?? "?"} out`);
  for (const problem of problems) console.log(`  ! ${problem}`);
  console.log(`  reply: ${reply.slice(0, 300).replace(/\s+/g, " ")}`);
  return response.status;
}

const textModel = modelOverride || config.defaultTextModel;
const visionModel = modelOverride || config.defaultVisionModel;

console.log(`\n${textModel} (text)`);
await check(textModel, TEXT_PROMPT, 200);

if (imagePath) {
  const mime = { ".png": "image/png", ".webp": "image/webp" }[extname(imagePath).toLowerCase()] || "image/jpeg";
  const dataUrl = `data:${mime};base64,${(await readFile(imagePath)).toString("base64")}`;
  const imageContent = [
    { type: "image_url", image_url: { url: dataUrl } },
    { type: "text", text: "List every book title visible on these spines as a JSON array of strings, in the original script." },
  ];
  const encoding = (bare) => (bare ? "bare base64" : "data: URL");

  console.log(`\n${visionModel} (image as ${encoding(config.bareBase64Images)}: ${imagePath})`);
  // Only a rejected request (400) can be about the image encoding.
  if (await check(visionModel, imageContent, 2048) === 400) {
    const alternate = { ...config, bareBase64Images: !config.bareBase64Images };
    console.log(`\n${visionModel} (retrying image as ${encoding(alternate.bareBase64Images)})`);
    if (await check(visionModel, imageContent, 2048, alternate) === 200) {
      console.log(`  -> this provider wants images as ${encoding(alternate.bareBase64Images)}; set bareBase64Images: ${alternate.bareBase64Images} in src/lib/providers.js`);
    }
  }
}
