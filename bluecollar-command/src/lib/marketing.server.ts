import { buildPostPayload, normalizePostStatus, parsePostWriteResponse } from "./social-post-contract";
import { ghlFetch } from "./ghl-client.server";
// Server-only API helpers for the Blue Collar AI Marketing Command Center.
// All social-planner API calls live here. Agent Studio execution + media
// generation live in ./agent.server.ts (they need the "v3" Version header and
// a different endpoint path). Client code never imports this file directly —
// it goes through the thin wrappers in *.functions.ts. Every exported helper
// requires an authenticated session.

import type {
  AnalyticsSummary,
  Approver,
  Brand,
  BrandId,
  Campaign,
  CampaignObjective,
  Comment,
  ContentFormat,
  Platform,
  PostStatus,
  PostType,
  PublishResult,
  SocialAccount,
  SocialPost,
} from "./types";
import { getBrand, mapPlatform } from "./types";
import { requireSession } from "./auth.server";
import { store, updateStore, uid, type AgentSessionLike } from "./marketing-store.server";
// Agent execution + media generation (uses the v3 Agent Studio API).
export { runAgentTurn, generateMedia, type AgentAttachment } from "./agent.server";
import type { AgentAttachment } from "./agent.server";

const GHL_API_BASE = "https://services.leadconnectorhq.com";

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

function ghlHeaders(token: string, extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${token}`,
    Version: "v3",
    "Content-Type": "application/json",
    Accept: "application/json",
    ...extra,
  };
}

/**
 * Fetch connected social accounts from the social planner Get Accounts API.
 * Tries the known endpoint variants, parses flexibly, and returns the real
 * error string (status + body) when the API fails — never silently returns [].
 */
export async function fetchSocialAccounts(): Promise<{
  accounts: SocialAccount[];
  error?: string;
}> {
  await requireSession();
  const token = ghlToken();
  const locationId = ghlLocationId();
  const headers = ghlHeaders(token);
  const endpoints = [`/social-media-posting/${encodeURIComponent(locationId)}/accounts`];
  let lastError = "No endpoint variant returned accounts.";
  for (const ep of endpoints) {
    try {
      const res = await ghlFetch(`${GHL_API_BASE}${ep}`, { headers });
      const text = await res.text();
      if (!res.ok) {
        lastError = `${ep} → ${res.status}: ${text.slice(0, 300)}`;
        console.error("[social-accounts]", lastError);
        continue;
      }
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        lastError = `${ep} → non-JSON response: ${text.slice(0, 300)}`;
        console.error("[social-accounts]", lastError);
        continue;
      }
      const raw = extractAccountsArray(data);
      if (raw.length === 0) {
        return { accounts: [] };
      }
      const out: SocialAccount[] = [];
      for (const a of raw) {
        const obj = a as Record<string, unknown>;
        if (obj.deleted === true || obj.active === false) continue;
        const type = String(obj.platform ?? obj.socialType ?? obj.type ?? obj.network ?? "");
        const mapped = mapPlatform(type);
        if (!mapped) continue;
        out.push({
          id: String(obj.id ?? obj._id ?? ""),
          originId: obj.originId ? String(obj.originId) : undefined,
          profileId: obj.profileId ? String(obj.profileId) : undefined,
          platform: mapped,
          account: String(obj.name ?? obj.username ?? obj.accountName ?? obj.displayName ?? mapped),
          profileImageUrl: obj.profilePictureUrl
            ? String(obj.profilePictureUrl)
            : obj.picture
              ? String(obj.picture)
              : obj.avatar
                ? String(obj.avatar)
                : obj.profileImageUrl
                  ? String(obj.profileImageUrl)
                  : undefined,
        });
      }
      if (out.length === 0) {
        lastError = `${ep} → 200 but no mappable platforms. Raw: ${text.slice(0, 300)}`;
        console.error("[social-accounts]", lastError);
        continue;
      }
      return { accounts: out };
    } catch (e) {
      lastError = `${ep} → ${e instanceof Error ? e.message : String(e)}`;
      console.error("[social-accounts]", lastError);
    }
  }
  return { accounts: [], error: lastError };
}

/** Extract an accounts array from any plausible response shape. */
function extractAccountsArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.accounts)) return obj.accounts;
    if (obj.results && typeof obj.results === "object") {
      const r = obj.results as Record<string, unknown>;
      if (Array.isArray(r.accounts)) return r.accounts;
      if (Array.isArray(r)) return r;
    }
    if (Array.isArray(obj.data)) return obj.data;
    if (obj.data && typeof obj.data === "object") {
      const d = obj.data as Record<string, unknown>;
      if (Array.isArray(d.accounts)) return d.accounts;
    }
  }
  return [];
}

/** Cache of connected accounts (per request) for platform derivation. */
let _accountsCache: { accounts: SocialAccount[]; expires: number } | null = null;
async function accountsCache(): Promise<SocialAccount[]> {
  if (_accountsCache && _accountsCache.expires > Date.now()) return _accountsCache.accounts;
  const { accounts, error } = await fetchSocialAccounts();
  if (error) throw new Error(error);
  _accountsCache = { accounts, expires: Date.now() + 30_000 };
  return accounts;
}

/**
 * The Social Planner create-post API requires the id of the GHL user who is
 * creating the post (not just the location). Load it once from the users
 * endpoint and cache it for the request so every per-account create/schedule
 * call includes a valid `userId`.
 */
let _ghlUserIdCache: string | null = null;
async function ghlUserId(): Promise<string> {
  if (_ghlUserIdCache) return _ghlUserIdCache;
  const token = ghlToken();
  const locationId = ghlLocationId();
  const res = await ghlFetch(`${GHL_API_BASE}/users/?locationId=${locationId}`, {
    headers: ghlHeaders(token, { Version: "2021-07-28" }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Could not load a GHL user for the location to create Social Planner posts (${res.status}): ${body.slice(0, 120)}`,
    );
  }
  const data = (await res.json()) as { users?: Array<{ id?: string }> };
  const first = (data.users ?? []).find((u) => u && u.id);
  if (!first?.id) {
    throw new Error("No GHL user found for this location — cannot create Social Planner posts.");
  }
  _ghlUserIdCache = first.id;
  return _ghlUserIdCache;
}

