/**
 * The office's own clock.
 *
 * The scheduler used to need an external timer — GitHub Actions, a Vercel cron,
 * a systemd timer — all presenting `CRON_SECRET`. That made the office
 * autonomous only for as long as a second system remembered to knock. This
 * module keeps the time itself: while the server process is alive and autonomy
 * is on, it asks once a minute whether the floor is overdue and runs the same
 * guarded tick a cron call would.
 *
 * It adds no powers. `kickFloorIfStale` refuses when autonomy is off, the
 * circuit breaker is open, the office is halted, the audit chain fails to
 * verify, or the database is unreachable — and every action still passes
 * through the constitutional governor.
 */
import { autonomyFromEnv } from "./autonomy-switch";
import { kickFloorIfStale } from "./kick.server";

/** How often the clock checks whether a tick is owed. */
const CHECK_MS = 60_000;

type ClockSlot = { timer: ReturnType<typeof setInterval> };
type ClockGlobal = typeof globalThis & { __vantageSelfClock__?: ClockSlot };

export function startSelfClock(intervalMs: number = CHECK_MS): void {
  if (typeof window !== "undefined") return;
  if (!autonomyFromEnv()) return;
  const globalRef = globalThis as ClockGlobal;
  if (globalRef.__vantageSelfClock__) return;

  const poll = () => {
    void kickFloorIfStale().catch(() => {
      // A tick records its own failures. A thrown nudge must not stop the clock.
    });
  };
  const timer = setInterval(poll, intervalMs);
  (timer as { unref?: () => void }).unref?.();
  globalRef.__vantageSelfClock__ = { timer };
  poll();
}
