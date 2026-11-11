export type ModelTarget = {
  provider:
    | "workers-ai"
    | "xai"
    | "huggingface"
    | "opencode"
    | "opencode-zen"
    | "zen"
    | string;
  url: string;
  key: string;
  model: string;
  headers?: Record<string, string>;
};

const OPENCODE_ZEN_URL = "https://opencode.ai/zen/v1/chat/completions";
const OPENCODE_ZEN_DEFAULT_MODEL = "mimo-v2.6-flash-free";
const OPENCODE_ZEN_HEADERS = {
  "User-Agent": "opencode/1.15.9 ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.14",
  "X-Opencode-Client": "cli",
  "X-Opencode-Project": "global",
};

function opencodeModel(env: Record<string, string | undefined>): string {
  return (
    env.OPENCODE_ZEN_MODEL?.trim() ||
    env.OPENCODE_MODEL?.trim() ||
    env.ZEN_MODEL?.trim() ||
    env.OPENCODE_ZEN_MODEL_ID?.trim() ||
    OPENCODE_ZEN_DEFAULT_MODEL
  );
}

function opencodeKey(env: Record<string, string | undefined>): string {
  return (
    env.OPENCODE_ZEN_API_KEY?.trim() ||
    env.OPENCODE_API_KEY?.trim() ||
    env.ZEN_API_KEY?.trim() ||
    "public"
  );
}

function opencodeTarget(
  env: Record<string, string | undefined>,
  provider: string,
): ModelTarget {
  const url =
    env.OPENCODE_ZEN_URL?.trim() ||
    env.OPENCODE_URL?.trim() ||
    OPENCODE_ZEN_URL;
  return {
    provider,
    url,
    key: opencodeKey(env),
    model: opencodeModel(env),
    headers: OPENCODE_ZEN_HEADERS,
  };
}

const OPENCODE_ZEN_ALIASES = new Set([
  "opencode",
  "opencode-zen",
  "opencode-zen-completions",
  "zen",
]);

export function resolveModelTarget(env: Record<string, string | undefined>): ModelTarget | null {
  const account = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = env.CLOUDFLARE_API_TOKEN?.trim();
  const xai = env.XAI_API_KEY?.trim();
  const hfModel = env.HUGGINGFACE_MODEL?.trim();
  const hfToken = env.HUGGINGFACE_API_KEY?.trim() || env.HF_TOKEN?.trim();
  const wanted = env.AI_PROVIDER?.trim().toLowerCase();

  if (wanted === "xai" && xai) {
    return {
      provider: "xai",
      url: "https://api.x.ai/v1/chat/completions",
      key: xai,
      model: env.XAI_MODEL?.trim() || "grok-4.5",
    };
  }

  if (wanted === "huggingface") {
    const model = hfModel || "google/gemma-2-2b-it";
    return {
      provider: "huggingface",
      url: `https://api-inference.huggingface.co/models/${model}`,
      key: hfToken || "",
      model,
    };
  }

  if (wanted && OPENCODE_ZEN_ALIASES.has(wanted)) {
    return opencodeTarget(env, wanted);
  }

  if (wanted !== "xai" && account && token && /^[a-f0-9]{32}$/i.test(account)) {
    return {
      provider: "workers-ai",
      url: `https://api.cloudflare.com/client/v4/accounts/${account}/ai/v1/chat/completions`,
      key: token,
      model: env.WORKERS_AI_MODEL?.trim() || "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    };
  }

  if (xai) {
    return {
      provider: "xai",
      url: "https://api.x.ai/v1/chat/completions",
      key: xai,
      model: env.XAI_MODEL?.trim() || "grok-4.5",
    };
  }

  if (hfModel || hfToken) {
    const model = hfModel || "google/gemma-2-2b-it";
    return {
      provider: "huggingface",
      url: `https://api-inference.huggingface.co/models/${model}`,
      key: hfToken || "",
      model,
    };
  }

  // Free, no-key fallback: keeps the office autonomous without paid credentials.
  return opencodeTarget(env, "opencode-zen");
}