/** Load valid approvers from HighLevel users for the location. */
export async function fetchApprovers(): Promise<Approver[]> {
  await requireSession();
  const token = ghlToken();
  const locationId = ghlLocationId();
  try {
    const res = await ghlFetch(`${GHL_API_BASE}/users/?locationId=${locationId}`, {
      headers: ghlHeaders(token, { Version: "2021-07-28" }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { users?: unknown[] };
    const users = Array.isArray(data.users) ? data.users : [];
    return users.map((u) => {
      const obj = u as Record<string, unknown>;
      return {
        id: String(obj.id ?? ""),
        name: String((obj.name ?? `${obj.firstName ?? ""} ${obj.lastName ?? ""}`.trim()) || "User"),
        email: String(obj.email ?? ""),
      };
    });
  } catch {
    return [];
  }
}

/** Persist each account's GHL write outcome before proceeding. Draft writes never publish to social accounts. */
async function createPostForAccounts(post: SocialPost, status: "draft" | "scheduled" | "published"): Promise<PublishResult[]> {
  if (!post.accountIds.length) throw new Error("Select at least one connected social account.");
  const accts = await accountsCache();
  const userId = await ghlUserId();
  const results: PublishResult[] = [];
  for (const accountId of [...new Set(post.accountIds)]) {
    const acct = accts.find(a => a.id === accountId);
    if (!acct) throw new Error("A selected account is no longer connected. Refresh the account selection.");
    const platform = acct.platform;
    const key = `${post.id}:${accountId}`;
    let reserved = false;
    try {
      const payload = buildPostPayload(post, accountId, platform, status, userId);
      const fingerprint = JSON.stringify(payload);
      const previous = updateStore(s => {
        const prior = s.deliveries[key];
        if (prior?.state === "pending" || prior?.state === "uncertain") {
          throw new Error("A previous request is pending or its outcome is unknown. Check this post in GHL before retrying.");
        }
        if (prior?.state === "complete" && prior.fingerprint === fingerprint) return prior;
        if (prior?.status === "published") throw new Error("This post has already been published. Create a new draft for new content.");
        const remoteId = prior?.remoteId || post.publishResults?.find(r => r.accountId === accountId && r.ghlPostId)?.ghlPostId || post.ghlPostId;
        s.deliveries[key] = { state: "pending", fingerprint, ...(remoteId ? { remoteId } : {}) };
        return s.deliveries[key];
      });
      if (previous.state === "complete") {
        results.push({ accountId, platform, ok: true, ghlPostId: previous.remoteId, status: previous.status });
        continue;
      }
      reserved = true;
      const base = `${GHL_API_BASE}/social-media-posting/${encodeURIComponent(ghlLocationId())}/posts`;
      const response = await ghlFetch(previous.remoteId ? `${base}/${encodeURIComponent(previous.remoteId)}` : base, {
        method: previous.remoteId ? "PUT" : "POST",
        headers: ghlHeaders(ghlToken()), body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.text();
        updateStore(s => { s.deliveries[key]!.state = response.status >= 500 ? "uncertain" : "failed"; });
        reserved = false;
        throw new Error(`GHL ${response.status}: ${body.slice(0, 200)}`);
      }
      const written = parsePostWriteResponse(await response.json());
      updateStore(s => { s.deliveries[key] = { state: "complete", fingerprint, remoteId: written.id, status: written.status }; });
      reserved = false;
      results.push({ accountId, platform, ok: true, ghlPostId: written.id, status: written.status });
    } catch (error) {
      if (reserved) updateStore(s => { s.deliveries[key]!.state = "uncertain"; });
      results.push({ accountId, platform, ok: false, error: error instanceof Error ? error.message : "GHL request failed" });
    }
  }
  return results;
}

export async function publishPostViaGhl(post: SocialPost): Promise<PublishResult[]> {
  await requireSession();
  return createPostForAccounts(post, "published");
}

export async function syncDraftToGhl(post: SocialPost): Promise<SocialPost> {
  await requireSession();
  const saved = await savePost({ ...post, status: 'draft' });
  if (!saved.accountIds.length) return saved;
  const results = await createPostForAccounts(saved, 'draft');
  return savePost({ ...saved, publishResults: results });
}

export async function schedulePostViaGhl(post: SocialPost): Promise<PublishResult[]> {
  await requireSession();
  return createPostForAccounts(post, "scheduled");
}

/**
 * Fetch live posts (draft / in-review / scheduled / published / failed) from
 * the social planner — the source of truth for social posts. Maps each raw
 * GHL post into a normalized SocialPost with the right status, platforms, and
 * accountIds. Returns [] only when the API returns no posts; surfaces a
 * thrown error to the caller otherwise (never silently fails).
 */
export async function fetchGhlPosts(): Promise<SocialPost[]> {
  await requireSession();
  const token = ghlToken();
  const locationId = ghlLocationId();
  const raw: Record<string, any>[] = [];
  const seen = new Set<string>();
  for (let skip = 0; ; skip += 100) {
    const res = await ghlFetch(`${GHL_API_BASE}/social-media-posting/${encodeURIComponent(locationId)}/posts/list`, {
      method: "POST", headers: ghlHeaders(token),
      body: JSON.stringify({ type: "all", limit: "100", skip: String(skip) }),
    });
    if (!res.ok) throw new Error(`Social Planner posts fetch failed (${res.status}). Check the token's socialplanner/post.readonly permission.`);
    const data = await res.json();
    if (data.success === false || !Array.isArray(data.results?.posts)) throw new Error("GHL returned an invalid post list.");
    const page = data.results.posts;
    for (const post of page) {
      const id = String(post._id ?? post.id ?? "");
      if (id && !seen.has(id) && !post.deleted) { seen.add(id); raw.push(post); }
    }
    if (page.length < 100 || skip + page.length >= Number(data.results.count)) break;
    if (skip >= 9900) throw new Error("More than 10,000 posts returned. Narrow the import date range before continuing.");
  }
  if (!raw.length) return [];

  const accts = await accountsCache();
  const localState = store();
  const out: SocialPost[] = [];
  for (const item of raw) {
    const p = item as Record<string, unknown>;
    const ghlId = String(p._id ?? p.id ?? "");
    if (!ghlId) continue;
    const status = normalizePostStatus(p.status ?? p.postStatus);
    const accountIds = Array.isArray(p.accountIds)
      ? p.accountIds.map(String)
      : p.accountId ? [String(p.accountId)] : [];
    const linked = localState.posts.find(local => local.ghlPostId === ghlId || local.publishResults?.some(r => r.ghlPostId === ghlId || r.ghlPostId === p.parentPostId));
    const mappedBrands = [...new Set(accountIds.map(id => localState.accountBrands[id]).filter(Boolean))];
    const brandId = linked?.brandId ?? (p.brandId === "convini" || p.brandId === "ustow" ? p.brandId : mappedBrands.length === 1 ? mappedBrands[0] : undefined);
    const platforms = accountIds
      .map((id) => accts.find((a) => a.id === id)?.platform)
      .filter((x): x is Platform => !!x);
    const scheduledAt = p.scheduleDate
      ? String(p.scheduleDate)
      : p.scheduledAt
        ? String(p.scheduledAt)
        : undefined;
    const publishedAt = p.publishedAt
      ? String(p.publishedAt)
      : undefined;
    const iso = scheduledAt ?? publishedAt ?? new Date().toISOString();
    out.push({
      id: `ghl_${ghlId}`,
      brandId: brandId ?? "convini",
      brandUnassigned: !brandId,
      campaignId: p.campaignId ? String(p.campaignId) : null,
      type: (p.type as PostType) ?? "custom",
      accountIds,
      platforms,
      objective: (p.objective as CampaignObjective) ?? "awareness",
      format: (p.format as ContentFormat) ?? "text",
      title: linked?.title ?? String(p.title ?? p.name ?? (String(p.summary || "").slice(0, 70) || `Post ${ghlId.slice(0, 6)}`)),
      body: String(p.summary ?? p.body ?? p.caption ?? ""),
      offer: p.offer ? String(p.offer) : undefined,
      cta: p.cta ? String(p.cta) : undefined,
      media: Array.isArray(p.media)
        ? (p.media as Array<Record<string, unknown>>).map((m) => ({
            id: String(m.id ?? `ghl_media_${Math.random().toString(36).slice(2, 8)}`),
            url: String(m.url ?? ""),
            type: String(m.type ?? "image").includes("video") ? "video" : "image",
          }))
        : [],
      commentToDm: false,
      status,
      scheduledAt,
      publishedAt,
      ghlPostId: ghlId,
      ghlParentPostId: p.parentPostId ? String(p.parentPostId) : undefined,
      createdAt: String(p.createdAt ?? iso),
      updatedAt: String(p.updatedAt ?? iso),
    });
  }
  return out;
}

/** Retrieve GHL comments with numeric pagination (unlike post-list pagination). */
async function readComments(platform: Platform, parentId?: string): Promise<Record<string, any>[]> {
  const out: Record<string, any>[] = [];
  const originIds = (await accountsCache()).filter(a => a.platform === platform && a.originId).map(a => a.originId!);
  if (!originIds.length) return [];
  for (let skip = 0; ; skip += 100) {
    const res = await ghlFetch(`${GHL_API_BASE}/social-media-posting/comments/${platform}/list?locationId=${encodeURIComponent(ghlLocationId())}`, {
      method: "POST", headers: ghlHeaders(ghlToken()),
      body: JSON.stringify({ originIds, skip, limit: 100, sortBy: "latest", ...(parentId ? { parentId } : {}) }),
    });
    if (!res.ok) throw new Error(`GHL comments failed (${res.status}). Check socialplanner/comments.readonly permission.`);
    const data = await res.json();
    if (!Array.isArray(data.results?.comments)) throw new Error("GHL returned an invalid comment list.");
    out.push(...data.results.comments.filter((c: any) => !c.isDeleted && !c.isPost));
    if (!data.results.meta?.hasMore || data.results.comments.length < 100) break;
    if (skip >= 9900) throw new Error("Too many comments to load. Narrow the selected post.");
  }
  return out;
}

export async function fetchGhlComments(postId: string): Promise<Partial<Comment>[]> {
  await requireSession();
  const post = await getPost(postId.startsWith("ghl_") ? postId : `ghl_${postId}`);
  if (!post) throw new Error("Post not found.");
  const platform = post.platforms[0];
  if (!platform || !["facebook", "instagram", "linkedin"].includes(platform)) return [];
  return (await readComments(platform, post.ghlPostId)).map(c => ({
    id: String(c._id), postId: post.id, brandId: post.brandId, platform,
    author: String(c.author?.name || "Unknown author"), text: String(c.content || ""),
    createdAt: String(c.publishedAt || c.createdAt), isDmTriggered: false,
  }));
}

export async function replyGhlComment(commentId: string, text: string, platform: Platform): Promise<{ ok: boolean; error?: string }> {
  await requireSession();
  const res = await ghlFetch(`${GHL_API_BASE}/social-media-posting/comments/${platform}?locationId=${encodeURIComponent(ghlLocationId())}`, {
    method: "POST", headers: ghlHeaders(ghlToken()),
    body: JSON.stringify({ parentId: commentId, isParentThread: false, content: text }),
  });
  if (!res.ok) return { ok: false, error: `GHL reply failed (${res.status}).` };
  const result = await res.json();
  return result.success === false ? { ok: false, error: String(result.message || "GHL rejected the reply.") } : { ok: true };
}

/** GHL's default reporting window is the last seven complete days. */
export async function fetchGhlStats(brandId?: BrandId): Promise<AnalyticsSummary[]> {
  await requireSession();
  const accounts = await accountsCache();
  const assignments = store().accountBrands;
  const out: AnalyticsSummary[] = [];
  for (const brand of (brandId ? [brandId] : ["convini", "ustow"]) as BrandId[]) {
    const selected = accounts.filter(a => assignments[a.id] === brand && a.profileId);
    if (!selected.length) continue;
    const res = await ghlFetch(`${GHL_API_BASE}/social-media-posting/statistics?locationId=${encodeURIComponent(ghlLocationId())}`, {
      method: "POST", headers: ghlHeaders(ghlToken()), body: JSON.stringify({ profileIds: selected.map(a => a.profileId) }),
    });
    if (!res.ok) throw new Error(`GHL statistics failed (${res.status}). Check socialplanner/statistics.readonly permission.`);
    const data = (await res.json()).results;
    if (!data?.breakdowns) throw new Error("GHL returned an invalid statistics response.");
    for (const platform of [...new Set(selected.map(a => a.platform))]) {
      const engagement = data.breakdowns.engagement?.[platform] || {};
      out.push({ brandId: brand, platform,
        reach: Number(data.breakdowns.reach?.platforms?.[platform]?.value || 0),
        engagement: Number(engagement.likes || 0) + Number(engagement.comments || 0) + Number(engagement.shares || 0),
        comments: Number(engagement.comments || 0), clicks: 0,
        publishedCount: Number(data.breakdowns.posts?.platforms?.[platform]?.value || 0), scheduledCount: 0, draftCount: 0,
      });
    }
  }
  return out;
}

// Keep the AgentAttachment type reachable for existing importers.
export type { AgentAttachment };

/**
 * Frame a brand-agent turn with a concise output directive so it returns a
 * single ready-to-publish caption instead of a conversational brand-card Q&A.
 *
 * Asks the agent to respond with a JSON object `{"title": "...", "body": "..."}`
 * so the caption never gets mixed with the prompt instructions or
 * conversational chatter. The caller extracts the JSON with
 * `parseStructuredCaption` and validates with `validateCaption`.
 */
export function frameCaptionPrompt(brandId: BrandId, instruction: string): string {
  const brandName = brandId === "convini" ? "Convini" : brandId === "ustow" ? "US Tow AI Connect" : "the selected agent's configured business";
  return (
    `Write one ready-to-publish social media post for ${brandName}. ` +
    `Respond with ONLY a JSON object in this exact format:\n` +
    `{"title": "short headline", "body": "the full caption text"}\n` +
    `Do not include any other text, questions, options, or preamble outside the JSON. ` +
    `Do not ask which accounts to post to. ` +
    `Use only the details provided below; do not invent unrelated offers or services. ` +
    `Also generate one matching visual image using your image tool. ` +
    `Details: ${instruction}`
  );
}

// Caption cleaning extracted to a focused module (caption-clean.server.ts) so
// the logic is testable and not duplicated. The cleaner strips the brand
// agent's conversational brand-card tables, clarifying questions, and
// preambles while preserving the real caption copy, hashtags, emoji, and
// marketing hooks that use "?".
export { cleanCaption, isChatter } from "./caption-clean.server";
export { parseStructuredCaption, validateCaption } from "./caption-clean.server";

// ---- Store accessors (all session-gated) -----------------------------------

export async function listPosts(brandId?: BrandId): Promise<SocialPost[]> {
  await requireSession();
  const s = store();
  const local = brandId ? s.posts.filter((p) => p.brandId === brandId) : s.posts;
  const accts = await accountsCache();

  // Merge live Social Planner posts (source of truth) with local in-app drafts.
  // Live posts are keyed `ghl_<id>`; local drafts that haven't been pushed to
  // the planner yet are kept. A local draft with a matching ghlPostId is
  // superseded by its live counterpart.
  let live = await fetchGhlPosts();
  if (brandId) live = live.filter(p => !p.brandUnassigned && p.brandId === brandId);
  const liveGhlIds = new Set(live.flatMap(p => [p.ghlPostId, p.ghlParentPostId]).filter(Boolean));
  const localOnly = local.filter(p => !p.ghlPostId && !p.publishResults?.some(r => r.ghlPostId && liveGhlIds.has(r.ghlPostId)) || !!p.publishResults?.some(r => !r.ok));

  const merged = [...live, ...localOnly];
  return merged.map((p) => ({
    ...p,
    platforms: p.platforms.length
      ? p.platforms
      : p.accountIds
          .map((id) => accts.find((a) => a.id === id)?.platform)
          .filter((x): x is Platform => !!x),
  }));
}

export async function getPost(id: string): Promise<SocialPost | undefined> {
  await requireSession();
  const p = store().posts.find((x) => x.id === id) ?? (id.startsWith("ghl_") ? (await fetchGhlPosts()).find(x => x.id === id) : undefined);
  if (!p) return undefined;
  const accts = await accountsCache();
  return {
    ...p,
    platforms: p.platforms.length
      ? p.platforms
      : p.accountIds
          .map((id) => accts.find((a) => a.id === id)?.platform)
          .filter((x): x is Platform => !!x),
  };
}

export async function savePost(post: SocialPost): Promise<SocialPost> {
  await requireSession();
  const accts = await accountsCache();
  const platforms = post.accountIds
    .map((id) => accts.find((a) => a.id === id)?.platform)
    .filter((x): x is Platform => !!x);
  const normalized = { ...post, platforms: platforms.length ? platforms : post.platforms };
  const updated = { ...normalized, updatedAt: new Date().toISOString() };
  updateStore(s => {
    const idx = s.posts.findIndex(p => p.id === updated.id);
    if (idx >= 0) s.posts[idx] = updated;
    else s.posts.push({ ...updated, createdAt: updated.createdAt || updated.updatedAt });
  });
  return updated;
}

export async function deletePost(id: string): Promise<boolean> {
  await requireSession();
  const remoteId = id.startsWith('ghl_') ? id.slice(4) : undefined;
  const local = store().posts.find(p => p.id === id || (remoteId && (p.ghlPostId === remoteId || p.publishResults?.some(r => r.ghlPostId === remoteId))));
  const post = remoteId ? await getPost(id) : local;
  if (!post || post.status !== 'draft') return false;
  const remoteIds = [...new Set([local?.ghlPostId, ...((local?.publishResults ?? []).map(r => r.ghlPostId)), remoteId].filter((value): value is string => Boolean(value)))];
  for (const ghlId of remoteIds) {
    const response = await ghlFetch(`${GHL_API_BASE}/social-media-posting/${encodeURIComponent(ghlLocationId())}/posts/${encodeURIComponent(ghlId)}`, { method: 'DELETE', headers: ghlHeaders(ghlToken()) });
    if (!response.ok) throw new Error(`GHL could not discard the draft (${response.status}).`);
    const body = await response.json();
    if (body?.success === false) throw new Error('GHL did not confirm that the draft was discarded.');
  }
  if (local) updateStore(s => { s.posts = s.posts.filter(p => p.id !== local.id); for (const key of Object.keys(s.deliveries)) if (key.startsWith(`${local.id}:`)) delete s.deliveries[key]; });
  return true;
}

export async function listCampaigns(brandId?: BrandId): Promise<Campaign[]> {
  await requireSession();
  const s = store();
  return brandId ? s.campaigns.filter((c) => c.brandId === brandId) : s.campaigns;
}

export async function saveCampaign(campaign: Campaign): Promise<Campaign> {
  await requireSession();
  updateStore(s => {
    const idx = s.campaigns.findIndex(c => c.id === campaign.id);
    if (idx >= 0) s.campaigns[idx] = campaign;
    else s.campaigns.push(campaign);
  });
  return campaign;
}

export async function listComments(brandId?: BrandId, platform?: Platform): Promise<Comment[]> {
  await requireSession();
  const posts = (await fetchGhlPosts()).filter(p => !brandId || (!p.brandUnassigned && p.brandId === brandId));
  const platforms = [...new Set(posts.flatMap(p => p.platforms))].filter(p => (!platform || p === platform) && ["facebook", "instagram", "linkedin"].includes(p));
  const local = store().comments;
  const out: Comment[] = [];
  for (const network of platforms) {
    const rows = await readComments(network);
    for (const c of rows) {
      const post = posts.find(p => p.ghlPostId === c.postId || p.ghlParentPostId === c.postId);
      if (!post) continue;
      const saved = local.find(x => x.id === c._id);
      out.push({ ...saved, id: String(c._id), postId: post.id, brandId: post.brandId, platform: network,
        author: String(c.author?.name || "Unknown author"), text: String(c.content || ""),
        createdAt: String(c.publishedAt || c.createdAt), isDmTriggered: false });
    }
  }
  return out;
}

export async function saveComment(comment: Comment): Promise<Comment> {
  await requireSession();
  updateStore(s => {
    const idx = s.comments.findIndex(c => c.id === comment.id);
    if (idx >= 0) s.comments[idx] = comment;
    else s.comments.push(comment);
  });
  return comment;
}

export async function getSession(executionId: string): Promise<AgentSessionLike | undefined> {
  await requireSession();
  return store().sessions.get(executionId);
}

export async function saveSession(session: AgentSessionLike): Promise<AgentSessionLike> {
  await requireSession();
  updateStore(s => { s.sessions.set(session.executionId, session); });
  return session;
}

export async function listRecommendations(
  brandId?: BrandId,
): Promise<import("./types").AnalyticsRecommendation[]> {
  await requireSession();
  const s = store();
  return brandId ? s.recommendations.filter((r) => r.brandId === brandId) : s.recommendations;
}

export async function testAgentExecution(brandId: BrandId): Promise<{
  ok: boolean;
  reply?: string;
  error?: string;
  executionId?: string;
}> {
  await requireSession();
  const res = await runAgentTurn(
    brandId,
    "Hello! Please reply in one brief sentence confirming you are active and ready to create posts.",
  );
  return {
    ok: !res.error && Boolean(res.reply),
    reply: res.reply,
    error: res.error,
    executionId: res.executionId,
  };
}

export function brandFor(brandId: BrandId): Brand {
  return getBrand(brandId);
}

export { uid };
