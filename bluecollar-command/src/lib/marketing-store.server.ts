// Planner state is stored in PostgreSQL on Railway. SQLite remains a local fallback.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import type { AnalyticsRecommendation, BrandId, Campaign, Comment, SocialPost } from "./types";

export interface AgentSessionLike {
  executionId: string;
  brandId: BrandId;
  turns: { role: "user" | "assistant"; content: string; createdAt: string }[];
  draftPostId?: string;
  createdAt: string;
}

export interface Delivery {
  state: "pending" | "complete" | "failed" | "uncertain";
  fingerprint: string;
  remoteId?: string;
  status?: import("./types").PostStatus;
}

export interface Store {
  deliveries: Record<string, Delivery>;
  accountBrands: Record<string, BrandId>;
  brandProfiles: Partial<Record<BrandId, { audience: string; tone: string; businessDetails: string; defaultCta: string; avoid: string }>>;
  posts: SocialPost[];
  campaigns: Campaign[];
  comments: Comment[];
  sessions: Map<string, AgentSessionLike>;
  recommendations: AnalyticsRecommendation[];
}


let database: DatabaseSync | undefined;
let pool: pg.Pool | undefined;
let postgresReady: Promise<void> | undefined;

function postgres(): pg.Pool {
  if (!pool) {
    const connectionString = process.env["DATABASE_URL"];
    if (!connectionString) throw new Error("DATABASE_URL is required for PostgreSQL storage.");
    pool = new pg.Pool({ connectionString, max: 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000, allowExitOnIdle: true });
  }
  return pool;
}

async function preparePostgres(): Promise<void> {
  if (!postgresReady) {
    postgresReady = postgres().query("CREATE TABLE IF NOT EXISTS planner_state (id INTEGER PRIMARY KEY CHECK (id = 1), data JSONB NOT NULL)")
      .then(() => undefined)
      .catch(error => { postgresReady = undefined; throw error; });
  }
  await postgresReady;
}

function emptyStore(): Store {
  return { deliveries: {}, accountBrands: {}, brandProfiles: {}, posts: [], campaigns: [], comments: [], sessions: new Map(), recommendations: [] };
}

function parseStore(raw: unknown): Store {
  if (!raw) return emptyStore();
  const data = typeof raw === "string" ? JSON.parse(raw) : raw as Record<string, unknown>;
  for (const key of ["posts", "campaigns", "comments", "sessions", "recommendations"]) {
    if (!Array.isArray(data[key])) throw new Error(`Planner database contains invalid ${key}; restore a backup.`);
  }
  const value = data as Record<string, any>;
  return { ...value, deliveries: value["deliveries"] || {}, accountBrands: value["accountBrands"] || {}, brandProfiles: value["brandProfiles"] || {}, sessions: new Map(value["sessions"]) } as Store;
}

function serializeStore(state: Store): string {
  return JSON.stringify({ ...state, sessions: [...state.sessions] });
}
function db(): DatabaseSync {
  if (database) return database;
  const directory = resolve(process.env["PLANNER_DATA_DIR"] || ".data");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, "planner.sqlite");
  const opened = new DatabaseSync(path);
  opened.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;");
  opened.exec("CREATE TABLE IF NOT EXISTS planner_state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)");
  chmodSync(path, 0o600);
  database = opened;
  return opened;
}

export async function store(): Promise<Store> {
  if (process.env["DATABASE_URL"]) {
    await preparePostgres();
    const result = await postgres().query<{ data: unknown }>("SELECT data FROM planner_state WHERE id = 1");
    return parseStore(result.rows[0]?.data);
  }
  const row = db().prepare("SELECT data FROM planner_state WHERE id=1").get() as { data: string } | undefined;
  return parseStore(row?.data);
}

/** Mutations are synchronous and transactional; failed writes never alter the stored state. */
export async function updateStore<T>(mutate: (state: Store) => T): Promise<T> {
  if (process.env["DATABASE_URL"]) {
    await preparePostgres();
    const client = await postgres().connect();
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO planner_state (id, data) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING", [serializeStore(emptyStore())]);
      const row = await client.query<{ data: unknown }>("SELECT data FROM planner_state WHERE id = 1 FOR UPDATE");
      const state = parseStore(row.rows[0]?.data);
      const result = mutate(state);
      if (result instanceof Promise) throw new Error("Planner transactions must be synchronous.");
      await client.query("UPDATE planner_state SET data = $1::jsonb WHERE id = 1", [serializeStore(state)]);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  const database = db();
  database.exec("BEGIN IMMEDIATE");
  try {
    const row = database.prepare("SELECT data FROM planner_state WHERE id=1").get() as { data: string } | undefined;
    const state = parseStore(row?.data);
    const result = mutate(state);
    if (result instanceof Promise) throw new Error("Planner transactions must be synchronous");
    const serialized = serializeStore(state);
    database.prepare("INSERT INTO planner_state(id, data) VALUES(1, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(serialized);
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function uid(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}
