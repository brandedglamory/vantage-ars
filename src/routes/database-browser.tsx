import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Database, Download, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/office/empty-state";
import { PageHeader } from "@/components/office/page-header";
import { PrivateGate, PrivatePending } from "@/components/office/private-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  deleteDatabaseRecord,
  getOfficeSnapshot,
  listDatabaseTables,
  readDatabaseTable,
} from "@/lib/office/api";
import type {
  DatabaseCell,
  DatabaseRecordPage,
  DatabaseTableSummary,
} from "@/lib/office/types";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

/** One completed read, tagged with the request it answers. */
type Loaded = { key: string; page: DatabaseRecordPage | null; error: string };

export const Route = createFileRoute("/database-browser")({
  head: () => ({
    meta: [
      { title: "Database browser · Vantage-ARS" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: async () => {
    const access = await getOfficeSnapshot();
    if (access.locked) return { access, tables: [] as DatabaseTableSummary[] };
    const { tables } = await listDatabaseTables();
    return { access, tables };
  },
  component: DatabaseBrowserRoute,
  pendingComponent: PrivatePending,
});

function DatabaseBrowserRoute() {
  const { access, tables } = Route.useLoaderData();
  if (access.locked) return <PrivateGate />;
  return (
    <AppShell snapshot={access.snapshot}>
      <Browser tables={tables} halted={access.snapshot.company.halted} />
    </AppShell>
  );
}

/** The first table that holds something, so the page opens on real records. */
function firstTable(tables: DatabaseTableSummary[]): string {
  return (tables.find((table) => table.rows > 0) ?? tables[0])?.name ?? "";
}

function Browser({ tables: initialTables, halted }: { tables: DatabaseTableSummary[]; halted: boolean }) {
  const [tables, setTables] = useState(initialTables);
  const [selected, setSelected] = useState(() => firstTable(initialTables));
  const [term, setTerm] = useState("");
  const [applied, setApplied] = useState("");
  const [offset, setOffset] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [pulse, setPulse] = useState(0);
  const [openRow, setOpenRow] = useState<Record<string, DatabaseCell> | null>(null);
  const [deleting, setDeleting] = useState(false);

  const summary = tables.find((table) => table.name === selected);

  // Everything the page shows is derived from the request that is current now,
  // so switching tables can never paint the previous table's records.
  const requestKey = `${selected}|${offset}|${applied}|${pulse}`;
  const current = loaded && loaded.key === requestKey ? loaded : null;
  const page = current?.page ?? null;
  const error = current?.error ?? "";
  const loading = Boolean(selected) && current === null;

  const reloadCounts = useCallback(async () => {
    try {
      const { tables: fresh } = await listDatabaseTables();
      setTables(fresh);
    } catch {
      // A stale count is a cosmetic problem; the records below are what matter.
    }
  }, []);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    const key = `${selected}|${offset}|${applied}|${pulse}`;
    readDatabaseTable({ data: { table: selected, limit: PAGE_SIZE, offset, q: applied } })
      .then((result) => {
        if (!cancelled) setLoaded({ key, page: result, error: "" });
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setLoaded({
            key,
            page: null,
            error: reason instanceof Error ? reason.message : "That table could not be read.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selected, offset, applied, pulse]);

  function choose(table: string) {
    setSelected(table);
    setOffset(0);
    setApplied("");
    setTerm("");
    setOpenRow(null);
  }

  function search(event: React.FormEvent) {
    event.preventDefault();
    setOffset(0);
    setApplied(term.trim());
  }

  async function remove(row: Record<string, DatabaseCell>) {
    if (!page?.primaryKey) return;
    const id = row[page.primaryKey];
    if (id === null || id === undefined) {
      toast.error("This record has no primary key value to identify it by.");
      return;
    }
    setDeleting(true);
    try {
      const result = await deleteDatabaseRecord({ data: { table: selected, id: String(id) } });
      if (!result.deleted) {
        toast.error("That record was already gone.");
      } else {
        toast.success("Record deleted. The deletion is written into the audit chain.");
      }
      setOpenRow(null);
      if (offset > 0 && rows.length === 1) setOffset(Math.max(0, offset - PAGE_SIZE));
      setPulse((value) => value + 1);
      void reloadCounts();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "The record could not be deleted.");
    } finally {
      setDeleting(false);
    }
  }

  const columns = page?.columns ?? [];
  const rows = page?.rows ?? [];
  const from = page && page.total > 0 ? page.offset + 1 : 0;
  const to = page ? Math.min(page.offset + rows.length, page.total) : 0;

  return (
    <div className="enter-up mx-auto max-w-6xl">
      <PageHeader
        kicker="System · read the record"
        title="The database, in the open."
        description="Every table the office keeps, the records inside them, and a single-record delete that always leaves a mark in the audit chain. Append-only tables are read-only here on purpose."
        action={<Badge variant={halted ? "warn" : "ok"}>{halted ? "Office halted" : "Office live"}</Badge>}
      />

      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <Card className="p-3">
          <div className="mb-3 flex items-center justify-between gap-2 px-2 pt-1">
            <CardTitle className="text-base">Tables</CardTitle>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              {tables.length}
            </span>
          </div>

          <div className="lg:hidden">
            <Select value={selected} onChange={(event) => choose(event.target.value)} aria-label="Table">
              {tables.map((table) => (
                <option key={table.name} value={table.name}>
                  {table.name} ({table.rows})
                </option>
              ))}
            </Select>
          </div>

          <ul className="hidden max-h-[65vh] space-y-1 overflow-y-auto lg:block">
            {tables.map((table) => {
              const active = table.name === selected;
              return (
                <li key={table.name}>
                  <button
                    type="button"
                    onClick={() => choose(table.name)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors",
                      active ? "bg-accent/10 text-accent" : "text-muted hover:bg-raised hover:text-fg",
                    )}
                  >
                    <span className="min-w-0 truncate font-mono text-xs">{table.name}</span>
                    <span className="shrink-0 font-mono text-[10px] tabular-nums">{table.rows}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        <div className="min-w-0 space-y-4">
          <Card className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-mono text-xs text-fg">
                  <Database aria-hidden="true" className="size-3.5 text-accent" />
                  <span className="truncate">{selected || "No tables"}</span>
                </p>
                <p className="mt-1 text-xs text-muted">
                  {summary
                    ? `${summary.rows.toLocaleString("en-ZA")} record${summary.rows === 1 ? "" : "s"} · ${summary.columns} column${summary.columns === 1 ? "" : "s"}`
                    : "Choose a table"}
                  {page?.primaryKey ? ` · key ${page.primaryKey}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {summary?.readOnlyReason ? <Badge variant="warn">Read-only</Badge> : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={rows.length === 0}
                  onClick={() => downloadCsv(`${selected}.csv`, toCsv(columns, rows))}
                >
                  <span className="flex items-center gap-2">
                    <Download aria-hidden="true" className="size-3.5" />
                    CSV
                  </span>
                </Button>
              </div>
            </div>

            {summary?.readOnlyReason ? (
              <p className="mt-3 rounded-lg bg-raised px-3 py-2 text-xs leading-relaxed text-muted">
                {summary.readOnlyReason}
              </p>
            ) : null}

            <form onSubmit={search} className="mt-3 flex gap-2">
              <Input
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Search every column…"
                aria-label="Search records"
                className="h-10"
              />
              <Button type="submit" variant="secondary" size="sm" aria-label="Search">
                <Search aria-hidden="true" className="size-4" />
              </Button>
            </form>
          </Card>

          {error ? (
            <Card className="border border-danger/30 text-sm text-danger">{error}</Card>
          ) : loading && !page ? (
            <Card className="text-sm text-muted">Reading records…</Card>
          ) : !page || rows.length === 0 ? (
            <EmptyState
              title={applied ? "No match" : "No records"}
              body={
                applied
                  ? `Nothing in ${selected} contains “${applied}”.`
                  : `${selected} is empty. Records appear here as the office writes them.`
              }
            />
          ) : (
            <Card className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className={cn("w-full text-sm", loading && "opacity-60")}>
                  <caption className="sr-only">
                    {page.total} records in {selected}, showing {from} to {to}.
                  </caption>
                  <thead className="text-left text-xs uppercase tracking-[0.14em] text-muted">
                    <tr className="border-b border-border">
                      {columns.map((column) => (
                        <th key={column.name} className="whitespace-nowrap px-3 py-2.5 font-medium">
                          {column.name}
                          {column.primaryKey ? <span className="ml-1 text-accent">•</span> : null}
                        </th>
                      ))}
                      <th className="px-3 py-2.5 font-medium">
                        <span className="sr-only">Record actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr
                        key={page.primaryKey ? String(row[page.primaryKey]) : `${offset}-${index}`}
                        className="border-b border-border last:border-0"
                      >
                        {columns.map((column) => {
                          const value = row[column.name];
                          return (
                            <td key={column.name} className="px-3 py-2 align-top">
                              <span
                                className={cn(
                                  "block max-w-[16rem] truncate font-mono text-xs",
                                  value === null ? "text-subtle" : "text-fg",
                                )}
                                title={value === null ? "null" : String(value)}
                              >
                                {value === null ? "null" : String(value)}
                              </span>
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setOpenRow(row)}
                            aria-label={`Open record ${page.primaryKey ? String(row[page.primaryKey]) : index + 1}`}
                          >
                            Open
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs text-muted">
                <span className="font-mono tabular-nums">
                  {from}–{to} of {page.total.toLocaleString("en-ZA")}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={offset === 0 || loading}
                    onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  >
                    <span className="flex items-center gap-1">
                      <ChevronLeft aria-hidden="true" className="size-3.5" />
                      Prev
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={offset + PAGE_SIZE >= page.total || loading}
                    onClick={() => setOffset(offset + PAGE_SIZE)}
                  >
                    <span className="flex items-center gap-1">
                      Next
                      <ChevronRight aria-hidden="true" className="size-3.5" />
                    </span>
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={openRow !== null} onOpenChange={(open) => (open ? undefined : setOpenRow(null))}>
        <DialogContent>
          <DialogTitle>Record</DialogTitle>
          <DialogDescription>
            {page?.primaryKey && openRow
              ? `${selected} · ${page.primaryKey} ${String(openRow[page.primaryKey])}`
              : selected}
          </DialogDescription>
          <pre className="mt-4 max-h-[45vh] overflow-auto rounded-lg bg-raised p-3 font-mono text-[11px] leading-relaxed text-fg">
            {openRow ? JSON.stringify(openRow, null, 2) : ""}
          </pre>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-sm text-xs leading-relaxed text-muted">
              A delete is written into the audit chain against the founder.
            </p>
            {page?.readOnlyReason ? (
              <Badge variant="warn">Read-only</Badge>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={deleting}
                aria-busy={deleting}
                onClick={() => openRow && void remove(openRow)}
                className="border-danger/30 text-danger hover:bg-danger/5"
              >
                <span className="flex items-center gap-2">
                  <Trash2 aria-hidden="true" className="size-3.5" />
                  {deleting ? "Deleting…" : "Delete record"}
                </span>
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function escapeCell(value: DatabaseCell): string {
  const text = value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function toCsv(columns: DatabaseRecordPage["columns"], rows: Record<string, DatabaseCell>[]): string {
  const header = columns.map((column) => escapeCell(column.name)).join(",");
  const body = rows.map((row) =>
    columns.map((column) => escapeCell(row[column.name] ?? null)).join(","),
  );
  return [header, ...body].join("\n");
}

function downloadCsv(filename: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
