import { createFileRoute } from "@tanstack/react-router";
import { runOfficeCron } from "@/lib/office/api";

/**
 * The scheduled autonomous run.
 *
 * Authenticated by `CRON_SECRET` as a bearer token (Vercel sends it
 * automatically), because a scheduler has no session cookie. Requires
 * `AUTONOMY=on` — the office does nothing unattended unless the founder turns
 * it on deliberately.
 *
 * Safety properties, all enforced in `runOfficeCron` rather than here:
 *   - the office halts on its own if the audit chain fails;
 *   - a circuit breaker stops the scheduler after repeated failing ticks;
 *   - every action still passes through the constitutional governor, so cost,
 *     customer wins and customer losses reach the founder for approval;
 *   - nothing is emailed to a customer from this route. Letters are drafted.
 *
 * The heavy lifting lives in `runOfficeCron` (a server function, where
 * `.server` imports are allowed); this file only adapts HTTP to that call so the
 * client-bundle import protection stays satisfied.
 */
export const Route = createFileRoute("/api/cron/floor")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const header = request.headers.get("authorization") ?? "";
        const secret = header.startsWith("Bearer ") ? header.slice(7) : "";
        const result = await runOfficeCron({ data: { secret } });
        if (!result.ok) {
          if (result.reason === "Unauthorized")
            return new Response("Unauthorized", { status: 401 });
          if (result.reason === "Autonomy is off.")
            return new Response("Autonomy is off.", { status: 404 });
          return Response.json(
            { ok: false, reason: result.reason ?? "The run failed." },
            { status: 500 },
          );
        }
        return Response.json({
          ok: true,
          ranAt: result.ranAt,
          planned: result.planned,
          executed: result.executed,
          escalated: result.escalated,
          blocked: result.blocked,
          failed: result.failed,
          ran: result.ran,
          detail: result.detail,
        });
      },
    },
  },
} as any);
