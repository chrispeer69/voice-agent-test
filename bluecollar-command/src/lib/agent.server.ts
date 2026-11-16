import { ghlFetch } from "./ghl-client.server";
// Server-only Managed Agents + Agent Studio execution.
// Uses the official Managed Agents API:
//   POST /agent-studio/managed-agents/:managedAgentId/execute
//   Headers: Version: "v3", Idempotency-Key: <uuid>
//   Body: { locationId, message, sessionId? }
//   Response: { success, agentId, sessionId, finalText, toolsFired[], generatedMedia[] }
// Falls back gracefully to deprecated Flow Agent endpoints if an agent is not managed.
// Extracts REAL generated images from `generatedMedia` (type="image", url).
// Session-gated; client code never imports this directly.

import type { BrandId } from "./types";
import { requireSession } from "./auth.server";

const GHL_API_BASE = "https://services.leadconnectorhq.com";
const MAX_RETRIES = 2;

function ghlToken(): string {
  const token = process.env.GHL_PRIVATE_INTEGRATION_TOKEN;
  if (!token) throw new Error("GHL_PRIVATE_INTEGRATION_TOKEN is not configured");
  return token;
}

function ghlLocationId(): string {
  const id = process.env.GHL_LOCATION_ID;
  if (!id) throw new Error("GHL_LOCATION_ID is not configured");
  return id;
}

function agentIdFor(brandId: BrandId): string | null {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(brandId)) return brandId;
  if (brandId !== "convini" && brandId !== "ustow") return null;
  const key = brandId === "convini" ? "CONVINI_AGENT_ID" : "USTOW_AGENT_ID";
  const id = process.env[key];
  return id || null;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface GeneratedMediaAsset {
  type?: string; // "image" | "video"
  url?: string;
  mimeType?: string;
  toolName?: string;
  toolCallId?: string;
}

export interface AgentAttachment {
  type?: string;
  url?: string;
  mimeType?: string;
}

export interface AgentTurnResult {
  executionId: string; // sessionId for Managed Agents
  reply: string;
  error?: string;
  generatedMedia?: GeneratedMediaAsset[];
  attachments?: AgentAttachment[];
}

interface ManagedAgentResponse {
  success?: boolean;
  agentId?: string;
  sessionId?: string;
  finalText?: string;
  toolsFired?: string[];
  generatedMedia?: GeneratedMediaAsset[];
  // Legacy / fallback fields
  executionId?: string;
  response?: string;
  reply?: string;
  message?: string;
  output?: string;
  attachments?: AgentAttachment[];
  generativeOutputs?: unknown[];
}

/** A single Agent Studio endpoint variant. */
interface EndpointVariant {
  name: string;
  url: string;
  version: string;
  buildBody: (message: string, sid?: string) => object;
}

/**
 * Cache of the endpoint that last succeeded. Once we know which variant works
 * for this agent/token, subsequent calls skip the probe and go straight to it —
 * saving 2 wasted HTTP round-trips per call (critical for batch generation).
 */
const cachedEndpoints = new Map<string, string>();

function buildEndpoints(agentId: string, locationId: string): EndpointVariant[] {
  return [
    {
      name: "Managed Agent Execute",
      url: `${GHL_API_BASE}/agent-studio/managed-agents/${agentId}/execute`,
      version: "v3",
      buildBody: (message, sid) => ({ locationId, message, sessionId: sid || undefined }),
    },
    {
      name: "Agent Studio Execute",
      url: `${GHL_API_BASE}/agent-studio/agent/${agentId}/execute`,
      version: "v3",
      buildBody: (message, sid) => ({ locationId, message, executionId: sid || undefined }),
    },
    {
      name: "Public API Agent Execute",
      url: `${GHL_API_BASE}/agent-studio/public-api/agents/${agentId}/execute`,
      version: "v3",
      buildBody: (message, sid) => ({ locationId, message, executionId: sid || undefined }),
    },
  ];
}

/**
 * Call a single endpoint with retry+backoff on rate-limit (429) and server
 * errors (5xx). Auth errors (401/403) are returned immediately without retry.
 */
