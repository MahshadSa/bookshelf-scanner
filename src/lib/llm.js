// src/lib/llm.js
// Shared chat call to the active provider (OpenAI-compatible endpoints).
// `llm` is { provider, apiKey, model }; see providers.js for what differs
// between providers.
//
// Free tiers limit requests per minute, so 429 responses are retried after
// the delay the provider asks for. A daily quota also returns 429; after the
// retries run out the error says so. 503 (a model overloaded for everyone,
// as Gemini reports it) is retried the same way.

import { fetchWithTimeout } from "./http.js";
import { PROVIDERS } from "./providers.js";

const MAX_RETRIES = 3;

export function buildChatRequest(llm, messages, maxTokens) {
  const config = PROVIDERS[llm.provider];
  if (!config) throw new Error(`Unknown model provider: ${llm.provider}`);
  const inBrowser = typeof window !== "undefined";
  return {
    url: inBrowser && config.browserUrl ? config.browserUrl : config.url,
    init: {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${llm.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: llm.model,
        messages: config.bareBase64Images ? messages.map(stripDataUrlPrefixes) : messages,
        max_tokens: Math.max(maxTokens, config.minMaxTokens),
        ...config.extraBody(llm.model),
      }),
    },
  };
}

function stripDataUrlPrefixes(message) {
  if (!Array.isArray(message.content)) return message;
  return {
    ...message,
    content: message.content.map((part) => part.type === "image_url"
      ? { ...part, image_url: { ...part.image_url, url: part.image_url.url.replace(/^data:[^,]*;base64,/, "") } }
      : part),
  };
}

// Free tiers can queue a request for a minute or more when busy, so the
// default timeout is generous.
export async function chatCompletion({ llm, messages, maxTokens, timeoutMs = 120000, signal }) {
  const { url, init } = buildChatRequest(llm, messages, maxTokens);

  for (let attempt = 0; ; attempt++) {
    const response = await fetchWithTimeout(url, init, timeoutMs, signal);

    if (response.ok) {
      const data = await response.json();
      return stripReasoning(data.choices?.[0]?.message?.content || "");
    }

    const body = await response.text();
    if ((response.status === 429 || response.status === 503) && attempt < MAX_RETRIES) {
      await sleep(retryDelayMs(response, body, attempt), signal);
      continue;
    }
    throw new Error(describeError(llm.provider, response.status, body));
  }
}

export function describeError(provider, status, body) {
  // Z.ai answers 429 with code 1305, and Gemini 503, when a model is
  // overloaded for everyone, which is not the caller's quota.
  if (status === 503 || (status === 429 && /"code"\s*:\s*"?1305\b|overloaded/i.test(body))) {
    return `The model is overloaded right now (${status}). This is not your key or your quota; try again in a few minutes, or pick another model in Settings.`;
  }
  if (status === 429) {
    return "Rate limit reached (429). Free tiers allow a limited number of requests per minute and per day; wait a while and try again.";
  }
  if (status === 402 && provider === "huggingface") {
    return "HuggingFace returned 402: this account has no inference credits. Add credits at huggingface.co/settings/billing, or switch to Gemini or Z.ai in Settings.";
  }
  if ((status === 400 || status === 401 || status === 403) && /api key|unauthori[sz]ed|invalid username|token expired or incorrect/i.test(body)) {
    return `The API key was rejected (${status}). Check it in Settings.`;
  }
  return `Model API error (${status}): ${body.slice(0, 300)}`;
}

/**
 * Seconds to wait come from the Retry-After header, or from Google's
 * "retryDelay": "23s" / "Please retry in 23.4s" in the body. Otherwise back
 * off exponentially. Capped so a daily quota fails within a few minutes.
 */
export function retryDelayMs(response, body, attempt) {
  const header = Number(response.headers?.get?.("retry-after"));
  const fromBody = /retry(?:Delay"?\s*:\s*"| in )([\d.]+)s/i.exec(body || "")?.[1];
  const seconds = Number.isFinite(header) && header > 0 ? header
    : fromBody ? Number(fromBody)
    : 5 * 2 ** attempt;
  return Math.min(seconds, 60) * 1000;
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });
}

/**
 * Remove <think> blocks in case a provider returns reasoning in the content.
 * Some chat templates emit only the closing tag, so drop everything before it.
 */
export function stripReasoning(content) {
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^[\s\S]*<\/think>/i, "")
    .trim();
}

/**
 * Pull the first JSON value of the given kind out of a model reply,
 * tolerating markdown fences and surrounding prose. Returns null on failure.
 */
export function parseJsonReply(content, kind = "object") {
  const cleaned = content.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(kind === "array" ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}
