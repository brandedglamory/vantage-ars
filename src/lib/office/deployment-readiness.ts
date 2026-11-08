import { AUTONOMY_DISARMED, autonomyEnabled } from "./autonomy-switch";

export type DeploymentReadiness = {
  ready: boolean;
  score: number;
  summary: string;
  focus: string[];
};

const REQUIRED = ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "FOUNDER_EMAIL"] as const;
const SMTP_FIELDS = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"] as const;

function normalize(value: unknown): string {
  return String(value ?? "").trim();
}

function validUrl(value: string, protocols: readonly string[]): boolean {
  try {
    const url = new URL(value);
    return protocols.includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function buildDeploymentReadiness(env: Record<string, unknown> = {}): DeploymentReadiness {
  const requiredMissing = REQUIRED.filter((key) => !normalize(env[key]));
  const invalidRequired: string[] = [];
  const databaseUrl = normalize(env.DATABASE_URL);
  const authSecret = normalize(env.BETTER_AUTH_SECRET);
  const authUrl = normalize(env.BETTER_AUTH_URL);
  const founderEmail = normalize(env.FOUNDER_EMAIL);
  const autonomy = normalize(env.AUTONOMY).toLowerCase();
  const autonomyOn = autonomyEnabled(autonomy);

  if (databaseUrl && !validUrl(databaseUrl, ["postgres:", "postgresql:"])) {
    invalidRequired.push("DATABASE_URL");
  }
  if (authSecret && authSecret.length < 32) invalidRequired.push("BETTER_AUTH_SECRET");
  if (authUrl && !validUrl(authUrl, ["http:", "https:"])) invalidRequired.push("BETTER_AUTH_URL");
  if (founderEmail && !validEmail(founderEmail)) invalidRequired.push("FOUNDER_EMAIL");
  if (
    autonomy &&
    autonomy !== "on" &&
    !(AUTONOMY_DISARMED as readonly string[]).includes(autonomy)
  ) {
    invalidRequired.push("AUTONOMY (use on or off)");
  }

  const smtpConfigured = SMTP_FIELDS.filter((key) => normalize(env[key]));
  const smtpPort = normalize(env.SMTP_PORT);
  const smtpPortValid =
    !smtpPort || (/^\d+$/.test(smtpPort) && Number(smtpPort) >= 1 && Number(smtpPort) <= 65535);
  const smtpComplete = smtpConfigured.length === SMTP_FIELDS.length && smtpPortValid;
  const smtpIncomplete = smtpConfigured.length > 0 && !smtpComplete;
  const cloudflareAccount = normalize(env.CLOUDFLARE_ACCOUNT_ID);
  const cloudflareToken = normalize(env.CLOUDFLARE_API_TOKEN);
  const cloudflarePartial = Boolean(cloudflareAccount) !== Boolean(cloudflareToken);
  const aiConfigured = Boolean(cloudflareAccount && cloudflareToken) || Boolean(normalize(env.XAI_API_KEY) || normalize(env.HUGGINGFACE_API_TOKEN));

  const focus: string[] = [];

  if (requiredMissing.length > 0) {
    focus.push(`Set missing production values: ${requiredMissing.join(", ")}.`);
  }
  if (invalidRequired.length > 0) {
    focus.push(`Correct invalid production values: ${invalidRequired.join(", ")}.`);
  }
  if (smtpIncomplete) {
    focus.push(
      smtpPortValid
        ? "Complete the SMTP block or keep mail switched off."
        : "Use a valid SMTP port from 1 to 65535, and complete the SMTP block or keep mail switched off.",
    );
  }
  if (cloudflarePartial) {
    focus.push("Set both CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN to enable Cloudflare AI.");
  }
  if (!aiConfigured) {
    focus.push("Add a provider credential for AI-driven research or brief generation.");
  }
  if (!autonomyOn) {
    focus.push("Autonomy is off; the office only runs when someone presses the button.");
  }

  let score = 40;
  score += Math.max(0, 15 - (requiredMissing.length + invalidRequired.length) * 5);
  if (autonomyOn) score += 20;
  if (smtpComplete) score += 10;
  else if (smtpConfigured.length > 0) score += 5;
  if (aiConfigured) score += 10;

  if (focus.length === 0) {
    focus.push("Deployment prerequisites are met; founder boundaries remain active.");
  }

  const ready = requiredMissing.length === 0 && invalidRequired.length === 0;
  score = Math.max(0, Math.min(100, score));
  if (!ready) score = Math.min(score, 59);

  const summary = ready
    ? autonomyOn
      ? "The deployment is ready for live launch. The office keeps its own clock and works within the standing delegation."
      : "The deployment is ready for manual launch. The office runs itself unless someone presses the button, because autonomy is switched off."
    : "The deployment is not ready. Required production values must be present and valid.";

  return {
    ready,
    score,
    summary,
    focus,
  };
}
