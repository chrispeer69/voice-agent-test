// Durable single-instance planner storage. Mount PLANNER_DATA_DIR on a Railway volume.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
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
  agentSnapshots: Partial<Record<BrandId, { name: string; description: string; tools: string[]; knowledgeBaseIds: string[]; syncedAt: string }>>;
  posts: SocialPost[];
  campaigns: Campaign[];
  comments: Comment[];
  sessions: Map<string, AgentSessionLike>;
  recommendations: AnalyticsRecommendation[];
}


let database: DatabaseSync | undefined;
function db(): DatabaseSync {
  if (database) return database;
  const directory = resolve(process.env.PLANNER_DATA_DIR || ".data");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, "planner.sqlite");
  const opened = new DatabaseSync(path);
  opened.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;");
  opened.exec("CREATE TABLE IF NOT EXISTS planner_state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)");
  chmodSync(path, 0o600);
  database = opened;
  return opened;
}

export function store(): Store {
  const row = db().prepare("SELECT data FROM planner_state WHERE id=1").get() as { data: string } | undefined;
  if (!row) return { deliveries: {}, accountBrands: {}, brandProfiles: {}, agentSnapshots: {}, posts: [], campaigns: [], comments: [], sessions: new Map(), recommendations: [] };
  const data = JSON.parse(row.data);
  for (const key of ["posts", "campaigns", "comments", "sessions", "recommendations"]) {
    if (!Array.isArray(data[key])) throw new Error(`Planner database contains invalid ${key}; restore a backup.`);
  }
  return { ...data, deliveries: data.deliveries || {}, accountBrands: data.accountBrands || {}, brandProfiles: data.brandProfiles || {}, agentSnapshots: data.agentSnapshots || {}, sessions: new Map(data.sessions) };
}

/** Mutations are synchronous and transactional; failed writes never alter the stored state. */
export function updateStore<T>(mutate: (state: Store) => T): T {
  const database = db();
  database.exec("BEGIN IMMEDIATE");
  try {
    const state = store();
    const result = mutate(state);
    if (result instanceof Promise) throw new Error("Planner transactions must be synchronous");
    const serialized = JSON.stringify({ ...state, sessions: [...state.sessions] });
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
