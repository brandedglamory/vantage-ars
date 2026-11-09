/**
 * The database browser's data access — server only.
 *
 * A founder tool, and deliberately a narrow one. It can list the office's
 * tables, page through their records, and delete a single record by primary
 * key. It cannot create records (every write in this office belongs to a
 * governed action with an audit trail) and it cannot touch a table whose rows
 * are the record-keeping itself.
 *
 * Safety properties:
 *   - The table name is checked against `information_schema` before it is ever
 *     interpolated, so a caller cannot reach a table that does not exist.
 *   - Values are always parameterised; identifiers are quoted, never trusted.
 *   - Every delete is written into the audit chain, so the browser leaves the
 *     same kind of trace every other action does.
 */
import { getSql, type Sql } from "@/lib/db";
import { appendAudit, ensureOffice } from "./store.server";
import type {
  DatabaseCell,
  DatabaseColumn,
  DatabaseRecordPage,
  DatabaseTableSummary,
} from "./types";

/** The most rows the browser will ever hand to a page in one read. */
const MAX_LIMIT = 100;

/** How many columns a free-text search looks at before giving up. */
const MAX_SEARCH_COLUMNS = 12;

/**
 * Tables the browser refuses to delete from, and why. These rows ARE the
 * record: removing one breaks a hash chain, a money figure, or the sign-in
 * that opens the office.
 */
const READ_ONLY: Record<string, string> = {
  _migrations:
    "Migration bookkeeping. Deleting a row would make the migrator re-run that file against a schema that already has it.",
  audit_events:
    "The audit chain is append-only. Every record hashes the one before it, so deleting one breaks the proof for everything after it.",
  decisions:
    "Decision records are the constitutional trace of what the office authorised. They are append-only.",
  ledger_entries: "The ledger is the money record. It is append-only by design.",
  company_state: "The company row is provisioned and maintained by the office, not by hand.",
  constitution_provisions: "The constitution is versioned and immutable once published.",
  user: "Identity records belong to the sign-in service. Deleting one here would lock the office.",
  session: "Identity records belong to the sign-in service. Use sign-out instead.",
  account: "Identity records belong to the sign-in service.",
  verification: "Identity records belong to the sign-in service.",
};

function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

async function tableNames(sql: Sql): Promise<string[]> {
  const rows = await sql<{ name: string }>`
    select table_name as name
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by table_name
  `;
  return rows.map((row) => String(row.name));
}

/** Resolve a caller-supplied table name to a table that really exists. */
async function requireTable(sql: Sql, requested: string): Promise<string> {
  const names = await tableNames(sql);
  const match = names.find((name) => name === requested);
  if (!match) throw new Error(`There is no table called "${requested}".`);
  return match;
}

async function columnsOf(sql: Sql, table: string): Promise<DatabaseColumn[]> {
  const rows = await sql.query<{
    column_name: unknown;
    data_type: unknown;
    is_nullable: unknown;
    is_key: unknown;
  }>(
    `select c.column_name, c.data_type, c.is_nullable,
            exists (
              select 1
              from information_schema.table_constraints tc
              join information_schema.key_column_usage kcu
                on kcu.constraint_name = tc.constraint_name
               and kcu.table_schema = tc.table_schema
               and kcu.table_name = tc.table_name
              where tc.constraint_type = 'PRIMARY KEY'
                and tc.table_schema = 'public'
                and tc.table_name = c.table_name
                and kcu.column_name = c.column_name
            ) as is_key
     from information_schema.columns c
     where c.table_schema = 'public' and c.table_name = $1
     order by c.ordinal_position`,
    [table],
  );
  return rows.map((row) => ({
    name: String(row.column_name),
    dataType: String(row.data_type),
    nullable: String(row.is_nullable).toUpperCase() === "YES",
    primaryKey: row.is_key === true || String(row.is_key) === "true",
  }));
}

function primaryKeyOf(columns: DatabaseColumn[]): string | null {
  return columns.find((column) => column.primaryKey)?.name ?? null;
}

