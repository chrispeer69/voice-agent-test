import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  X,
  CalendarClock,
  Rocket,
  RotateCcw,
  AlertCircle,
  Sparkles,
  Loader2,
  Image as ImageIcon,
  Wand2,
  ExternalLink,
  Save,
  ChevronLeft,
  ChevronRight,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  getPosts,
  approvePost,
  denyPost,
  publishPost,
  reschedulePost,
  reviseDeniedPost,
  getApprovers,
  upsertPost,
  removePost,
  requestMedia,
} from "@/lib/marketing.functions";
import { Card, PageHeader, StatusBadge, PlatformStack } from "@/components/shared";
import type { SocialPost, PostStatus, BrandId } from "@/lib/types";

export const Route = createFileRoute("/approvals")({
  head: () => ({
    meta: [
      { title: "Approvals — Blue Collar AI Command Center" },
      {
        name: "description",
        content: "Review and approve posts before scheduling or publishing.",
      },
      { property: "og:title", content: "Approvals — Blue Collar AI Command Center" },
      { property: "og:description", content: "Review and approve posts before publishing." },
    ],
  }),
  component: ApprovalsPage,
});

const REVIEW_STATUSES: PostStatus[] = ["draft", "in_review", "approved", "denied"];

function ApprovalsPage() {
  const queryClient = useQueryClient();
  const postsQuery = useQuery({
    queryKey: ["posts", "all"],
    queryFn: () => getPosts({ data: {} }),
  });
  const approversQuery = useQuery({
    queryKey: ["approvers"],
    queryFn: () => getApprovers(),
  });
  const posts = postsQuery.data ?? [];
  const approvers = approversQuery.data ?? [];
  const pending = posts.filter((p) => REVIEW_STATUSES.includes(p.status));
  const [reviewIndex, setReviewIndex] = useState(0);
  const [discardingId, setDiscardingId] = useState<string | null>(null);
  const [discardError, setDiscardError] = useState('');
  useEffect(() => {
    const requestedId = new URLSearchParams(window.location.search).get('post');
    if (!requestedId) return;
    const found = pending.findIndex(post => post.id === requestedId);
    if (found >= 0) setReviewIndex(found);
  }, [postsQuery.data]);
  const activePost = pending[Math.min(reviewIndex, Math.max(0, pending.length - 1))];
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  const approve = useServerFn(approvePost);
  const deny = useServerFn(denyPost);
  const publish = useServerFn(publishPost);
  const reschedule = useServerFn(reschedulePost);
  const revise = useServerFn(reviseDeniedPost);
  const upsert = useServerFn(upsertPost);
  const remove = useServerFn(removePost);
  const requestMediaFn = useServerFn(requestMedia);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["posts"] });
    queryClient.invalidateQueries({ queryKey: ["analytics"] });
  };

  const approveMut = useMutation({
    mutationFn: (vars: { id: string; approverName?: string }) => approve({ data: vars }),
    onSuccess: () => {
      invalidate();
      toast.success("Approved");
    },
  });
  const denyMut = useMutation({
    mutationFn: (vars: { id: string; reason: string; approverName?: string }) =>
      deny({ data: vars }),
    onSuccess: () => {
      invalidate();
      toast.success("Denied — returned for revision");
    },
  });
  const publishMut = useMutation({
    mutationFn: (id: string) => publish({ data: { id } }),
    onSuccess: (saved) => {
      invalidate();
      if (saved.status === "failed") toast.error("Publishing failed for all platforms.");
      else if (saved.publishResults?.some((r) => !r.ok))
        toast.warning("GHL accepted some accounts; others failed. Check the results.");
      else toast.success(saved.status === "published" ? "Published" : "Submitted to GHL for processing");
    },
  });
  const rescheduleMut = useMutation({
    mutationFn: (vars: { id: string; scheduledAt: string }) => reschedule({ data: vars }),
    onSuccess: () => {
      invalidate();
      toast.success("Rescheduled");
    },
  });
  const reviseMut = useMutation({
    mutationFn: (id: string) => revise({ data: { id } }),
    onSuccess: () => {
      invalidate();
      toast.success("Returned to draft for revision");
    },
  });
  const saveMut = useMutation({
    mutationFn: (post: SocialPost) => upsert({ data: { post } }),
    onSuccess: () => {
      invalidate();
      toast.success("Post updated");
    },
  });
  const discardMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: (removed) => {
      if (!removed) { setDiscardError('This draft could not be discarded. Refresh and try again.'); return; }
      setDiscardingId(null);
      setDiscardError('');
      setReviewIndex(i => Math.max(0, i - 1));
      invalidate();
      toast.success('Draft discarded');
    },
    onError: (error) => setDiscardError(error.message),
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
      <PageHeader
        title="Approvals"
        description={`${pending.length} post${pending.length === 1 ? "" : "s"} to review across your knowledge bases`}
      />
      <div className="mt-8 space-y-4">
        {pending.length === 0 ? (
          <Card>
            <p className="py-12 text-center text-sm text-muted-foreground">
              No posts awaiting approval. Everything is reviewed.
            </p>
          </Card>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-3">
              <button type="button" aria-label="Previous post" disabled={reviewIndex === 0} onClick={() => { setReviewIndex(i => i - 1); setDiscardingId(null); }} className="rounded-lg border border-border p-2 disabled:opacity-40"><ChevronLeft className="h-5 w-5" /></button>
              <span className="text-sm font-medium">Post {Math.min(reviewIndex + 1, pending.length)} of {pending.length}</span>
              <button type="button" aria-label="Next post" disabled={reviewIndex >= pending.length - 1} onClick={() => { setReviewIndex(i => i + 1); setDiscardingId(null); }} className="rounded-lg border border-border p-2 disabled:opacity-40"><ChevronRight className="h-5 w-5" /></button>
            </div>
          {activePost && [activePost].map((p) => (
            <ApprovalRow
              key={p.id}
              post={p}
              brandId={p.brandId}
              approvers={approvers}
              onApprove={(approverName) => approveMut.mutate({ id: p.id, approverName })}
              onDeny={(reason, approverName) => denyMut.mutate({ id: p.id, reason, approverName })}
              onPublish={() => publishMut.mutate(p.id)}
              onReschedule={(at) => rescheduleMut.mutate({ id: p.id, scheduledAt: at })}
              onRevise={() => reviseMut.mutate(p.id)}
              onSave={(post) => saveMut.mutate(post)}
              onRequestMedia={(params) => requestMediaFn({ data: params })}
              onViewImage={(url) => setExpandedImage(url)}
              loading={
                approveMut.isPending ||
                denyMut.isPending ||
                publishMut.isPending ||
                saveMut.isPending
              }
            />
          ))}
          {activePost?.status === 'draft' && <div className="rounded-xl border border-border bg-card p-4">
            {discardingId === activePost.id ? <><p className="text-sm font-medium">Discard this draft? This cannot be undone.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={discardMut.isPending} onClick={() => discardMut.mutate(activePost.id)} className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50">{discardMut.isPending ? 'Discarding…' : 'Yes, discard draft'}</button><button type="button" onClick={() => setDiscardingId(null)} className="rounded-lg border border-border px-4 py-2 text-sm">Cancel</button></div></> : <button type="button" onClick={() => { setDiscardError(''); setDiscardingId(activePost.id); }} className="inline-flex items-center gap-2 text-sm text-destructive hover:underline"><Trash2 className="h-4 w-4" /> Discard draft</button>}
            {discardError && <p role="alert" className="mt-2 text-sm text-destructive">{discardError}</p>}
          </div>}
          </>
        )}
      </div>

      {/* Image Modal Preview */}
      {expandedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setExpandedImage(null)}
        >
          <div
            className="relative max-w-4xl w-full max-h-[90vh] overflow-hidden rounded-2xl border border-border bg-card p-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 px-1">
              <span className="text-sm font-semibold text-foreground">Post Visual Preview</span>
              <button
                type="button"
                onClick={() => setExpandedImage(null)}
                className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex items-center justify-center rounded-xl overflow-hidden bg-black/40">
              <img
                src={expandedImage}
                alt="Enlarged visual"
                className="max-h-[75vh] w-auto object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ApprovalRow({
  post,
  brandId,
  approvers,
  onApprove,
  onDeny,
  onPublish,
  onReschedule,
  onRevise,
  onSave,
  onRequestMedia,
  onViewImage,
  loading,
}: {
  post: SocialPost;
  brandId: BrandId;
  approvers: { id: string; name: string; email: string }[];
  onApprove: (approverName?: string) => void;
  onDeny: (reason: string, approverName?: string) => void;
  onPublish: () => void;
  onReschedule: (at: string) => void;
  onRevise: () => void;
  onSave: (post: SocialPost) => void;
  onRequestMedia: (params: {
    brandId: BrandId;
    prompt: string;
    type: "image";
    executionId?: string;
  }) => Promise<{ mediaUrl?: string; executionId?: string; error?: string }>;
  onViewImage: (url: string) => void;
  loading: boolean;
}) {
  const [at, setAt] = useState(post.scheduledAt ? post.scheduledAt.slice(0, 16) : "");
  const [denying, setDenying] = useState(false);
  const [reason, setReason] = useState("");
  const [approverId, setApproverId] = useState(approvers[0]?.id ?? "");
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(post.title);
  const [body, setBody] = useState(post.body);
  const [activeMediaPrompt, setActiveMediaPrompt] = useState(false);
  const [customPrompt, setCustomPrompt] = useState(post.title);
  const [isGenerating, setIsGenerating] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [localMedia, setLocalMedia] = useState(post.media[0]?.url ?? "");

  const canApprove = post.status === "draft" || post.status === "in_review";
  const canPublish = post.status === "approved";
  const isDenied = post.status === "denied";

  const mediaUrl = localMedia;
  const hasMedia = Boolean(mediaUrl && mediaUrl.length > 0);

  function saveEdits() {
    onSave({
      ...post,
      title,
      body,
      media: localMedia
        ? [
            {
              id: post.media[0]?.id ?? `m_${Date.now()}`,
              url: localMedia,
              type: "image",
              caption: title,
            },
          ]
        : post.media,
    });
    setEditing(false);
  }

  return (
    <Card>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <PlatformStack platforms={post.platforms} />
            <StatusBadge status={post.status} />
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {post.type}
            </span>
            {post.reviewedBy && (
              <span className="text-[11px] text-muted-foreground">
                · reviewed by {post.reviewedBy}
              </span>
            )}
          </div>

          {/* Visual display & interaction */}
          {hasMedia && !imgError ? (
            <div className="relative group overflow-hidden rounded-xl border border-border bg-slate-950 mt-3 min-h-[160px] flex items-center justify-center transition-all hover:border-primary/50">
              <img
                key={mediaUrl}
                src={mediaUrl}
                alt={post.title || "Post visual"}
                className="max-h-72 w-full object-contain cursor-pointer transition-transform duration-200 group-hover:scale-[1.01]"
                onClick={() => onViewImage(mediaUrl)}
                onError={() => {
                  console.error("Approval image failed to load:", mediaUrl?.slice(0, 50));
                  setImgError(true);
                }}
              />
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/90 via-black/70 to-transparent p-3">
                <span className="text-xs text-white/90 font-medium truncate flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" /> Branded Visual
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onViewImage(mediaUrl)}
                    className="rounded-md bg-white/15 px-2.5 py-1 text-xs font-medium text-white hover:bg-white/25 flex items-center gap-1 backdrop-blur-md transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" /> Full view
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveMediaPrompt(true);
                      setCustomPrompt(post.title);
                    }}
                    className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 flex items-center gap-1 transition-colors"
                  >
                    <Wand2 className="h-3 w-3" /> Re-prompt image
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border/80 bg-accent/20 p-5 text-center mt-3">
              <ImageIcon className="mx-auto h-7 w-7 text-muted-foreground/60" />
              <p className="mt-1.5 text-xs text-muted-foreground">
                {imgError ? "Image failed to load in preview" : "No visual attached"}
              </p>
              <button
                type="button"
                onClick={() => {
                  setImgError(false);
                  setActiveMediaPrompt(true);
                  setCustomPrompt(post.title);
                }}
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Sparkles className="h-3.5 w-3.5" /> Generate AI visual
              </button>
            </div>
          )}

          {/* Interactive re-prompt box */}
          {activeMediaPrompt && (
            <div className="mt-3 rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-primary flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5" /> Direct the AI for this post's visual
                </span>
                <button
                  type="button"
                  onClick={() => setActiveMediaPrompt(false)}
                  className="text-muted-foreground hover:text-foreground text-xs"
                >
                  Cancel
                </button>
              </div>
              <textarea
                rows={2}
                className="input text-xs"
                placeholder="Describe what visual to generate (e.g. flatbed truck towing luxury sedan at dusk)"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={isGenerating || !customPrompt.trim()}
                  onClick={async () => {
                    try {
                      setIsGenerating(true);
                      const res = await onRequestMedia({
                        brandId,
                        prompt: customPrompt,
                        type: "image",
                        executionId: post.agentExecutionId,
                      });
                      if (res.mediaUrl) {
                        setLocalMedia(res.mediaUrl);
                        setImgError(false);
                        setActiveMediaPrompt(false);
                        onSave({
                          ...post,
                          title,
                          body,
                          media: [
                            {
                              id: `m_${Date.now()}`,
                              url: res.mediaUrl,
                              type: "image",
                              caption: customPrompt,
                            },
                          ],
                          agentExecutionId: res.executionId || post.agentExecutionId,
                        });
                        toast.success("New visual generated!");
                      } else {
                        toast.error(res.error || "Failed to generate visual");
                      }
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Error generating image");
                    } finally {
                      setIsGenerating(false);
                    }
                  }}
                  className="flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {isGenerating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="h-3.5 w-3.5" />
                  )}
                  Generate new visual
                </button>
              </div>
            </div>
          )}

          {/* Inline editing of title and caption */}
          {editing ? (
            <div className="mt-3 space-y-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">Title</label>
                <input
                  className="input mt-1"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">
                  Caption / Copy
                </label>
                <textarea
                  className="input mt-1 w-full text-sm leading-relaxed"
                  rows={6}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={saveEdits}
                  disabled={loading}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" /> Save edits
                </button>
                <button
                  onClick={() => {
                    setTitle(post.title);
                    setBody(post.body);
                    setEditing(false);
                  }}
                  className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-3 flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-foreground">
                    {post.title || "Untitled"}
                  </h3>
                  <p className="mt-1.5 text-sm text-muted-foreground whitespace-pre-wrap">
                    {post.body}
                  </p>
                </div>
                <button
                  onClick={() => setEditing(true)}
                  className="shrink-0 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  ✏️ Edit
                </button>
              </div>
            </>
          )}

          {(post.offer || post.cta) && (
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              {post.offer && <span className="text-primary">🎁 {post.offer}</span>}
              {post.cta && <span className="text-muted-foreground">CTA: {post.cta}</span>}
              {post.commentToDm && (
                <span className="text-brand-convini">DM keyword: {post.commentToDmKeyword}</span>
              )}
            </div>
          )}
          {isDenied && post.denialReason && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div>
                <div className="text-xs font-semibold text-destructive">Denied</div>
                <p className="text-xs text-muted-foreground">{post.denialReason}</p>
              </div>
            </div>
          )}
          {post.publishResults && post.publishResults.length > 0 && (
            <div className="mt-3 space-y-1">
              {post.publishResults.map((r) => (
                <div key={r.platform} className="text-xs">
                  <span className="font-medium">{r.platform}:</span>{" "}
                  <span className={r.ok ? "text-success" : "text-destructive"}>
                    {r.ok ? "scheduled" : `failed — ${r.error}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2 lg:w-64">
          {approvers.length > 0 && (
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Approver
              </span>
              <select
                value={approverId}
                onChange={(e) => setApproverId(e.target.value)}
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground"
              >
                {approvers.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-muted-foreground">
              Schedule for
            </span>
            <input
              type="datetime-local"
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground"
              value={at}
              onChange={(e) => setAt(e.target.value)}
            />
          </label>

          {denying ? (
            <div className="space-y-2 rounded-lg border border-destructive/30 p-2.5">
              <textarea
                autoFocus
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Denial reason (required)…"
                className="min-h-16 w-full rounded-md border border-border bg-input px-2.5 py-2 text-xs text-foreground"
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    onDeny(reason, approvers.find((a) => a.id === approverId)?.name);
                    setDenying(false);
                    setReason("");
                  }}
                  disabled={!reason.trim() || loading}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-destructive px-3 py-2 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" /> Confirm deny
                </button>
                <button
                  onClick={() => setDenying(false)}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium hover:bg-accent"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onApprove(approvers.find((a) => a.id === approverId)?.name)}
                disabled={!canApprove || loading}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-xs font-medium text-success hover:bg-success/20 disabled:opacity-40"
              >
                <Check className="h-3.5 w-3.5" /> Approve
              </button>
              <button
                onClick={() => setDenying(true)}
                disabled={isDenied || loading}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/20 disabled:opacity-40"
              >
                <X className="h-3.5 w-3.5" /> Deny
              </button>
            </div>
          )}

          <button
            disabled={!at}
            onClick={() => onReschedule(new Date(at).toISOString())}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium hover:bg-accent disabled:opacity-50"
          >
            <CalendarClock className="h-3.5 w-3.5" /> Reschedule
          </button>
          {canPublish && (
            <button
              onClick={onPublish}
              disabled={loading}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Rocket className="h-3.5 w-3.5" /> Publish now
            </button>
          )}
          {isDenied && (
            <button
              onClick={onRevise}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium hover:bg-accent"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Revise (return to draft)
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}
