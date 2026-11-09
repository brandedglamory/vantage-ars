/**
 * The system dashboard's read model — server only.
 *
 * Answers three questions from the office's own records, in one pass:
 *
 *   - **Is the system healthy?** The same coarse health document `/api/health`
 *     serves, reduced to the fields this screen shows, so the dashboard and the
 *     monitor can never disagree.
 *   - **Who is active?** Accounts that can sign in, sessions valid right now,
 *     and the sessions created in the last day. Never the session token, never
 *     a password hash.
 *   - **What happened lately?** The append-only audit chain, the agents' own
 *     runs, and real site traffic.
 *
 * Every section is read defensively: one unreadable table must not take the
 * whole screen down, because a dashboard that fails when something is wrong is
 * useless at exactly the moment it is needed.
 */
import { dbSource, getSql } from "@/lib/db";
import { COMPANY } from "./company";
import { officeHealth } from "./health.server";
import type { SystemDashboard, SystemUserSession } from "./types";

function iso(value: unknown): string | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

type SessionRow = {
  email: unknown;
  name: unknown;
  signed_in_at: unknown;
  expires_at: unknown;
  user_agent: unknown;
  ip_address: unknown;
};

async function readUsers(): Promise<SystemDashboard["users"]> {
  const empty: SystemDashboard["users"] = {
    total: 0,
    activeSessions: 0,
    signInsLastDay: 0,
    recent: [],
  };
  try {
    const sql = await getSql();
    const [counts, sessions] = await Promise.all([
      sql<{ accounts: number; active: number; last_day: number }>`
        select
          (select count(*)::int from "user") as accounts,
          (select count(*)::int from "session" where "expiresAt" > now()) as active,
          (
            select count(*)::int from "session"
            where "createdAt" > now() - interval '24 hours'
          ) as last_day
      `,
      sql<SessionRow>`
        select
          u.email as email,
          u.name as name,
          s."createdAt" as signed_in_at,
          s."expiresAt" as expires_at,
          s."userAgent" as user_agent,
          s."ipAddress" as ip_address
        from "session" s
        join "user" u on u.id = s."userId"
        where s."expiresAt" > now()
        order by s."createdAt" desc
        limit 8
      `,
    ]);
    const recent: SystemUserSession[] = sessions.map((row) => ({
      email: text(row.email),
      name: text(row.name),
      signedInAt: iso(row.signed_in_at) ?? "",
      expiresAt: iso(row.expires_at) ?? "",
      userAgent: row.user_agent ? text(row.user_agent) : null,
      ipAddress: row.ip_address ? text(row.ip_address) : null,
    }));
    return {
      total: Number(counts[0]?.accounts ?? 0),
      activeSessions: Number(counts[0]?.active ?? 0),
      signInsLastDay: Number(counts[0]?.last_day ?? 0),
      recent,
    };
  } catch {
    // Auth tables missing (a fresh or partially migrated database) is a real
    // state, not an error worth failing the whole dashboard over.
    return empty;
  }
}

async function readActivity(): Promise<SystemDashboard["activity"]> {
  const sql = await getSql();
  const [audit, runs, site] = await Promise.all([
    sql<{ id: unknown; kind: unknown; title: unknown; actor: unknown; created_at: unknown }>`
      select id, kind, title, actor, created_at
      from audit_events
      order by created_at desc
      limit 12
    `.catch(() => []),
    sql<{
      id: unknown;
      agent_id: unknown;
      duty: unknown;
      status: unknown;
      duration_ms: unknown;
      started_at: unknown;
    }>`
      select id, agent_id, duty, status, duration_ms, started_at
      from agent_runs
      order by started_at desc
      limit 8
    `.catch(() => []),
    sql<{ kind: unknown; path: unknown; occurred_at: unknown }>`
      select kind, path, occurred_at
      from site_events
      order by occurred_at desc
      limit 8
    `.catch(() => []),
  ]);

  return {
    audit: audit.map((row) => ({
      id: text(row.id),
      kind: text(row.kind),
      title: text(row.title),
      actor: text(row.actor),
      createdAt: iso(row.created_at) ?? "",
    })),
    runs: runs.map((row) => ({
      id: text(row.id),
      agentId: text(row.agent_id),
      duty: text(row.duty),
      status: text(row.status),
      durationMs: Number(row.duration_ms ?? 0),
      startedAt: iso(row.started_at) ?? "",
    })),
    site: site.map((row) => ({
      kind: text(row.kind),
      path: text(row.path),
      occurredAt: iso(row.occurred_at) ?? "",
    })),
  };
}

export async function readSystemDashboard(): Promise<SystemDashboard> {
  const [health, users, activity] = await Promise.all([
    officeHealth(),
    readUsers(),
    readActivity().catch(() => ({ audit: [], runs: [], site: [] })),
  ]);

  return {
    checkedAt: new Date().toISOString(),
    runtime: {
      version: COMPANY.version,
      uptimeSeconds: Math.round(process.uptime()),
      database: dbSource,
      environment: process.env.NODE_ENV?.trim() || "development",
    },
    health: {
      ok: health.ok,
      halted: health.halted,
      haltReason: health.haltReason,
      problems: health.problems,
      database: {
        ok: health.database.ok,
        source: health.database.source,
        latencyMs: health.database.latencyMs,
      },
      chain: health.chain,
      scheduler: {
        autonomyEnabled: health.scheduler.autonomyEnabled,
        lastTickAt: health.scheduler.lastTickAt,
        minutesSinceTick: health.scheduler.minutesSinceTick,
        overdue: health.scheduler.overdue,
        consecutiveFailures: health.scheduler.consecutiveFailures,
        posture: health.scheduler.posture,
        budget: health.scheduler.budget,
        dutiesDue: health.scheduler.dutiesDue,
        duties: health.scheduler.duties,
      },
      queue: health.queue,
      mail: health.mail,
      rateCard: health.rateCard,
      delegation: {
        exists: health.delegation.exists,
        status: health.delegation.status,
        usedToday: health.delegation.usedToday,
        dailyActionCap: health.delegation.dailyActionCap,
        capExhausted: health.delegation.capExhausted,
      },
    },
    users,
    activity,
  };
}