/** Normalise whatever the driver returned into a JSON-safe cell. */
function cell(value: unknown): DatabaseCell {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export async function listDatabaseTables(): Promise<DatabaseTableSummary[]> {
  const sql = await getSql();
  const names = await tableNames(sql);
  const columnCounts = await sql.query<{ table_name: unknown; n: unknown }>(
    `select table_name, count(*)::int as n
     from information_schema.columns
     where table_schema = 'public'
     group by table_name`,
  );
  const columnsByTable = new Map(
    columnCounts.map((row) => [String(row.table_name), Number(row.n ?? 0)]),
  );

  // Sequential on purpose: PGLite is one connection, so parallel counts would
  // only queue behind each other while a partial list is already usable.
  const tables: DatabaseTableSummary[] = [];
  for (const name of names) {
    const counted = await sql.query<{ n: unknown }>(
      `select count(*)::int as n from ${quoteIdent(name)}`,
    );
    tables.push({
      name,
      rows: Number(counted[0]?.n ?? 0),
      columns: columnsByTable.get(name) ?? 0,
      readOnlyReason: READ_ONLY[name] ?? null,
    });
  }
  return tables;
}

export type ReadTableInput = {
  table: string;
  limit: number;
  offset: number;
  q: string;
};

export async function readDatabaseTable(input: ReadTableInput): Promise<DatabaseRecordPage> {
  const sql = await getSql();
  const table = await requireTable(sql, input.table);
  const columns = await columnsOf(sql, table);
  const primaryKey = primaryKeyOf(columns);
  const limit = Math.max(1, Math.min(Math.trunc(input.limit) || 25, MAX_LIMIT));
  const offset = Math.max(0, Math.trunc(input.offset) || 0);

  const search = input.q.trim();
  const searchable = columns
    .filter((column) => column.dataType !== "bytea")
    .slice(0, MAX_SEARCH_COLUMNS);
  const where =
    search && searchable.length > 0
      ? `where (${searchable.map((column) => `${quoteIdent(column.name)}::text ilike $1`).join(" or ")})`
      : "";
  const params = where ? [`%${search}%`] : [];

  // Newest-first when the table records time, otherwise by primary key, so a
  // page of records has a stable, explicable order.
  const timed = columns.find(
    (column) => column.name === "created_at" || column.name === "occurred_at",
  );
  const order = timed
    ? `order by ${quoteIdent(timed.name)} desc nulls last`
    : primaryKey
      ? `order by ${quoteIdent(primaryKey)} asc`
      : "";

  const ident = quoteIdent(table);
  const [rows, counted] = await Promise.all([
    sql.query<Record<string, unknown>>(
      `select * from ${ident} ${where} ${order} limit ${limit} offset ${offset}`,
      params,
    ),
    sql.query<{ n: unknown }>(`select count(*)::int as n from ${ident} ${where}`, params),
  ]);

  return {
    table,
    columns,
    primaryKey,
    rows: rows.map((row) => {
      const shaped: Record<string, DatabaseCell> = {};
      for (const column of columns) shaped[column.name] = cell(row[column.name]);
      return shaped;
    }),
    total: Number(counted[0]?.n ?? 0),
    limit,
    offset,
    readOnlyReason: READ_ONLY[table] ?? null,
  };
}

export type DeleteRecordInput = { table: string; id: string };

export async function deleteDatabaseRecord(
  input: DeleteRecordInput,
): Promise<{ deleted: boolean }> {
  const sql = await getSql();
  const table = await requireTable(sql, input.table);
  const reason = READ_ONLY[table];
  if (reason) throw new Error(reason);

  const columns = await columnsOf(sql, table);
  const primaryKey = primaryKeyOf(columns);
  if (!primaryKey) {
    throw new Error(`"${table}" has no primary key, so a single record cannot be identified.`);
  }

  // The delete is chained, so the office (and its audit head) must exist before
  // the row goes. Idempotent, and already true on any serving instance.
  await ensureOffice();

  const deleted = await sql.query<Record<string, unknown>>(
    `delete from ${quoteIdent(table)} where ${quoteIdent(primaryKey)} = $1 returning ${quoteIdent(primaryKey)}`,
    [input.id],
  );
  if (deleted.length === 0) return { deleted: false };

  await appendAudit(
    "database_record_deleted",
    `Record deleted from ${table}`,
    `Primary key ${input.id} was deleted from ${table} through the database browser.`,
    "founder",
  );
  return { deleted: true };
}
