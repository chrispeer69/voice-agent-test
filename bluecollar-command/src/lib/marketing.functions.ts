// Thin server-function wrappers for the marketing command center.
// Client code imports these — they are replaced with RPC stubs in the bundle.
// All runtime helpers live in ./marketing.server.ts. Every wrapper is
// session-gated through requireSession() inside the helpers.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type {
  BrandId,
  Campaign,
  CampaignObjective,
  Comment,
  Platform,
  PublishResult,
  SocialPost,
} from "./types";
import {
  cleanCaption,
  publishPostViaGhl,
  deletePost as deletePostStore,
  fetchApprovers,
  fetchGhlComments,
  fetchGhlPosts,
  fetchGhlStats,
  fetchSocialAccounts,
  frameCaptionPrompt,
  generateMedia,
  getPost,
  listCampaigns,
  listComments,
  listPosts,
  listRecommendations,
  parseStructuredCaption,
  replyGhlComment,
  runAgentTurn,
  saveCampaign,
  saveComment,
  savePost,
  saveSession,
  schedulePostViaGhl,
  syncDraftToGhl,
  getSession,
  testAgentExecution,
  uid,
  validateCaption,
} from "./marketing.server";
import { requireSession } from "./auth.server";
import { store, updateStore } from "./marketing-store.server";
import { buildBatchPosts, regenerateBatchPost } from "./batch.server";
import { ghlFetch } from "./ghl-client.server";
import { generateWritingAssist, getSavedAgentDetails } from "./anthropic-assist.server";

const brandIdSchema = z.union([z.enum(["convini", "ustow"]), z.uuid()]);

/** One fast Agent Studio turn for idea suggestions and brief expansion. */
export const assistPostPrompt = createServerFn({ method: "POST" })
  .validator((data: { brandId: BrandId; mode: "idea" | "improve"; context: "single" | "batch"; input: string; previousIdeas: string[] }) => z.object({
    brandId: brandIdSchema,
    mode: z.enum(["idea", "improve"]),
    context: z.enum(["single", "batch"]),
    input: z.string().max(1500),
    previousIdeas: z.array(z.string().max(250)).max(8),
  }).parse(data))
  .handler(async ({ data }) => {
    await requireSession();
    return generateWritingAssist(data);
  });

export const getAvailableAgents = createServerFn({ method: "GET" }).handler(async () => {
  await requireSession();
  const locationId = process.env["GHL_LOCATION_ID"];
  const token = process.env["GHL_PRIVATE_INTEGRATION_TOKEN"];
  if (!locationId || !token) throw new Error("GHL agent connection is not configured.");
  const headers = { Authorization: `Bearer ${token}`, Version: "v3", Accept: "application/json" };
  const base = "https://services.leadconnectorhq.com/agent-studio/managed-agents";
  const agents: Array<{ id: string; brandId: BrandId; name: string; description: string; published: boolean }> = [];
  let skip = 0;
  for (let page = 0; page < 20; page++) {
    const response = await ghlFetch(`${base}?locationId=${encodeURIComponent(locationId)}&skip=${skip}&limit=100`, { headers });
    if (!response.ok) throw new Error(`GHL agent list failed (${response.status}). Check managed-agents.readonly permission.`);
    const raw = await response.json() as { agents?: Array<{ id?: string; name?: string; description?: string }>; hasMore?: boolean };
    const items = Array.isArray(raw.agents) ? raw.agents : [];
    for (const item of items) if (item.id && item.name) agents.push({
      id: item.id,
      brandId: item.id === process.env["CONVINI_AGENT_ID"] ? "convini" : item.id === process.env["USTOW_AGENT_ID"] ? "ustow" : item.id,
      name: item.name, description: item.description || "", published: true,
    });
    if (!raw.hasMore || !items.length) break;
    skip += items.length;
  }
  return agents;
});

export const getPlannerTimezone = createServerFn({ method: "GET" }).handler(async () => {
  await requireSession();
  const timezone = process.env["GHL_TIMEZONE"]?.trim() || null;
  if (timezone) {
    try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }); }
    catch { throw new Error("GHL_TIMEZONE is not a valid IANA timezone."); }
  }
  return { timezone };
});

