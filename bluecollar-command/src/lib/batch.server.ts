// Server-only batch generation. Generates a batch of posts for a date range as
// one campaign using the brand agent (real copy) and media generator (real
// visuals). Nothing is saved or published here — the caller previews, then
// approves. Session-gated; client code never imports this directly.

import type {
  BrandId,
  CampaignCadence,
  CampaignObjective,
  MediaItem,
  Platform,
  PostType,
  SocialPost,
} from "./types";
import { requireSession } from "./auth.server";
import { uid } from "./marketing-store.server";
import {
  cleanCaption,
  isChatter,
  parseStructuredCaption,
  validateCaption,
} from "./caption-clean.server";
import { fetchSocialAccounts, frameCaptionPrompt } from "./marketing.server";
import { runCombinedTurn } from "./agent.server";

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function buildBatchPosts(params: {
  brandId: BrandId;
  brief: string;
  count: number;
  startDate: string;
  endDate: string;
  objective: CampaignObjective;
  accountIds: string[];
  cadence: CampaignCadence;
}): Promise<{ posts: SocialPost[]; error?: string }> {
  await requireSession();
  const { brandId, brief, objective, accountIds, cadence, startDate, endDate } = params;
  const start = startDate ? new Date(startDate) : new Date();
  const end = endDate ? new Date(endDate) : new Date(Date.now() + 14 * 86400000);
  const spanDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
  const n = Math.min(Math.max(params.count, 1), 20);
  const interval = Math.max(1, Math.floor(spanDays / n));

  const { accounts } = await fetchSocialAccounts();
  const platforms = accountIds
    .map((id) => accounts.find((a) => a.id === id)?.platform)
    .filter((x): x is Platform => !!x);

  // Do NOT inject invented brand descriptions here — the configured brand agent
  // is the single source of brand voice and positioning. We only name the brand
  // and pass the user's brief; the agent supplies all on-brand copy.
  const brandName = brandId === "convini" ? "Convini" : brandId === "ustow" ? "US Tow AI Connect" : "the selected agent's configured business";

  const angles: { type: PostType; desc: string }[] = [
    { type: "offer", desc: "a promotional offer or limited-time discount" },
    { type: "explainer", desc: "an explainer breaking down how the service works" },
    { type: "educational", desc: "an educational tip the audience will find useful" },
    { type: "testimonial", desc: "a customer testimonial or success story" },
    { type: "announcement", desc: "an announcement or news update" },
    { type: "feature", desc: "a feature highlight spotlighting a key capability" },
  ];

  const posts: SocialPost[] = [];
  let executionId: string | undefined;
  let batchError: string | undefined;
  let consecutiveFailures = 0;
  const MAX_CONSECUTIVE_FAILURES = 2; // stop generating empty posts

  for (let i = 0; i < n; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i * interval);
    d.setHours(10, 0, 0, 0);
    const angle = angles[i % angles.length];

    // Build a concise, combined prompt that asks for BOTH the caption and the
    // image in a single call (halving API requests). The framing is short and
    // natural so the agent is unlikely to echo it; cleanCaption strips any
    // residual instruction fragments regardless.
    const instruction =
      `Post type: ${angle.type} (${angle.desc}). Marketing objective: ${objective}. ` +
      `${brief ? `Campaign details / promo offer: ${brief}. ` : ""}` +
      `Also generate one matching visual image for this post using your image tool.`;
    const prompt = frameCaptionPrompt(brandId, instruction);

    // Pace the calls so we don't hammer the agent API and trip rate limits.
    if (i > 0) await delay(800);

    // Crucial: do NOT pass executionId between separate batch posts!
    // Passing executionId makes the Managed Agent treat post 2, 3, etc. as
    // conversational follow-ups in the same ongoing chat thread (where the user
    // sent timestamps or previous prompts), leading to responses like
    // "It looks like that was just a system time update — no action needed on my end! 😊".
    // Each post in a batch must start a fresh turn with its own standalone context.
    const turn = await runCombinedTurn(brandId, prompt, undefined);
    const reply = (turn.reply || "").trim();

    // EARLY-FAIL GUARD: if the very first turn fails outright (auth/scope error
    // or total outage), stop immediately and return the real error rather than
    // fabricating N empty placeholder posts.
    if (turn.error && !reply && i === 0) {
      return { posts: [], error: turn.error };
    }

    // Track consecutive failures. After two in a row the agent API is almost
    // certainly rate-limited or down — stop and return what we have rather than
    // padding the batch with empty placeholders.
    const failed = !reply && !turn.mediaUrl;
    if (failed) {
      consecutiveFailures++;
      if (!batchError)
        batchError = turn.error || "Agent stopped returning content (possible rate limit).";
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.warn(
          `[Batch] Stopping after ${consecutiveFailures} consecutive failures at post ${i + 1}/${n}.`,
        );
        break;
      }
    } else {
      consecutiveFailures = 0;
      if (turn.error && !batchError) batchError = turn.error;
    }

    // Clean the agent reply down to just the publishable caption. The agent
    // is asked to respond with {"title":..., "body":...} JSON so the caption
    // never gets mixed with the prompt instructions or conversational chatter.
    // Parse the JSON first; fall back to cleanCaption on the raw reply.
    const parsed = parseStructuredCaption(reply);
    let body = parsed.body || cleanCaption(reply);
    let title = parsed.title;
    const chatter = isChatter(reply);

    // Post-generation check: if the cleaned body is invalid (empty, prompt
    // echo, or conversational chatter), retry once with a stricter directive
    // so the post gets real content instead of garbage.
    if (!validateCaption(body || "")) {
      if (i > 0) await delay(600);
      const retryFramed =
        `IMPORTANT: Your last response was not a valid post caption. ` +
        `Respond with ONLY a JSON object: {"title": "short headline", "body": "the full caption text"}. ` +
        `No other text. Post type: ${angle.type} (${angle.desc}). Campaign details: ${brief || instruction}.`;
      const retryPrompt = frameCaptionPrompt(brandId, retryFramed);
      const retryTurn = await runCombinedTurn(brandId, retryPrompt, undefined);
      const retryReply = (retryTurn.reply || "").trim();
      if (!retryTurn.error && retryReply) {
        const retryParsed = parseStructuredCaption(retryReply);
        const retryBody = retryParsed.body || cleanCaption(retryReply);
        if (validateCaption(retryBody)) {
          body = retryBody;
          if (retryParsed.title) title = retryParsed.title;
        }
      }
    }

    // If still empty after the retry, use the brief as the body so the post
    // still has content rather than dumping agent chatter into the caption.
    if (!body || !validateCaption(body)) {
      body = brief || `${brandName} ${angle.type} post — edit this caption and add your details.`;
    }

    // Use the JSON title when available, otherwise derive a headline from the
    // body's first meaningful line instead of robotic sequential numbering.
    const firstLine =
      body
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)[0] || "";
    const cleanTitle = (title || firstLine)
      .replace(/^#+\s*/, "")
      .replace(/[*_"`]/g, "")
      .slice(0, 80)
      .trim();

    const finalTitle =
      cleanTitle ||
      (brief
        ? brief.slice(0, 60)
        : `${brandName} ${angle.type.charAt(0).toUpperCase() + angle.type.slice(1)}`);

    const now = new Date().toISOString();
    const mediaItems: MediaItem[] = turn.mediaUrl
      ? [{ id: `m_${uid("m")}`, url: turn.mediaUrl, type: "image", caption: finalTitle }]
      : [];

    posts.push({
      id: `batch_${uid("bp")}`,
      brandId,
      campaignId: null,
      type: angle.type,
      accountIds,
      platforms,
      objective,
      format: "single_image",
      title: finalTitle,
      body,
      cta: undefined,
      offer: undefined,
      media: mediaItems,
      commentToDm: false,
      commentToDmKeyword: undefined,
      status: "draft",
      scheduledAt: d.toISOString(),
      createdAt: now,
      updatedAt: now,
      agentExecutionId: executionId,
    });
  }

  return { posts, error: batchError };
}

/**
 * Regenerate a single batch post's caption AND visual in one combined agent
 * call. Starts a fresh turn (no executionId) so the agent treats it as a
 * standalone post, not a conversational follow-up. Returns the updated post
 * with the new caption, title, and media — or the original post with an
 * error if the agent call fails.
 */
export async function regenerateBatchPost(post: SocialPost): Promise<{
  post: SocialPost;
  error?: string;
}> {
  await requireSession();
  const instruction =
    `Regenerate this social media post with fresh, on-brand copy and a new matching visual.\n` +
    `Post type: ${post.type}. ` +
    `${post.offer ? `Offer details: ${post.offer}. ` : ""}` +
    `Respond with ONLY a JSON object: {"title": "short headline", "body": "the full caption text"}. ` +
    `Also generate one matching visual image using your image tool.`;
  const prompt = frameCaptionPrompt(post.brandId, instruction);
  const turn = await runCombinedTurn(post.brandId, prompt, undefined);
  const reply = (turn.reply || "").trim();

  let parsed = parseStructuredCaption(reply);
  let body = parsed.body || cleanCaption(reply);
  let title = parsed.title;

  // Post-generation check: retry once with a stricter directive if the body
  // is invalid (empty, prompt echo, or conversational chatter).
  if (!validateCaption(body || "")) {
    const retryPrompt = frameCaptionPrompt(
      post.brandId,
      `IMPORTANT: Your last response was not a valid post caption. ` +
        `Respond with ONLY a JSON object: {"title": "short headline", "body": "the full caption text"}. ` +
        `No other text. Post type: ${post.type}.`,
    );
    const retryTurn = await runCombinedTurn(post.brandId, retryPrompt, undefined);
    const retryReply = (retryTurn.reply || "").trim();
    if (!retryTurn.error && retryReply) {
      const retryParsed = parseStructuredCaption(retryReply);
      const retryBody = retryParsed.body || cleanCaption(retryReply);
      if (validateCaption(retryBody)) {
        body = retryBody;
        if (retryParsed.title) title = retryParsed.title;
      }
    }
  }

  // If still invalid, keep the original body rather than overwriting with garbage.
  if (!body || !validateCaption(body)) {
    body = post.body;
  }

  const firstLine =
    (body || "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)[0] || "";
  const cleanTitle = (title || firstLine)
    .replace(/^#+\s*/, "")
    .replace(/[*_"`]/g, "")
    .slice(0, 80)
    .trim();
  const finalTitle = cleanTitle || post.title;

  const mediaItems = turn.mediaUrl
    ? [{ id: `m_${uid("m")}`, url: turn.mediaUrl, type: "image" as const, caption: finalTitle }]
    : post.media;
  return {
    post: {
      ...post,
      title: finalTitle,
      body,
      media: mediaItems,
      agentExecutionId: turn.executionId || post.agentExecutionId,
      updatedAt: new Date().toISOString(),
    },
    error: turn.error,
  };
}
