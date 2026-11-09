import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Activity, ArrowUpRight, Database, Radio, Users } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/office/empty-state";
import { PageHeader } from "@/components/office/page-header";
import { PrivateGate, PrivatePending } from "@/components/office/private-shell";
import { RunFloorButton } from "@/components/office/run-floor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, formatRelative } from "@/lib/office/money";
import { getOfficeSnapshot, getSystemDashboard } from "@/lib/office/api";
import type { SystemDashboard } from "@/lib/office/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [{ title: "System dashboard · Vantage-ARS" }, { name: "robots", content: "noindex" }],
  }),
  loader: async () => {
    const access = await getOfficeSnapshot();
    if (access.locked) return { access, dashboard: null };
    return { access, dashboard: await getSystemDashboard() };
  },
  component: DashboardRoute,
  pendingComponent: PrivatePending,
});

function DashboardRoute() {
  const { access, dashboard } = Route.useLoaderData();
  if (access.locked) return <PrivateGate />;
  return (
    <AppShell snapshot={access.snapshot}>
      <Dashboard data={dashboard} />
    </AppShell>
  );
}

/** "3d 4h" — coarse on purpose; nobody reads a system clock to the second. */
function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

type Check = {
  label: string;
  value: string;
  detail?: string;
  tone: "ok" | "warn" | "danger";
};

function checksFor(dashboard: SystemDashboard): Check[] {
  const { health } = dashboard;
  const { scheduler } = health;
  return [
    {
      label: "Database",
      value: health.database.ok ? "Reachable" : "Unavailable",
      detail: `${health.database.source} · ${health.database.latencyMs}ms`,
      tone: health.database.ok ? "ok" : "danger",
    },
    {
      label: "Audit chain",
      value: health.chain.ok ? "Verified" : "Broken",
      detail: health.chain.detail,
      tone: health.chain.ok ? "ok" : "danger",
    },
    {
      label: "Scheduler",
      value: !scheduler.autonomyEnabled
        ? "Manual only"
        : scheduler.overdue
          ? "Overdue"
          : "Ticking",
      detail: scheduler.lastTickAt
        ? `Last tick ${formatRelative(scheduler.lastTickAt)}`
        : "No tick recorded yet",
      tone: !scheduler.autonomyEnabled ? "warn" : scheduler.overdue ? "danger" : "ok",
    },
    {
      label: "Work queue",
      value: `${health.queue.open} open`,
      detail: `${health.queue.claimed} claimed · ${health.queue.abandoned} abandoned · ${health.queue.done} done`,
      tone: health.queue.abandoned > 0 ? "warn" : "ok",
    },
    {
      label: "Mail",
      value: health.mail.connected ? "Connected" : "Not connected",
      detail: health.mail.account ?? "Notices are recorded in the office only",
      tone: health.mail.connected ? "ok" : "warn",
    },
    {
      label: "Rate card",
      value: health.rateCard.ok ? "Current" : "Needs attention",
      detail: health.rateCard.detail,
      tone: health.rateCard.ok ? "ok" : "warn",
    },
    {
      label: "Office",
      value: health.halted ? "Halted" : "Live",
      detail: health.halted ? (health.haltReason ?? "No reason recorded") : "Agents may act",
      tone: health.halted ? "danger" : "ok",
    },
    {
      label: "Delegation",
      value: health.delegation.exists ? (health.delegation.status ?? "Set") : "None",
      detail: health.delegation.exists
        ? `${health.delegation.usedToday} of ${health.delegation.dailyActionCap} actions used today`
        : "Every gate stops for you",
      tone:
        health.delegation.capExhausted || !health.delegation.exists ? ("warn" as const) : ("ok" as const),
    },
  ];
}