export const uploadPlannerPhoto = createServerFn({ method: "POST" })
  .validator((data: { name: string; mimeType: string; base64: string }) => z.object({
    name: z.string().min(1).max(180),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    base64: z.string().min(1).max(35_000_000),
  }).parse(data))
  .handler(async ({ data }) => {
    await requireSession();
    const bytes = Buffer.from(data.base64, "base64");
    if (bytes.length > 25_000_000) throw new Error("Photo must be under 25 MB.");
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bytes)], { type: data.mimeType }), data.name);
    form.append("hosted", "false");
    const response = await ghlFetch("https://services.leadconnectorhq.com/medias/upload-file", {
      method: "POST", headers: { Authorization: `Bearer ${process.env["GHL_PRIVATE_INTEGRATION_TOKEN"]}`, Version: "v3" }, body: form,
    });
    if (!response.ok) throw new Error(`GHL photo upload failed (${response.status}). Check the token's medias.write permission.`);
    const result = await response.json();
    if (typeof result.url !== "string" || !result.url.startsWith("https://")) throw new Error("GHL did not return a usable photo URL.");
    return { url: result.url };
  });

// ---- Social accounts + approvers ------------------------------------------

export const getSocialAccounts = createServerFn({ method: "GET" }).handler(async () => {
  return await fetchSocialAccounts();
});

export const getApprovers = createServerFn({ method: "GET" }).handler(async () => {
  return await fetchApprovers();
});

export const getAccountBrands = createServerFn({ method: "GET" }).handler(async () => {
  await requireSession();
  return store().accountBrands;
});

const profileSchema = z.object({
  audience: z.string().max(1000), tone: z.string().max(1000),
  businessDetails: z.string().max(4000), defaultCta: z.string().max(500), avoid: z.string().max(1000),
});

export const getBrandSetup = createServerFn({ method: "GET" })
  .validator((data: { brandId: BrandId }) => z.object({ brandId: brandIdSchema }).parse(data))
  .handler(async ({ data }) => {
    await requireSession();
    const agent = await getSavedAgentDetails(data.brandId);
    return { profile: store().brandProfiles[data.brandId] || { audience: "", tone: "", businessDetails: "", defaultCta: "", avoid: "" }, agent };
  });

export const saveBrandSetup = createServerFn({ method: "POST" })
  .validator((data: { brandId: BrandId; profile: z.infer<typeof profileSchema> }) => z.object({ brandId: brandIdSchema, profile: profileSchema }).parse(data))
  .handler(async ({ data }) => {
    await requireSession();
    updateStore(s => { s.brandProfiles[data.brandId] = data.profile; });
    return { ok: true };
  });

export const setAccountBrand = createServerFn({ method: "POST" })
  .validator((data: { accountId: string; brandId: BrandId | null }) => z.object({ accountId: z.string().min(1), brandId: brandIdSchema.nullable() }).parse(data))
  .handler(async ({ data }) => {
    await requireSession();
    const { accounts, error } = await fetchSocialAccounts();
    if (error) throw new Error(error);
    if (!accounts.some(a => a.id === data.accountId)) throw new Error("Account is not connected.");
    updateStore(s => {
      if (data.brandId) s.accountBrands[data.accountId] = data.brandId;
      else delete s.accountBrands[data.accountId];
    });
    return { ok: true };
  });

// ---- Posts ----------------------------------------------------------------

export const getPosts = createServerFn({ method: "GET" })
  .validator((data: { brandId?: BrandId }) => data)
  .handler(async ({ data }) => {
    return listPosts(data.brandId);
  });

export const getPostById = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ data }) => {
    return getPost(data.id);
  });

export const upsertPost = createServerFn({ method: "POST" })
  .validator((data: { post: SocialPost }) => z.object({ post: z.any() }).parse(data))
  .handler(async ({ data }) => {
    return data.post.status === 'draft' ? syncDraftToGhl(data.post) : savePost(data.post);
  });

export const removePost = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ data }) => {
    return deletePostStore(data.id);
  });

export const saveDraftPost = createServerFn({ method: "POST" })
  .validator((data: { post: SocialPost }) => z.object({ post: z.any() }).parse(data))
  .handler(async ({ data }) => {
    const draft = { ...data.post, status: "draft" as const };
    return syncDraftToGhl(draft);
  });

export const submitForApproval = createServerFn({ method: "POST" })
  .validator((data: { post: SocialPost }) => z.object({ post: z.any() }).parse(data))
  .handler(async ({ data }) => {
    const post = { ...data.post, status: "in_review" as const };
    return savePost(post);
  });

/**
 * Approve a post. Moves to "approved" (ready to schedule/publish).
 * Records the approver. Never schedules or publishes — that is a separate
 * explicit step.
 */
