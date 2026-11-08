/**
 * The opportunistic nudge.
 *
 * The office advertises a ten-minute cadence, but its two free triggers are
 * not reliable at that cadence: GitHub's scheduled workflows throttle
 * frequent cron runs on low-traffic repositories (gaps of hours were observed
 * in production), and Vercel's daily cron is only a floor. So any public surface
 * that already knows the office is alive — a health poll, a real page-view
 * beacon — is also a chance to catch up: if the last tick is older than
 * `KICK_AFTER_MINUTES`, this starts one.
 *
 * The nudge adds no new powers. It is gated on `AUTONOMY=on`, respects the
 * circuit breaker, and runs the exact tick the timer runs, with every one of
 * its guards: halt, database health, chain verification, dedupe keys and
 * atomic claims. The caller decides only how long it waits; the tick finishes
 * on the server regardless, and the next surface hit retries if a frozen
 * instance cut it short.
 */
import { getSql } from "@/lib/db";
import { autonomyFromEnv } from "./autonomy-switch";
import { COMPANY } from "./company";
import { shouldKick } from "./kick";
import { FAILURE_LIMIT, runNow, type TickResult } from "./scheduler.server";

/**
 * One kick per process per minute. A burst of visitors on one warm instance
 * must not stack catch-up ticks; the tick's own database guards keep distinct
 * instances safe, this just avoids the obvious waste.
 */
const ATTEMPT_THROTTLE_MS = 60_000;

let inFlight: Promise<TickResult> | null = null;
let lastKickAt = 0;

export type KickOutcome = { kicked: true; detail: string } | { kicked: false; reason: string };

/**
 * Start a tick if the scheduler is stale. Safe to call from any public
 * surface; it never throws and never acts outside the scheduler's guards.
 */
export async function kickFloorIfStale(): Promise<KickOutcome> {
  if (!autonomyFromEnv()) {
    return { kicked: false, reason: "autonomy-off" };
  }
  const nowMs = Date.now();
  if (inFlight || nowMs - lastKickAt < ATTEMPT_THROTTLE_MS) {
    return { kicked: false, reason: "throttled" };
  }
  try {
    const sql = await getSql();
    const rows = await sql<{ last_tick_at: string | null; consecutive_failures: number }>`
      select last_tick_at, consecutive_failures from office_state where id = ${COMPANY.id}
    `;
    const parsed = rows[0]?.last_tick_at ? Date.parse(String(rows[0].last_tick_at)) : NaN;
    const minutesSinceTick = Number.isFinite(parsed) ? (nowMs - parsed) / 60_000 : null;
    if (!shouldKick(minutesSinceTick, Number(rows[0]?.consecutive_failures ?? 0), FAILURE_LIMIT)) {
      return { kicked: false, reason: "fresh" };
    }
    lastKickAt = nowMs;
    inFlight = runNow();
    const result = await inFlight;
    return { kicked: true, detail: result.detail };
  } catch (error) {
    return { kicked: false, reason: error instanceof Error ? error.message : "The nudge failed." };
  } finally {
    inFlight = null;
  }
}
