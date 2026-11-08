/**
 * Founder account setup for email/password sign-in.
 *
 * The office has exactly one account: the founder (`COMPANY.email`). Public
 * sign-up is closed. The founder account can be created once, and only by a
 * request that carries the `FOUNDER_SETUP_TOKEN` set in the server environment.
 * Remove the token from the environment after setup.
 *
 * The database is reached through a lazy import so that importing the pure
 * helpers (which the client-side tests and the setup screen both do) never pulls
 * a Postgres/PGLite driver into the process.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { founderEmail } from "@/lib/office/company";
import { autonomyEnabled } from "@/lib/office/autonomy-switch";

export const FOUNDER_SETUP_HEADER = "x-founder-setup-token";

export {
  MAX_FOUNDER_PASSWORD,
  MIN_FOUNDER_PASSWORD,
  RESET_TOKEN_TTL_SECONDS,
} from "./founder-password";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** Constant-time comparison of the presented token with the configured one. */
export function setupTokenMatches(
  presented: string | null | undefined,
  configured = process.env.FOUNDER_SETUP_TOKEN,
): boolean {
  const expected = configured?.trim();
  if (!expected || expected.length < 16) return false;
  if (typeof presented !== "string" || !presented) return false;
  return timingSafeEqual(digest(presented.trim()), digest(expected));
}

export function normalizeFounderEmailInput(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

export function isFounderEmail(value: unknown): boolean {
  return normalizeFounderEmailInput(value) === founderEmail();
}

export async function founderAccountExists(): Promise<boolean> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<{
    n: number;
  }>`select count(*)::int as n from "user" where lower(email) = ${founderEmail()}`;
  return Number(rows[0]?.n ?? 0) > 0;
}

/** Whether a setup token is configured (and long enough to count). */
export function setupTokenRequired(configured = process.env.FOUNDER_SETUP_TOKEN): boolean {
  const token = configured?.trim();
  return Boolean(token && token.length >= 16);
}

/**
 * True while the one-time founder setup can still be used.
 *
 * First-run setup is open while there is no founder account and either a setup
 * token is configured or the office runs autonomously. An autonomous office
 * bootstraps its own founder instead of waiting for a secret someone has to
 * paste in first. Configuring a token closes that door and makes the token
 * mandatory again.
 */
export async function founderSetupOpen(): Promise<boolean> {
  if (!setupTokenRequired() && !autonomyEnabled(process.env.AUTONOMY)) return false;
  return !(await founderAccountExists());
}

export type SetupVerdict = { ok: true } | { ok: false; error: string };

/** Gate for Better Auth's `/sign-up/email`. Only the founder, once, with the token. */
export async function checkFounderSignUp(
  email: unknown,
  presentedToken: string | null | undefined,
): Promise<SetupVerdict> {
  const normalized = normalizeFounderEmailInput(email);
  if (normalized !== founderEmail()) {
    return {
      ok: false,
      error: "Sign-up is closed. This office has one founder account.",
    };
  }
  if (setupTokenRequired()) {
    if (!setupTokenMatches(presentedToken)) {
      return { ok: false, error: "The setup token is missing or wrong." };
    }
  } else if (!autonomyEnabled(process.env.AUTONOMY)) {
    return {
      ok: false,
      error:
        "Founder setup is closed. Set FOUNDER_SETUP_TOKEN, or enable autonomy, to create the founder account.",
    };
  }
  if (await founderAccountExists()) {
    return {
      ok: false,
      error: "The founder account already exists. Sign in instead.",
    };
  }
  return { ok: true };
}