export const approvePost = createServerFn({ method: "POST" })
  .validator((data: { id: string; approverId?: string; approverName?: string }) =>
    z
      .object({
        id: z.string(),
        approverId: z.string().optional(),
        approverName: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const post = await getPost(data.id);
    if (!post) throw new Error("Post not found");
    if (post.status !== "in_review" && post.status !== "draft") {
      throw new Error("Only posts in review or draft can be approved");
    }
    const updated = {
      ...post,
      status: "approved" as const,
      reviewedBy: data.approverName ?? data.approverId,
    };
    return savePost(updated);
  });

/**
 * Deny a post. Requires a denial reason; returns the denied content for
 * revision (status -> "denied").
 */
export const denyPost = createServerFn({ method: "POST" })
  .validator((data: { id: string; reason: string; approverName?: string }) =>
    z
      .object({
        id: z.string(),
        reason: z.string().min(1).max(1000),
        approverName: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const post = await getPost(data.id);
    if (!post) throw new Error("Post not found");
    const updated: SocialPost = {
      ...post,
      status: "denied",
      denialReason: data.reason,
      reviewedBy: data.approverName,
    };
    return savePost(updated);
  });

/**
 * Return denied content to draft for revision (clears denial reason).
 */
export const reviseDeniedPost = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const post = await getPost(data.id);
    if (!post) throw new Error("Post not found");
    return savePost({ ...post, status: "draft", denialReason: undefined });
  });

/**
 * Schedule an approved post. Creates a scheduled entry per selected platform
 * through the social planner API and reports partial failures individually.
 */
export const schedulePost = createServerFn({ method: "POST" })
  .validator((data: { id: string; scheduledAt: string }) =>
    z.object({ id: z.string(), scheduledAt: z.string() }).parse(data),
  )
  .handler(async ({ data }) => {
    const post = await getPost(data.id);
    if (!post) throw new Error("Post not found");
    if (post.status !== "approved" && post.status !== "scheduled") {
      throw new Error("Post must be approved before scheduling");
    }
    const toSchedule = { ...post, status: "scheduled" as const, scheduledAt: data.scheduledAt };
    const results = await schedulePostViaGhl(toSchedule);
    const anyFailed = results.some((r) => !r.ok);
    const saved = await savePost({
      ...toSchedule,
      publishResults: results,
      // If every platform failed, mark the post failed rather than scheduled.
      status:
        anyFailed && results.every((r) => !r.ok) ? ("failed" as const) : ("scheduled" as const),
    });
    return saved;
  });

/**
 * Publish only after explicit approval and a Publish action.
 * Track the actual GHL response instead of labeling draft/processing responses published.
 */
export const publishPost = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const post = await getPost(data.id);
    if (!post) throw new Error("Post not found");
    if (post.status !== "approved" && post.status !== "scheduled") {
      throw new Error("Post must be explicitly approved before publishing");
    }
    const results = await publishPostViaGhl(post);
    const anyOk = results.some((r) => r.ok);
    const updated = await savePost({
      ...post,
      status: !anyOk ? "failed" : results.every(r => r.ok && r.status === "published") ? "published" : "publishing",
      publishedAt: results.every(r => r.ok && r.status === "published") ? new Date().toISOString() : post.publishedAt,
      publishResults: results,
    });
    return updated;
  });

export const reschedulePost = createServerFn({ method: "POST" })
  .validator((data: { id: string; scheduledAt: string }) =>
    z.object({ id: z.string(), scheduledAt: z.string() }).parse(data),
  )
  .handler(async ({ data }) => {
    const post = await getPost(data.id);
    if (!post) throw new Error("Post not found");
    if (!["draft", "in_review", "approved", "scheduled"].includes(post.status)) throw new Error("Only drafts and reviewed posts can be scheduled.");
    const updated = { ...post, scheduledAt: data.scheduledAt };
    const results = await schedulePostViaGhl(updated);
    if (!results.length || results.some(r => !r.ok)) {
      await savePost({ ...updated, publishResults: results });
      throw new Error(results.find(r => !r.ok)?.error || "Rescheduling failed.");
    }
    return savePost({ ...updated, publishResults: results, status: "scheduled" });
  });

/**
 * Batch schedule all approved posts for a brand. Each approved scheduled post
 * is created through the social planner API; partial failures are reported
 * individually and never silently marked successful.
 */
export const scheduleApprovedBatch = createServerFn({ method: "POST" })
  .validator((data: { brandId: BrandId }) => z.object({ brandId: brandIdSchema }).parse(data))
  .handler(async ({ data }) => {
    const posts = await listPosts(data.brandId);
    const approved = posts.filter((p) => p.status === "approved");
    const report: { id: string; title: string; results: PublishResult[]; ok: boolean }[] = [];
    for (const post of approved) {
      const results = await schedulePostViaGhl(post);
      const ok = results.every((r) => r.ok);
      const anyOk = results.some((r) => r.ok);
      await savePost({
        ...post,
        status: ok ? ("scheduled" as const) : anyOk ? ("scheduled" as const) : ("failed" as const),
        publishResults: results,
      });
      report.push({ id: post.id, title: post.title, results, ok });
    }
    return report;
  });

