import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Send,
  Sparkles,
  Image as ImageIcon,
  Save,
  CheckSquare,
  CalendarClock,
  Rocket,
  Bot,
  User,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { useBrand } from "@/lib/brand-context";
import {
  saveDraftPost,
  submitForApproval,
  schedulePost,
  publishPost,
  getSocialAccounts,
} from "@/lib/marketing.functions";
import { Card, PageHeader, PlatformIcon } from "@/components/shared";
import {
  AccountMultiSelect,
  MediaManager,
  CarouselPreview,
  Field,
  ActionButton,
} from "@/components/create-widgets";
import {
  PLATFORMS,
  POST_TYPES,
  OBJECTIVES,
  CONTENT_FORMATS,
  PLATFORM_MEDIA_LIMITS,
} from "@/lib/types";
import type {
  Platform,
  PostType,
  CampaignObjective,
  ContentFormat,
  SocialPost,
  MediaItem,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { useChatMedia } from "@/hooks/use-chat-media";

export const Route = createFileRoute("/create")({
  head: () => ({
    meta: [
      { title: "Create Content — Blue Collar AI Command Center" },
      { name: "description", content: "Conversational AI content creation for social posts." },
      { property: "og:title", content: "Create Content — Blue Collar AI Command Center" },
      {
        property: "og:description",
        content: "Conversational AI content creation for social posts.",
      },
    ],
  }),
  component: CreateContent,
});

function emptyPost(brandId: "convini" | "ustow"): SocialPost {
  const now = new Date().toISOString();
  return {
    id: `post_${Math.random().toString(36).slice(2, 10)}`,
    brandId,
    campaignId: null,
    type: "offer",
    accountIds: [],
    platforms: [],
    objective: "awareness",
    format: "text",
    title: "",
    body: "",
    offer: "",
    cta: "",
    media: [],
    commentToDm: false,
    commentToDmKeyword: "",
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

function CreateContent() {
  const { brand } = useBrand();
  const queryClient = useQueryClient();

  const accountsQuery = useQuery({
    queryKey: ["social-accounts"],
    queryFn: () => getSocialAccounts(),
  });
  const connectedAccounts = accountsQuery.data?.accounts ?? [];
  const accountsError = accountsQuery.data?.error;

  const [post, setPost] = useState<SocialPost>(() => emptyPost(brand.id));
  const { chat, setChat, chatMut, handleSend } = useChatMedia(brand.id, post, setPost);
  const [scheduledAt, setScheduledAt] = useState("");
  const [footageBrief, setFootageBrief] = useState("");

  useEffect(() => {
    setPost(emptyPost(brand.id));
    setChat({ executionId: undefined, turns: [], input: "" });
  }, [brand.id, setChat]);

  const saveDraft = useServerFn(saveDraftPost);
  const submitApproval = useServerFn(submitForApproval);
  const schedule = useServerFn(schedulePost);
  const publish = useServerFn(publishPost);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["posts", brand.id] });
    queryClient.invalidateQueries({ queryKey: ["analytics", brand.id] });
  };

  const saveDraftMut = useMutation({
    mutationFn: () => saveDraft({ data: { post } }),
    onSuccess: (saved) => {
      invalidate();
      if (saved.accountIds.length && saved.publishResults?.some(result => !result.ok)) toast.error("Draft saved locally, but GHL sync failed for some accounts.");
      else if (saved.accountIds.length) toast.success("Draft synced to GHL Social Planner");
      else toast.success("Draft saved locally. Select an account to sync it to GHL.");
    },
  });
  const submitMut = useMutation({
    mutationFn: () => submitApproval({ data: { post } }),
    onSuccess: () => {
      invalidate();
      toast.success("Submitted for approval");
    },
  });
  const scheduleMut = useMutation({
    mutationFn: () =>
      schedule({
        data: {
          id: post.id,
          scheduledAt: scheduledAt || new Date(Date.now() + 86400000).toISOString(),
        },
      }),
    onSuccess: (saved) => {
      invalidate();
      setPost(saved);
      if (saved.status === "failed") toast.error("Scheduling failed for all platforms.");
      else if (saved.publishResults?.some((r) => !r.ok))
        toast.warning("Scheduled with partial failures.");
      else toast.success("Scheduled");
    },
  });
  const publishMut = useMutation({
    mutationFn: () => publish({ data: { id: post.id } }),
    onSuccess: (saved) => {
      invalidate();
      setPost(saved);
      if (saved.status === "failed") toast.error("Publishing failed for all platforms.");
      else if (saved.publishResults?.some((r) => !r.ok))
        toast.warning("GHL accepted some accounts; others failed. Check the results.");
      else toast.success(saved.status === "published" ? "Published" : "Submitted to GHL for processing");
    },
  });

  // comment-to-DM keyword injected into CTA
  const effectiveCta = useMemo(() => {
    const base = post.cta ?? "";
    if (post.commentToDm && post.commentToDmKeyword) {
      const suffix = ` — comment ${post.commentToDmKeyword}`;
      return base ? `${base}${suffix}` : `Comment ${post.commentToDmKeyword}`;
    }
    return base;
  }, [post.cta, post.commentToDm, post.commentToDmKeyword]);

  const formatMeta = CONTENT_FORMATS.find((f) => f.id === post.format)!;
  const isVideoFormat =
    post.format === "video" || post.format === "reel" || post.format === "story";
  const carouselAllowed = formatMeta.supportsCarousel && !isVideoFormat;
  // Derive platforms from selected account IDs for media-limit validation.
  const selectedPlatforms = post.accountIds
    .map((id) => connectedAccounts.find((a) => a.id === id)?.platform)
    .filter((p): p is Platform => !!p);
  const maxImages = selectedPlatforms.length
    ? Math.min(...selectedPlatforms.map((p) => PLATFORM_MEDIA_LIMITS[p].maxImages))
    : 10;
  const carouselPlatformsBlocked =
    post.format === "image_carousel" &&
    selectedPlatforms.some((p) => !PLATFORM_MEDIA_LIMITS[p].supportsCarousel);

  function setFormat(format: ContentFormat) {
    setPost((p) => {
      if (
        format === "image_carousel" &&
        (p.format === "video" || p.format === "reel" || p.format === "story")
      )
        return p;
      const isVid = format === "video" || format === "reel" || format === "story";
      return { ...p, format, media: isVid ? p.media.slice(0, 1) : p.media.slice(0, 1) };
    });
  }

  function addMedia(url: string, type: "image" | "video") {
    setPost((p) => {
      if (type === "image" && p.media.length >= maxImages) {
        toast.error(`Max ${maxImages} image(s) for the selected platforms`);
        return p;
      }
      if (type === "video" && p.media.length >= 1) {
        toast.error("Only one video per post");
        return p;
      }
      const item: MediaItem = { id: `m_${Math.random().toString(36).slice(2, 8)}`, url, type };
      return { ...p, media: [...p.media, item] };
    });
  }
  function removeMedia(id: string) {
    setPost((p) => ({ ...p, media: p.media.filter((m) => m.id !== id) }));
  }
  function moveMedia(id: string, dir: -1 | 1) {
    setPost((p) => {
      const idx = p.media.findIndex((m) => m.id === id);
      if (idx < 0) return p;
      const next = idx + dir;
      if (next < 0 || next >= p.media.length) return p;
      const media = [...p.media];
      [media[idx], media[next]] = [media[next], media[idx]];
      return { ...p, media };
    });
  }

  const previewPlatform = selectedPlatforms[0] ?? "facebook";
  const platformLabel = PLATFORMS.find((p) => p.id === previewPlatform)?.label ?? previewPlatform;
  const noAccounts = !accountsQuery.isLoading && connectedAccounts.length === 0;
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
      <PageHeader
        title="Create content"
        description={`Conversational AI for ${brand.name}. Your session context is preserved across revisions.`}
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          <Card>
            <h2 className="text-base font-semibold text-foreground">Post details</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Post type">
                <select
                  className="input"
                  value={post.type}
                  onChange={(e) => setPost({ ...post, type: e.target.value as PostType })}
                >
                  {POST_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Goal">
                <select
                  className="input"
                  value={post.objective}
                  onChange={(e) =>
                    setPost({ ...post, objective: e.target.value as CampaignObjective })
                  }
                >
                  {OBJECTIVES.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Content format">
                <select
                  className="input"
                  value={post.format}
                  onChange={(e) => setFormat(e.target.value as ContentFormat)}
                >
                  {CONTENT_FORMATS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <AccountMultiSelect
              accounts={connectedAccounts}
              selectedAccountIds={post.accountIds}
              loading={accountsQuery.isLoading}
              noAccounts={noAccounts}
              error={accountsError}
              onChange={(accountIds) => setPost((p) => ({ ...p, accountIds }))}
            />

            <div className="mt-4 space-y-4">
              <Field label="Title">
                <input
                  className="input"
                  value={post.title}
                  onChange={(e) => setPost({ ...post, title: e.target.value })}
                  placeholder="Post title"
                />
              </Field>
              <Field label="Caption / body">
                <textarea
                  className="input min-h-28 resize-y"
                  value={post.body}
                  onChange={(e) => setPost({ ...post, body: e.target.value })}
                  placeholder="Write or generate your post caption…"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Offer details">
                  <input
                    className="input"
                    value={post.offer ?? ""}
                    onChange={(e) => setPost({ ...post, offer: e.target.value })}
                    placeholder="e.g. 20% off restock orders"
                  />
                </Field>
                <Field label="Call to action">
                  <input
                    className="input"
                    value={post.cta ?? ""}
                    onChange={(e) => setPost({ ...post, cta: e.target.value })}
                    placeholder="e.g. Book your restock"
                  />
                </Field>
              </div>
              {post.commentToDm && post.commentToDmKeyword && (
                <div className="rounded-lg border border-brand-convini/30 bg-brand-convini/5 p-2.5 text-xs text-muted-foreground">
                  <span className="font-medium text-brand-convini">CTA preview:</span>{" "}
                  {effectiveCta}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <h2 className="text-base font-semibold text-foreground">Real-footage video plan</h2>
            <p className="mt-1 text-xs text-muted-foreground">Describe the truck, team, or job footage you have. Your selected brand agent will write an editable plan when you send it in the chat. No video generation or publishing happens here.</p>
            <textarea aria-label="Available footage and video goal" className="input mt-3 min-h-24 w-full" value={footageBrief} onChange={(event) => setFootageBrief(event.target.value)} placeholder="Example: 20 seconds of our truck arriving, loading a car, and driving away. Goal: show safe, careful service." />
            <button type="button" className="mt-3 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent" disabled={!footageBrief.trim()} onClick={() => {
              setFormat("reel");
              setChat(c => ({ ...c, input: `Create a practical 15–30 second social video plan using only this real footage: ${footageBrief.trim()}\nReturn: (1) a short opening hook, (2) shot-by-shot edit order and approximate seconds, (3) concise on-screen text, (4) optional voiceover, (5) caption and CTA. Keep visuals documentary and natural. Do not invent footage, locations, prices, response times, testimonials, or results. If a needed fact is missing, flag it for review. Do not generate an AI video or publish anything.` }));
              toast.success("Video plan prompt added to chat. Review it, then press Send.");
            }}>Prepare video plan prompt</button>
          </Card>

          <Card>
            <h2 className="text-base font-semibold text-foreground">Media</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatMeta.description}.{" "}
              {carouselAllowed
                ? "Carousel mode — add multiple images and reorder them."
                : isVideoFormat
                  ? "Single video only."
                  : "Single image."}
            </p>
            {carouselPlatformsBlocked && (
              <p className="mt-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-muted-foreground">
                One or more selected platforms do not support image carousels. The carousel will
                only publish to Facebook and Instagram.
              </p>
            )}
            <MediaManager
              media={post.media}
              format={post.format}
              maxImages={carouselAllowed ? maxImages : 1}
              onAdd={addMedia}
              onRemove={removeMedia}
              onMove={moveMedia}
            />
          </Card>

          <Card>
            <h2 className="text-base font-semibold text-foreground">Comment-to-DM automation</h2>
            <div className="mt-4 rounded-lg border border-border p-3">
              <label className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Enable comment-to-DM</span>
                <button
                  onClick={() => setPost({ ...post, commentToDm: !post.commentToDm })}
                  className={cn(
                    "relative h-6 w-11 rounded-full transition-colors",
                    post.commentToDm ? "bg-primary" : "bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform",
                      post.commentToDm ? "translate-x-5" : "translate-x-0.5",
                    )}
                  />
                </button>
              </label>
              {post.commentToDm && (
                <input
                  className="input mt-3"
                  value={post.commentToDmKeyword ?? ""}
                  onChange={(e) =>
                    setPost({ ...post, commentToDmKeyword: e.target.value.toUpperCase() })
                  }
                  placeholder="Trigger keyword (e.g. SNACK)"
                />
              )}
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-accent/40 p-2.5">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  When enabled, the keyword is added to your CTA so commenters know what to type.
                  The actual DM reply is handled by your existing workflow — this tool does not send
                  DMs directly.
                </span>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="text-base font-semibold text-foreground">Actions</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Posts are never published without explicit final approval.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <ActionButton
                onClick={() => saveDraftMut.mutate()}
                icon={Save}
                label="Save draft"
                loading={saveDraftMut.isPending}
              />
              <ActionButton
                onClick={() => submitMut.mutate()}
                icon={CheckSquare}
                label="Submit for approval"
                loading={submitMut.isPending}
              />
              <ActionButton
                onClick={() => scheduleMut.mutate()}
                icon={CalendarClock}
                label="Schedule"
                loading={scheduleMut.isPending}
                disabled={post.accountIds.length === 0 || post.status !== "approved"}
              />
              <ActionButton
                onClick={() => publishMut.mutate()}
                icon={Rocket}
                label="Publish"
                loading={publishMut.isPending}
                variant="primary"
                disabled={
                  post.accountIds.length === 0 ||
                  (post.status !== "approved" && post.status !== "scheduled")
                }
              />
            </div>
            {post.status !== "approved" && post.status !== "scheduled" && (
              <p className="mt-2 text-xs text-muted-foreground">
                Schedule and Publish require the post to be approved first (Approvals page).
              </p>
            )}
            <div className="mt-3">
              <Field label="Schedule date & time">
                <input
                  type="datetime-local"
                  className="input"
                  value={scheduledAt ? scheduledAt.slice(0, 16) : ""}
                  onChange={(e) =>
                    setScheduledAt(e.target.value ? new Date(e.target.value).toISOString() : "")
                  }
                />
              </Field>
            </div>
            {post.publishResults && post.publishResults.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">Publish results</div>
                {post.publishResults.map((r) => (
                  <div
                    key={r.platform}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border p-2 text-xs",
                      r.ok
                        ? "border-success/30 bg-success/10 text-success"
                        : "border-destructive/30 bg-destructive/10 text-destructive",
                    )}
                  >
                    <PlatformIcon platform={r.platform} className="h-5 w-5" />
                    <span className="font-medium">{r.platform}</span>
                    <span className="ml-auto">{r.ok ? "Scheduled ✓" : `Failed: ${r.error}`}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="flex h-[420px] flex-col p-0">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Bot className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Conversational AI</h2>
              <span className="ml-auto text-[11px] text-muted-foreground">
                {chat.executionId ? "Session active" : "New session"}
              </span>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {chat.turns.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <Sparkles className="h-8 w-8 text-primary/60" />
                  <p className="mt-3 text-sm text-muted-foreground">
                    Describe the post you want for {brand.name}. The AI drafts, revises, and
                    remembers context.
                  </p>
                </div>
              )}
              {chat.turns.map((t, i) => (
                <div
                  key={i}
                  className={cn("flex gap-2.5", t.role === "user" && "flex-row-reverse")}
                >
                  <div
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                      t.role === "assistant"
                        ? "bg-primary/15 text-primary"
                        : "bg-secondary text-secondary-foreground",
                    )}
                  >
                    {t.role === "assistant" ? (
                      <Bot className="h-4 w-4" />
                    ) : (
                      <User className="h-4 w-4" />
                    )}
                  </div>
                  <div
                    className={cn(
                      "max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm",
                      t.role === "assistant"
                        ? "bg-secondary text-secondary-foreground"
                        : "bg-primary text-primary-foreground",
                    )}
                  >
                    {t.content || "..."}
                  </div>
                </div>
              ))}
              {chatMut.isPending && (
                <div className="flex gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="rounded-2xl bg-secondary px-3.5 py-2 text-sm text-muted-foreground">
                    Thinking…
                  </div>
                </div>
              )}
            </div>
            <div className="border-t border-border p-3">
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  value={chat.input}
                  onChange={(e) => setChat((c) => ({ ...c, input: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Ask the AI to draft or revise…"
                />
                <button
                  onClick={handleSend}
                  disabled={chatMut.isPending}
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">
                Preview · {platformLabel}
                {selectedPlatforms.length > 1 && (
                  <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                    +{selectedPlatforms.length - 1} more
                  </span>
                )}
              </h2>
              <div className="flex -space-x-1.5">
                {selectedPlatforms.map((p) => (
                  <PlatformIcon key={p} platform={p} className="h-6 w-6 ring-1 ring-card" />
                ))}
              </div>
            </div>
            <div className="mt-3 overflow-hidden rounded-lg border border-border">
              <div className="flex items-center gap-2 border-b border-border bg-background/40 px-3 py-2">
                <div
                  className={cn(
                    "h-8 w-8 rounded-full",
                    brand.id === "convini" ? "bg-brand-convini" : "bg-brand-ustow",
                  )}
                />
                <div>
                  <div className="text-xs font-semibold text-foreground">{brand.name}</div>
                  <div className="text-[10px] text-muted-foreground">Sponsored</div>
                </div>
              </div>
              {post.media.length > 0 ? (
                <div className="aspect-video bg-black">
                  {isVideoFormat ? (
                    <video
                      src={post.media[0]?.url}
                      className="h-full w-full object-cover"
                      controls
                    />
                  ) : post.format === "image_carousel" && post.media.length > 1 ? (
                    <CarouselPreview media={post.media} />
                  ) : (
                    <img src={post.media[0]?.url} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
              ) : (
                <div className="aspect-video bg-gradient-to-br from-secondary to-background">
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <ImageIcon className="h-8 w-8 opacity-40" />
                  </div>
                </div>
              )}
              <div className="p-3">
                <p className="text-sm text-foreground">
                  {(post.copyByPlatform?.[previewPlatform] ?? post.body) || (
                    <span className="text-muted-foreground">Your caption will appear here…</span>
                  )}
                </p>
                {post.offer && (
                  <p className="mt-2 text-xs font-medium text-primary">🎁 {post.offer}</p>
                )}
                {effectiveCta && (
                  <div className="mt-3 inline-flex rounded-md bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary">
                    {effectiveCta}
                  </div>
                )}
                {post.commentToDm && post.commentToDmKeyword && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Comment "{post.commentToDmKeyword}" to get a DM.
                  </p>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>

      <style>{`
        .input { width: 100%; border-radius: 0.5rem; border: 1px solid var(--color-border); background: var(--color-input); padding: 0.5rem 0.75rem; font-size: 0.875rem; color: var(--color-foreground); outline: none; }
        .input:focus { border-color: var(--color-ring); box-shadow: 0 0 0 2px color-mix(in oklab, var(--color-ring) 30%, transparent); }
      `}</style>
    </div>
  );
}
