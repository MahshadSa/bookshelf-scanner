import test from "node:test";
import assert from "node:assert/strict";

import { stripReasoning, parseJsonReply, buildChatRequest, chatCompletion, retryDelayMs, describeError } from "../src/lib/llm.js";
import { migrateSettings, activeConnection, PROVIDERS } from "../src/lib/providers.js";

test("strips reasoning blocks a provider leaves in the reply", () => {
  assert.equal(stripReasoning("<think>hmm</think>\n[1]"), "[1]");
  assert.equal(stripReasoning("reasoning without opener</think>{\"a\":1}"), "{\"a\":1}");
  assert.equal(stripReasoning("[]"), "[]");
});

test("parses JSON wrapped in fences or prose", () => {
  assert.deepEqual(parseJsonReply("```json\n[{\"title\":\"x\"}]\n```", "array"), [{ title: "x" }]);
  assert.deepEqual(parseJsonReply("Here you go: {\"year\": 1937}", "object"), { year: 1937 });
  assert.equal(parseJsonReply("no json here", "object"), null);
});

test("each provider gets its own request fields", () => {
  const image = { role: "user", content: [{ type: "image_url", image_url: { url: "data:image/jpeg;base64,QUJD" } }] };

  const vision = buildChatRequest({ provider: "zai", apiKey: "k", model: "glm-4.6v-flash" }, [image], 200);
  const visionBody = JSON.parse(vision.init.body);
  assert.equal(vision.url, PROVIDERS.zai.url, "outside the browser the API is called directly");
  assert.deepEqual(visionBody.thinking, { type: "disabled" });
  assert.equal(visionBody.messages[0].content[0].image_url.url, "QUJD", "Z.ai gets bare base64");
  assert.ok(visionBody.max_tokens >= 4096);

  const text = JSON.parse(buildChatRequest({ provider: "zai", apiKey: "k", model: "glm-4.7-flash" }, [], 200).init.body);
  assert.deepEqual(text.thinking, { type: "enabled" }, "GLM-4.7 always thinks");

  const hf = JSON.parse(buildChatRequest({ provider: "huggingface", apiKey: "k", model: "m" }, [image], 200).init.body);
  assert.deepEqual(hf.chat_template_kwargs, { enable_thinking: false });
  assert.equal(hf.temperature, 0.1);
  assert.equal(hf.max_tokens, 200);
  assert.equal(hf.thinking, undefined);
  assert.equal(hf.messages[0].content[0].image_url.url, "data:image/jpeg;base64,QUJD");

  const gemini = JSON.parse(buildChatRequest({ provider: "gemini", apiKey: "k", model: "m" }, [image], 200).init.body);
  assert.equal(gemini.reasoning_effort, "low");
  assert.equal(gemini.temperature, undefined, "Gemini keeps its default temperature");
  assert.ok(gemini.max_tokens >= 8192, "room for thinking tokens");
  assert.equal(gemini.messages[0].content[0].image_url.url, "data:image/jpeg;base64,QUJD");
});

test("in the browser, Gemini and Z.ai go through the dev-server proxy", (t) => {
  globalThis.window = {};
  t.after(() => delete globalThis.window);
  assert.equal(buildChatRequest({ provider: "gemini", apiKey: "k", model: "m" }, [], 10).url, "/gemini/v1beta/openai/chat/completions");
  assert.equal(buildChatRequest({ provider: "zai", apiKey: "k", model: "m" }, [], 10).url, "/zai/api/paas/v4/chat/completions");
  assert.equal(buildChatRequest({ provider: "huggingface", apiKey: "k", model: "m" }, [], 10).url, PROVIDERS.huggingface.url);
});

test("retries after the delay a 429 asks for, then succeeds", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return calls === 1
      ? new Response("{\"error\": {\"details\": [{\"retryDelay\": \"0s\"}]}}", { status: 429 })
      : new Response(JSON.stringify({ choices: [{ message: { content: "[]" } }] }), { status: 200 });
  });
  const reply = await chatCompletion({ llm: { provider: "zai", apiKey: "k", model: "m" }, messages: [], maxTokens: 10 });
  assert.equal(reply, "[]");
  assert.equal(calls, 2);
});

test("an overloaded service is not reported as a used-up quota", () => {
  const overloaded = "{\"error\":{\"code\":\"1305\",\"message\":\"The service may be temporarily overloaded, please try again later\"}}";
  assert.match(describeError("zai", 429, overloaded), /overloaded/);
  assert.match(describeError("zai", 429, "{\"error\":{\"code\":\"1302\"}}"), /Rate limit/);
  assert.match(describeError("gemini", 503, "[{\"error\":{\"code\":503,\"status\":\"UNAVAILABLE\"}}]"), /overloaded/);
});

test("retries a 503 from an overloaded model, then succeeds", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return calls === 1
      ? new Response("", { status: 503, headers: { "retry-after": "0.01" } })
      : new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 });
  });
  const reply = await chatCompletion({ llm: { provider: "gemini", apiKey: "k", model: "m" }, messages: [], maxTokens: 10 });
  assert.equal(reply, "{}");
  assert.equal(calls, 2);
});

test("reads retry delays from headers and Google error bodies", () => {
  const headers = (value) => ({ headers: new Headers(value ? { "retry-after": value } : {}) });
  assert.equal(retryDelayMs(headers("7"), "", 0), 7000);
  assert.equal(retryDelayMs(headers(), "{\"retryDelay\": \"23s\"}", 0), 23000);
  assert.equal(retryDelayMs(headers(), "Please retry in 4.5s.", 0), 4500);
  assert.equal(retryDelayMs(headers(), "", 2), 20000);
  assert.equal(retryDelayMs(headers("600"), "", 0), 60000, "capped at a minute");
});

test("old flat HuggingFace settings move under providers; Gemini becomes active", () => {
  const migrated = migrateSettings({
    apiKey: "hf_x",
    visionModel: "Qwen/Qwen2.5-VL-72B-Instruct",
    textModel: "my/custom-model",
  });
  assert.equal(migrated.provider, "gemini");
  assert.deepEqual(migrated.providers.huggingface, {
    apiKey: "hf_x",
    visionModel: PROVIDERS.huggingface.defaultVisionModel,
    textModel: "my/custom-model",
  });
  assert.deepEqual(migrated.providers.zai, {
    apiKey: "",
    visionModel: PROVIDERS.zai.defaultVisionModel,
    textModel: PROVIDERS.zai.defaultTextModel,
  });
  assert.equal(migrateSettings({ provider: "openai", providers: {} }).provider, "gemini", "a removed provider falls back");
  assert.equal(migrateSettings({ provider: "zai", providers: {} }).provider, "zai", "a chosen provider is kept");
});

test("current settings round-trip and the active connection follows the provider", () => {
  const settings = migrateSettings({
    provider: "huggingface",
    providers: { huggingface: { apiKey: "hf_y", visionModel: "a", textModel: "b" } },
  });
  assert.deepEqual(migrateSettings(settings), settings);
  assert.deepEqual(activeConnection(settings), { provider: "huggingface", apiKey: "hf_y", visionModel: "a", textModel: "b" });
  assert.equal(activeConnection({}).provider, "gemini");
});
