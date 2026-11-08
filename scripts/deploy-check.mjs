#!/usr/bin/env node

const REQUIRED = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "FOUNDER_EMAIL",
];

const OPTIONAL = [
  "CRON_SECRET",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_FROM",
  "FOUNDER_WEBHOOK_URL",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "XAI_API_KEY",
];

const env = process.env;
const missingRequired = REQUIRED.filter((key) => !String(env[key] ?? "").trim());
const DISARMED = ["off", "false", "0", "no", "paused"];
const autonomyOn = !DISARMED.includes(String(env.AUTONOMY ?? "").trim().toLowerCase());
const blocked = [];

if (autonomyOn && !String(env.BETTER_AUTH_SECRET ?? "").trim()) {
  blocked.push("BETTER_AUTH_SECRET is required while autonomy is enabled");
}

const smtpConfigured = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"].filter(
  (key) => String(env[key] ?? "").trim(),
);
const smtpIncomplete = smtpConfigured.length > 0 && smtpConfigured.length < 5;

console.log("Vantage-ARS deploy preflight\n");
console.log(`AUTONOMY: ${autonomyOn ? "ON" : "OFF"}`);
console.log(`Required env: ${REQUIRED.join(", ")}`);
console.log(`Optional env: ${OPTIONAL.join(", ")}`);
console.log("");

if (missingRequired.length > 0) {
  console.error("Missing required environment variables:");
  for (const key of missingRequired) console.error(`  - ${key}`);
} else {
  console.log("Required environment variables: OK");
}

if (autonomyOn) {
  if (blocked.length > 0) {
    console.error("Autonomy blockers:");
    for (const item of blocked) console.error(`  - ${item}`);
  } else {
    console.log("Autonomy prerequisites: OK");
  }
} else {
  console.log("Autonomy is off; the office only runs when someone presses the button.");
}

if (smtpIncomplete) {
  console.warn("SMTP is partially configured; mail is disabled until the full set is present.");
} else if (smtpConfigured.length === 0) {
  console.log("SMTP: not configured (customer mail remains disabled)");
} else {
  console.log("SMTP: configured");
}

const aiConfigured = Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN) || Boolean(env.XAI_API_KEY);
console.log(aiConfigured ? "AI provider: configured" : "AI provider: not configured (manual-only reasoning still works)");

const ok = missingRequired.length === 0 && !(autonomyOn && blocked.length > 0);
console.log("");
if (ok) {
  console.log("Deployment preflight: READY");
  process.exit(0);
}

console.log("Deployment preflight: NOT READY");
process.exit(1);