async function callEndpoint(
  ep: EndpointVariant,
  token: string,
  message: string,
  sid?: string,
  fast = false,
): Promise<{ ok: boolean; status: number; text: string }> {
  const idempotencyKey = `turn-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const body = JSON.stringify(ep.buildBody(message, sid));

  let lastStatus = 0;
  let lastText = "";

  const maxRetries = fast ? 0 : MAX_RETRIES;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await ghlFetch(ep.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Version: ep.version,
          "Idempotency-Key": idempotencyKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body,
        ...(fast ? { signal: AbortSignal.timeout(30_000) } : {}),
      });
      const text = await res.text();
      lastStatus = res.status;
      lastText = text;

      if (res.ok) return { ok: true, status: res.status, text };

      // Retry on rate-limit or transient server errors
      if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
        const backoff = 1500 * (attempt + 1);
        console.warn(
          `[Agent] ${ep.name} ${res.status}, retry ${attempt + 1}/${MAX_RETRIES} after ${backoff}ms`,
        );
        await delay(backoff);
        continue;
      }
      return { ok: false, status: res.status, text };
    } catch (err) {
      lastText = err instanceof Error ? err.message : String(err);
      if (attempt < maxRetries) {
        const backoff = 1500 * (attempt + 1);
        console.warn(`[Agent] ${ep.name} network error, retry after ${backoff}ms: ${lastText}`);
        await delay(backoff);
        continue;
      }
      return { ok: false, status: 0, text: lastText };
    }
  }
  return { ok: false, status: lastStatus, text: lastText };
}

/**
 * Execute an agent turn using the official Managed Agents API v3:
 *   POST /agent-studio/managed-agents/:managedAgentId/execute
 *   Headers: Version: "v3", Idempotency-Key: <key>
 *   Body: { locationId, message, sessionId? }
 *
 * If the agent is not a Managed Agent, falls back to standard Flow Agent endpoints.
 */
export async function runAgentTurn(
  brandId: BrandId,
  message: string,
  previousSessionId?: string,
  fast = false,
): Promise<AgentTurnResult> {
  await requireSession();
  const agentId = agentIdFor(brandId);
  if (!agentId) {
    return {
      executionId: previousSessionId || "",
      reply: "",
      error: `Agent ID for ${brandId} is not configured in secrets.`,
    };
  }

  const token = ghlToken();
  const locationId = ghlLocationId();
  if (brandId !== "convini" && brandId !== "ustow") {
    const check = await fetch(`${GHL_API_BASE}/agent-studio/managed-agents/${encodeURIComponent(agentId)}?locationId=${encodeURIComponent(locationId)}`, {
      headers: { Authorization: `Bearer ${token}`, Version: "v3", Accept: "application/json" },
    });
    if (!check.ok) return { executionId: previousSessionId || "", reply: "", error: "This agent is not published for the current GHL subaccount. Refresh the agent list after publishing it." };
  }
  const endpoints = buildEndpoints(agentId, locationId);

  // Always try Managed Agent Execute endpoint first
  const cachedName = cachedEndpoints.get(agentId);
  const order = [...endpoints].sort((a, b) => Number(b.name === cachedName) - Number(a.name === cachedName));

  let lastError = "";

  for (const ep of order) {
    console.log(`[Agent Turn] Trying ${ep.name}: POST ${ep.url}`);
    const result = await callEndpoint(ep, token, message, previousSessionId, fast);

    if (result.ok) {
      cachedEndpoints.set(agentId, ep.name); // cache the winner
      let data: ManagedAgentResponse = {};
      try {
        data = JSON.parse(result.text);
      } catch {
        data = { response: result.text };
      }

      const replyText = (
        data.finalText ??
        data.response ??
        data.reply ??
        data.output ??
        data.message ??
        ""
      ).trim();

      const execId = data.sessionId ?? data.executionId ?? previousSessionId ?? "";
      const media = Array.isArray(data.generatedMedia)
        ? data.generatedMedia
        : Array.isArray(data.attachments)
          ? data.attachments.map((a) => ({ url: a.url, type: a.type }))
          : [];

      console.log(
        `[Agent Turn SUCCESS via ${ep.name}] replyLength=${replyText.length} mediaCount=${media.length}`,
      );
      return {
        executionId: execId,
        reply: replyText,
        generatedMedia: media,
        error: data.success === false ? "Agent turn marked unsuccessful by provider." : undefined,
      };
    }

    const body = result.text.slice(0, 300);
    lastError = `${ep.name} HTTP ${result.status}: ${body}`;
    console.warn(`[Agent Turn Failed] ${lastError}`);

    // If the error explicitly indicates this is a Managed Agent or an Auth/Scope error,
    // do NOT fall through to incompatible endpoints (which pollute error logs with misleading 400s).
    if (
      result.status === 401 ||
      result.status === 403 ||
      body.includes("is a Managed Agent") ||
      ep.name === "Managed Agent Execute"
    ) {
      // If Managed Agent Execute itself failed with a non-200 (e.g. 400/401/403/404/422/500),
      // that is the authoritative error for this agent. Stop probing fallback endpoints.
      break;
    }
  }

  // Detect token-scope or authorization failure
  const isScopeError =
    /HTTP 401/.test(lastError) || /HTTP 403/.test(lastError) || /scope/i.test(lastError);
  const scopeMessage =
    "Agent authorization failed (HTTP 401/403). Your Private Integration Token is missing permissions. " +
    "In your CRM → Settings → Developer → Private Integrations → edit your Integration:\n" +
    '• Under "AI Agent Studio", enable "AI Agent Studio" read + write permissions\n' +
    '• Under "Social Planner", enable "Social Planner" read + write permissions\n' +
    "Then click Save and retry. No content or images can be generated until these permissions are enabled.";

  return {
    executionId: previousSessionId || "",
    reply: "",
    error: isScopeError ? scopeMessage : `Agent execution failed: ${lastError}`,
  };
}

/**
 * Combined turn: ask the agent for BOTH the caption and the image in a single
 * call. This halves the number of API requests vs separate caption+image calls
 * (critical for batch generation to stay under rate limits). Returns the raw
 * reply text (caller cleans it) and the extracted media URL.
 */
export async function runCombinedTurn(
  brandId: BrandId,
  prompt: string,
  previousSessionId?: string,
): Promise<{
  executionId: string;
  reply: string;
  mediaUrl?: string;
  error?: string;
}> {
  const result = await runAgentTurn(brandId, prompt, previousSessionId);

  let mediaUrl: string | undefined;

  // 1) Extract from official Managed Agent `generatedMedia`
  for (const m of result.generatedMedia ?? []) {
    const url = m.url && /^https?:\/\//.test(m.url) ? m.url : undefined;
    if (url) {
      mediaUrl = url;
      break;
    }
  }

  // 2) Extract from legacy attachments if present
  if (!mediaUrl) {
    for (const a of result.attachments ?? []) {
      const url = a.url && /^https?:\/\//.test(a.url) ? a.url : undefined;
      if (url) {
        mediaUrl = url;
        break;
      }
    }
  }

  // 3) Scan text reply for a direct image URL
  if (!mediaUrl && result.reply) {
    const urlRegex = /https?:\/\/[^\s"'<>]+\.(?:png|jpg|jpeg|webp|gif)/i;
    const m = result.reply.match(urlRegex);
    if (m) mediaUrl = m[0];
  }

  return {
    executionId: result.executionId,
    reply: result.reply,
    mediaUrl,
    error: result.error,
  };
}

/**
 * Generate a visual for a social post using the Managed Agent.
 * Used for individual re-prompting (Create Content + BatchPostCard).
 * Captures the resulting image URL from `generatedMedia`.
 * NO silent fallback — returns the real error when generation fails.
 */
export async function generateMedia(
  brandId: BrandId,
  prompt: string,
  type: "image" | "video",
  previousSessionId?: string,
): Promise<{ executionId: string; mediaUrl?: string; reply: string; error?: string }> {
  const agentMessage =
    `Generate a high-quality ${type} visual for this social media post.\n` +
    `Visual direction: ${prompt}.\n` +
    `Use your ${type === 'video' ? 'video' : 'image'} generation tool to produce the visual asset now. Return the generated media file.`;

  const result = await runAgentTurn(brandId, agentMessage, previousSessionId);

  let mediaUrl: string | undefined;

  for (const m of result.generatedMedia ?? []) {
    const url = m.url && /^https?:\/\//.test(m.url) ? m.url : undefined;
    if (url && (type === 'image' || m.type?.toLowerCase().includes('video') || /\.(mp4|mov|webm)(?:\?|$)/i.test(url))) {
      mediaUrl = url;
      break;
    }
  }

  if (!mediaUrl) {
    for (const a of result.attachments ?? []) {
      const url = a.url && /^https?:\/\//.test(a.url) ? a.url : undefined;
      if (url && (type === 'image' || a.type?.toLowerCase().includes('video') || /\.(mp4|mov|webm)(?:\?|$)/i.test(url))) {
        mediaUrl = url;
        break;
      }
    }
  }

  if (!mediaUrl && result.reply) {
    const urlRegex = type === 'video' ? /https?:\/\/[^\s"'<>]+\.(?:mp4|mov|webm)/i : /https?:\/\/[^\s"'<>]+\.(?:png|jpg|jpeg|webp|gif)/i;
    const m = result.reply.match(urlRegex);
    if (m) mediaUrl = m[0];
  }

  const error = result.error
    ? `${type === 'video' ? 'Video' : 'Image'} generation failed: ${result.error}`
    : mediaUrl
      ? undefined
      : `The agent did not return a generated ${type}. Check its ${type} generation capability in GHL Agent Studio.`;

  return {
    executionId: result.executionId,
    mediaUrl,
    reply: result.reply,
    error,
  };
}