// ---- Campaigns ------------------------------------------------------------

export const getCampaigns = createServerFn({ method: "GET" })
  .validator((data: { brandId?: BrandId }) => data)
  .handler(async ({ data }) => {
    return listCampaigns(data.brandId);
  });

export const upsertCampaign = createServerFn({ method: "POST" })
  .validator((data: { campaign: Campaign }) => z.object({ campaign: z.any() }).parse(data))
  .handler(async ({ data }) => {
    return saveCampaign(data.campaign);
  });

// ---- Comments -------------------------------------------------------------

export const getComments = createServerFn({ method: "GET" })
  .validator((data: { brandId?: BrandId; platform?: Platform }) => data)
  .handler(async ({ data }) => {
    return listComments(data.brandId, data.platform);
  });

export const replyToComment = createServerFn({ method: "POST" })
  .validator((data: { commentId: string; postId: string; text: string; author: string }) =>
    z
      .object({
        commentId: z.string(),
        postId: z.string(),
        text: z.string().min(1).max(2000),
        author: z.string(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const comments = await listComments();
    const comment = comments.find((c) => c.id === data.commentId);
    if (!comment) throw new Error("Comment not found");
    const updated: Comment = {
      ...comment,
      reply: data.text,
      replyAuthor: data.author,
      repliedAt: new Date().toISOString(),
    };
    const result = await replyGhlComment(data.commentId, data.text, comment.platform);
    if (!result.ok) throw new Error(result.error || "Reply failed.");
    await saveComment(updated);
    return updated;
  });

// ---- Agent (conversational AI) -------------------------------------------

export const sendAgentMessage = createServerFn({ method: "POST" })
  .validator(
    (data: { brandId: BrandId; message: string; executionId?: string; draftPostId?: string }) =>
      z
        .object({
          brandId: brandIdSchema,
          message: z.string().min(1).max(4000),
          executionId: z.string().optional(),
          draftPostId: z.string().optional(),
        })
        .parse(data),
  )
  .handler(async ({ data }) => {
    // Frame the user's request asking the agent to respond with a structured
    // JSON object so the caption never gets mixed with the prompt instructions
    // or conversational chatter. Validate the output and retry once if the
    // agent returns garbage (instruction echo, chatter, or invalid JSON).
    const profile = store().brandProfiles[data.brandId];
    const guidance = profile ? [
      profile.audience && `Audience: ${profile.audience}`,
      profile.tone && `Tone: ${profile.tone}`,
      profile.businessDetails && `Verified business details supplied by the team: ${profile.businessDetails}`,
      profile.defaultCta && `Usual call to action: ${profile.defaultCta}`,
      profile.avoid && `Avoid: ${profile.avoid}`,
    ].filter(Boolean).join("\n") : "";
    const framed = frameCaptionPrompt(data.brandId, `${guidance ? `Brand setup:\n${guidance}\n` : ""}User request: ${data.message}.`);
    let result = await runAgentTurn(data.brandId, framed, data.executionId);
    const executionId = result.executionId || uid("exec");
    const existing = data.executionId ? await getSession(data.executionId) : undefined;

    let reply = cleanCaption(result.reply || "");
    let parsed = parseStructuredCaption(result.reply || "");
    let title: string | undefined = parsed.title;
    let body: string | undefined = parsed.body || reply;

    // Post-generation check: if the cleaned reply is invalid (empty, prompt
    // echo, or conversational chatter), retry once with a stricter directive.
    if (!validateCaption(body || "")) {
      const retryFramed =
        `IMPORTANT: Your last response was not a valid post caption. ` +
        `Respond with ONLY a JSON object: {"title": "short headline", "body": "the full caption text"}. ` +
        `No other text. User request: ${data.message}.`;
      const retry = await runAgentTurn(data.brandId, retryFramed, executionId);
      if (!retry.error) {
        const retryParsed = parseStructuredCaption(retry.reply || "");
        const retryBody = retryParsed.body || cleanCaption(retry.reply || "");
        if (validateCaption(retryBody || "")) {
          body = retryBody;
          if (retryParsed.title) title = retryParsed.title;
        }
      }
    }

    const turns = existing?.turns ?? [];
    turns.push(
      { role: "user", content: data.message, createdAt: new Date().toISOString() },
      {
        role: "assistant",
        content: body || result.error || "",
        createdAt: new Date().toISOString(),
      },
    );
    await saveSession({
      executionId,
      brandId: data.brandId,
      turns,
      draftPostId: data.draftPostId,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    });
    return { executionId, reply: body, title, error: result.error, turns };
  });

export const getAgentSession = createServerFn({ method: "GET" })
  .validator((data: { executionId: string }) => z.object({ executionId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    return getSession(data.executionId) ?? null;
  });

export const runAgentDiagnostic = createServerFn({ method: "POST" })
  .validator((data: { brandId: BrandId }) => z.object({ brandId: brandIdSchema }).parse(data))
  .handler(async ({ data }) => {
    return await testAgentExecution(data.brandId);
  });

export const requestMedia = createServerFn({ method: "POST" })
  .validator(
    (data: { brandId: BrandId; prompt: string; type: "image" | "video"; executionId?: string }) =>
      z
        .object({
          brandId: brandIdSchema,
          prompt: z.string().min(1).max(1000),
          type: z.enum(["image", "video"]),
          executionId: z.string().optional(),
        })
        .parse(data),
  )
  .handler(async ({ data }) => {
    return await generateMedia(data.brandId, data.prompt, data.type, data.executionId);
  });

/**
 * Generate posts for a chosen day and time window through the brand
 * agent (real copy + media). Returns drafts for preview — nothing is saved or
 * published until the caller approves.
 */
export const generateBatchPosts = createServerFn({ method: "POST" })
  .validator(
    (data: {
      brandId: BrandId;
      brief: string;
      count: number;
      startDate: string;
      days: number;
      windowStart: string;
      windowEnd: string;
      objective: CampaignObjective;
      accountIds: string[];
    }) =>
      z
        .object({
          brandId: brandIdSchema,
          brief: z.string().max(2000),
          count: z.number().min(1).max(20),
          startDate: z.string(),
          days: z.number().int().min(1).max(90),
          windowStart: z.string().regex(/^\d{2}:\d{2}$/),
          windowEnd: z.string().regex(/^\d{2}:\d{2}$/),
          objective: z.enum([
            "awareness",
            "engagement",
            "leads",
            "conversions",
            "retention",
            "support",
          ]),
          accountIds: z.array(z.string()),
        })
        .parse(data),
  )
  .handler(async ({ data }) => {
    return await buildBatchPosts(data);
  });

/**
 * Regenerate a single batch post's caption AND visual in one combined agent
 * call. Returns the updated post with fresh copy and a new image — or the
 * original post with an error if the agent call fails.
 */
export const regeneratePost = createServerFn({ method: "POST" })
  .validator((data: { post: SocialPost }) => z.object({ post: z.any() }).parse(data))
  .handler(async ({ data }) => {
    return await regenerateBatchPost(data.post);
  });

// ---- Analytics ------------------------------------------------------------

export const getAnalytics = createServerFn({ method: "GET" })
  .validator((data: { brandId?: BrandId }) => data)
  .handler(async ({ data }) => {
    const posts = await listPosts(data.brandId);
    const ghlStats = await fetchGhlStats(data.brandId);
    const recommendations = await listRecommendations(data.brandId);
    const platforms: Platform[] = ["facebook", "instagram", "linkedin", "google", "twitter"];
    const summary = platforms.map((platform) => {
      const platformPosts = posts.filter((p) => p.platforms.includes(platform));
      const stat = ghlStats.find(
        (s) => s.platform === platform && (!data.brandId || s.brandId === data.brandId),
      );
      return {
        brandId: (data.brandId ?? "convini") as BrandId,
        platform,
        // Real stats from the social planner; 0 when no data is available.
        reach: stat?.reach ?? 0,
        engagement: stat?.engagement ?? 0,
        comments: stat?.comments ?? 0,
        clicks: stat?.clicks ?? 0,
        publishedCount: platformPosts.filter((p) => p.status === "published").length,
        scheduledCount: platformPosts.filter((p) => p.status === "scheduled").length,
        draftCount: platformPosts.filter(
          (p) => p.status === "draft" || p.status === "in_review" || p.status === "approved",
        ).length,
      };
    });
    return { summary, recommendations, posts };
  });

export const getGhlPosts = createServerFn({ method: "GET" }).handler(async () => {
  return await fetchGhlPosts();
});

export const getGhlComments = createServerFn({ method: "GET" })
  .validator((data: { postId: string }) => z.object({ postId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    return await fetchGhlComments(data.postId);
  });