function Dashboard({ data }: { data: SystemDashboard | null }) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  if (!data) return <EmptyState title="No readings" body="The dashboard could not be read." />;

  const { health, users, activity, runtime } = data;
  const checks = checksFor(data);

  async function refresh() {
    setRefreshing(true);
    try {
      await router.invalidate();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="enter-up mx-auto max-w-6xl">
      <PageHeader
        kicker="System · live records"
        title="Every signal, one screen."
        description="Health, the accounts that can open the office, and what actually happened — read from the office's own records, not summarised by hand."
        action={
          <Button type="button" variant="outline" onClick={refresh} aria-busy={refreshing}>
            {refreshing ? "Reading…" : "Refresh"}
          </Button>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="System"
          value={health.ok ? "Healthy" : "Attention"}
          hint={
            health.problems.length === 0
              ? "No problems reported"
              : `${health.problems.length} problem${health.problems.length === 1 ? "" : "s"}`
          }
          tone={health.ok ? "ok" : "danger"}
        />
        <Stat label="Uptime" value={formatUptime(runtime.uptimeSeconds)} hint={`v${runtime.version} · ${runtime.environment}`} />
        <Stat
          label="Active users"
          value={String(users.activeSessions)}
          hint={`${users.total} account${users.total === 1 ? "" : "s"} · ${users.signInsLastDay} sign-in${users.signInsLastDay === 1 ? "" : "s"} in 24h`}
        />
        <Stat
          label="Last tick"
          value={health.scheduler.lastTickAt ? formatRelative(health.scheduler.lastTickAt) : "Never"}
          hint={
            health.scheduler.autonomyEnabled
              ? `${health.scheduler.dutiesDue} of ${health.scheduler.duties} duties due`
              : "Unattended runs are off"
          }
          tone={health.scheduler.autonomyEnabled && !health.scheduler.overdue ? "ok" : "warn"}
        />
      </div>

      {health.problems.length > 0 ? (
        <Card className="mb-6 border border-warn/30">
          <CardHeader>
            <div>
              <CardTitle>What needs you</CardTitle>
              <CardDescription>Reported by the health check, in its own words.</CardDescription>
            </div>
          </CardHeader>
          <ul className="space-y-2 text-sm text-muted">
            {health.problems.map((problem) => (
              <li key={problem} className="rounded-lg bg-raised px-3 py-2">
                {problem}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Health checks</CardTitle>
              <CardDescription>
                A component that cannot prove itself is not reported as fine.
              </CardDescription>
            </div>
            <Activity aria-hidden="true" className="size-4 text-muted" />
          </CardHeader>
          <ul className="space-y-2">
            {checks.map((check) => (
              <li
                key={check.label}
                className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-raised px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm text-fg">{check.label}</p>
                  {check.detail ? (
                    <p className="mt-0.5 text-xs leading-relaxed text-muted">{check.detail}</p>
                  ) : null}
                </div>
                <Badge variant={check.tone === "ok" ? "ok" : check.tone === "warn" ? "warn" : "danger"}>
                  {check.value}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Autonomy</CardTitle>
              <CardDescription>
                The office runs on its own cadence; this is the proof it is running.
              </CardDescription>
            </div>
            <Radio aria-hidden="true" className="size-4 text-muted" />
          </CardHeader>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <Figure label="Unattended runs" value={health.scheduler.autonomyEnabled ? "On" : "Off"} />
            <Figure label="Posture" value={health.scheduler.posture} />
            <Figure label="Duties" value={`${health.scheduler.dutiesDue} due / ${health.scheduler.duties}`} />
            <Figure
              label="Failures in a row"
              value={String(health.scheduler.consecutiveFailures)}
            />
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            {health.scheduler.autonomyEnabled
              ? "Each scheduled tick plans the duties that are due, still through the constitutional gates."
              : "Set AUTONOMY=on with a CRON_SECRET to let the office tick by itself. Until then only the button runs it."}
          </p>
          <div className="mt-4">
            <RunFloorButton halted={health.halted} onDone={refresh} />
          </div>
        </Card>
      </div>

      <Card className="mb-6 p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <div>
            <CardTitle>Active users</CardTitle>
            <CardDescription>
              Sessions valid right now. Session tokens are never part of this reading.
            </CardDescription>
          </div>
          <Users aria-hidden="true" className="size-4 text-muted" />
        </div>
        {users.recent.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="Nobody signed in"
              body="A session appears here the moment a founder or invited identity opens the office."
            />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-xs uppercase tracking-[0.14em] text-muted">
                <tr className="border-b border-border">
                  <th className="px-5 py-3 font-medium">Account</th>
                  <th className="px-5 py-3 font-medium">Signed in</th>
                  <th className="px-5 py-3 font-medium">Expires</th>
                  <th className="hidden px-5 py-3 font-medium md:table-cell">Client</th>
                </tr>
              </thead>
              <tbody>
                {users.recent.map((session) => (
                  <tr key={`${session.email}-${session.signedInAt}`} className="border-b border-border last:border-0">
                    <td className="px-5 py-3">
                      <span className="block text-fg">{session.email || "No email"}</span>
                      {session.name ? (
                        <span className="block text-xs text-muted">{session.name}</span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs">{formatDateTime(session.signedInAt)}</td>
                    <td className="px-5 py-3 font-mono text-xs">
                      {session.expiresAt ? formatRelative(session.expiresAt) : "—"}
                    </td>
                    <td className="hidden px-5 py-3 text-xs text-muted md:table-cell">
                      <span className="block max-w-[18rem] truncate" title={session.userAgent ?? ""}>
                        {session.ipAddress ?? "No address"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <section className="mb-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-serif text-2xl text-fg">Recent application activity</h2>
            <p className="mt-1 text-sm text-muted">
              The audit chain first, then the agents' own runs and real site traffic.
            </p>
          </div>
          <Badge variant="default">{runtime.database}</Badge>
        </div>

        {activity.audit.length === 0 ? (
          <EmptyState
            title="Nothing recorded yet"
            body="Opening the office writes the genesis event, and every action after it adds one."
          />
        ) : (
          <ol className="space-y-2">
            {activity.audit.map((event) => (
              <li key={event.id} className="rounded-xl bg-surface px-4 py-3 shadow-[var(--shadow-border)]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-fg">{event.title}</p>
                  <Badge>{event.kind.replaceAll("_", " ")}</Badge>
                </div>
                <p className="mt-1 font-mono text-[11px] text-subtle">
                  {event.actor} · {formatDateTime(event.createdAt)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Agent runs</CardTitle>
              <CardDescription>The last duties the floor actually executed.</CardDescription>
            </div>
          </CardHeader>
          {activity.runs.length === 0 ? (
            <p className="text-sm text-muted">No run has been recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {activity.runs.map((run) => (
                <li key={run.id} className="rounded-lg bg-raised px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-fg">{run.duty.replaceAll("_", " ")}</span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                      {run.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {run.agentId} · {formatRelative(run.startedAt)} · {(run.durationMs / 1000).toFixed(1)}s
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Site visitors</CardTitle>
              <CardDescription>Real page views the public site recorded.</CardDescription>
            </div>
            <ArrowUpRight aria-hidden="true" className="size-4 text-muted" />
          </CardHeader>
          {activity.site.length === 0 ? (
            <p className="text-sm text-muted">No visit has been recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {activity.site.map((event, index) => (
                <li
                  key={`${event.path}-${event.occurredAt}-${index}`}
                  className="flex items-center justify-between gap-2 rounded-lg bg-raised px-3 py-2"
                >
                  <span className="min-w-0 truncate font-mono text-xs text-fg">{event.path}</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted">
                    {formatRelative(event.occurredAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <p className="mt-6 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-subtle">
        <Database aria-hidden="true" className="size-3" />
        Read {formatDateTime(data.checkedAt)} · {runtime.database}
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "ok" | "warn" | "danger";
}) {
  return (
    <Card className="p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">{label}</p>
      <p
        className={cn(
          "mt-2 font-serif text-2xl",
          tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "text-fg",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{hint}</p>
    </Card>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-raised px-3 py-2">
      <dt className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted">{label}</dt>
      <dd className="mt-1 font-mono text-xs text-fg capitalize">{value}</dd>
    </div>
  );
}
