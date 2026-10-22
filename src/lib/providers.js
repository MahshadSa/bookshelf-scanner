// src/lib/providers.js
// Model providers, their defaults, and settings migration.
//
// Both providers speak the OpenAI chat-completions format, so only the URL,
// default models and a few request fields differ.
//
// - Google Gemini (default): free tier through an AI Studio key, through
//   Google's OpenAI-compatible endpoint. Flash models read images and
//   text. Calls go through the dev-server proxy like Z.ai's, so the app
//   does not depend on Google's CORS behaviour. Gemini 3 models are tuned
//   for the default temperature, so none is sent; reasoning_effort keeps
//   thinking short.
// - Z.ai: Zhipu's international platform. GLM-4.6V-Flash (vision)
//   and GLM-4.7-Flash (text) are free. Its API sends no CORS headers on the
//   preflight, so browsers cannot call it directly; the Vite dev server
//   proxies /zai to it (see vite.config.js). The docs describe images as
//   "URL or Base64 encoding", so images go as bare base64 without the
//   data: prefix. Thinking can be switched off on the GLM-4.6 series;
//   GLM-4.7 and GLM-5.3 always think.
// - HuggingFace Router: paid inference credits. Qwen3.5 thinks by default;
//   chat_template_kwargs switches that off.

export const PROVIDERS = {
  gemini: {
    label: "Google Gemini (free tier)",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    browserUrl: "/gemini/v1beta/openai/chat/completions",
    // Flash-Lite has the most free requests per minute and is less often
    // overloaded than the newest Flash.
    defaultVisionModel: "gemini-3.5-flash-lite",
    defaultTextModel: "gemini-3.5-flash-lite",
    extraBody: () => ({ reasoning_effort: "low" }),
    // Thinking tokens count against the output limit.
    minMaxTokens: 8192,
    bareBase64Images: false,
    keyLabel: "Google AI Studio API key",
    keyPlaceholder: "Paste your AI Studio API key",
    keyUrl: "https://aistudio.google.com/apikey",
    keyHint: "Free tier, no card needed. Runs through the local dev server (npm run dev).",
  },
  zai: {
    label: "Z.ai GLM (free models)",
    url: "https://api.z.ai/api/paas/v4/chat/completions",
    browserUrl: "/zai/api/paas/v4/chat/completions",
    defaultVisionModel: "glm-4.6v-flash",
    defaultTextModel: "glm-4.7-flash",
    extraBody: (model) => ({
      temperature: 0.1,
      thinking: { type: /^glm-(4\.7|5\.3)/i.test(model) ? "enabled" : "disabled" },
    }),
    // Models that always think spend tokens on reasoning before answering.
    minMaxTokens: 4096,
    bareBase64Images: true,
    keyLabel: "Z.ai API key",
    keyPlaceholder: "Paste your Z.ai API key",
    keyUrl: "https://z.ai/manage-apikey/apikey-list",
    keyHint: "Free models, no card needed. Runs through the local dev server (npm run dev).",
  },
  huggingface: {
    label: "HuggingFace (paid credits)",
    url: "https://router.huggingface.co/v1/chat/completions",
    defaultVisionModel: "Qwen/Qwen3.5-397B-A17B",
    defaultTextModel: "Qwen/Qwen3.5-397B-A17B",
    extraBody: () => ({ temperature: 0.1, chat_template_kwargs: { enable_thinking: false } }),
    minMaxTokens: 0,
    bareBase64Images: false,
    keyLabel: "HuggingFace token",
    keyPlaceholder: "hf_...",
    keyUrl: "https://huggingface.co/settings/tokens",
    keyHint: "A read token is enough. Calls are billed to your HuggingFace inference credits.",
  },
};

export const DEFAULT_PROVIDER = "gemini";

// Defaults the app shipped with earlier. A saved value equal to one of these
// was never chosen by the user (the form saves whatever is in the field).
const LEGACY_HF_MODELS = new Set(["Qwen/Qwen2.5-VL-72B-Instruct", "Qwen/Qwen2.5-72B-Instruct"]);

/**
 * Bring stored settings to the current shape:
 *   { provider, providers: { zai: {apiKey, visionModel, textModel}, huggingface: {...} } }
 * Older settings were flat ({ apiKey, visionModel, textModel }) and always
 * HuggingFace; they are kept under providers.huggingface. A saved provider
 * that no longer exists falls back to the default.
 */
export function migrateSettings(stored) {
  const settings = stored && typeof stored === "object" ? stored : {};
  const saved = settings.providers && typeof settings.providers === "object" ? settings.providers : {};
  const legacy = settings.providers ? {} : {
    huggingface: { apiKey: settings.apiKey, visionModel: settings.visionModel, textModel: settings.textModel },
  };

  const providers = {};
  for (const [id, config] of Object.entries(PROVIDERS)) {
    const entry = { ...(legacy[id] || {}), ...(saved[id] || {}) };
    const keep = (model) => model && !LEGACY_HF_MODELS.has(model);
    providers[id] = {
      apiKey: entry.apiKey || "",
      visionModel: keep(entry.visionModel) ? entry.visionModel : config.defaultVisionModel,
      textModel: keep(entry.textModel) ? entry.textModel : config.defaultTextModel,
    };
  }

  return {
    provider: PROVIDERS[settings.provider] ? settings.provider : DEFAULT_PROVIDER,
    providers,
  };
}

/**
 * The connection details the API modules need, for the active provider.
 * Returns { provider, apiKey, visionModel, textModel }.
 */
export function activeConnection(settings) {
  const { provider, providers } = migrateSettings(settings);
  return { provider, ...providers[provider] };
}
