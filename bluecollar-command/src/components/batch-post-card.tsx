import { useState } from "react";
import {
  Sparkles,
  X,
  Loader2,
  Image as ImageIcon,
  Wand2,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Card, StatusBadge, PlatformStack } from "@/components/shared";
import type { BrandId, SocialPost } from "@/lib/types";

interface BatchPostCardProps {
  post: SocialPost;
  brandId: BrandId;
  onUpdate: (id: string, patch: Partial<SocialPost>) => void;
  onRemove: (id: string) => void;
  onRegenerate: () => Promise<void>;
  onRequestMedia: (params: {
    brandId: BrandId;
    prompt: string;
    type: "image";
    executionId?: string;
  }) => Promise<{ mediaUrl?: string; executionId?: string; error?: string }>;
  onViewImage: (url: string) => void;
}

export function BatchPostCard({
  post,
  brandId,
  onUpdate,
  onRemove,
  onRegenerate,
  onRequestMedia,
  onViewImage,
}: BatchPostCardProps) {
  const [activeMediaPrompt, setActiveMediaPrompt] = useState(false);
  const [customPrompt, setCustomPrompt] = useState(post.title);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const mediaItem = post.media[0];
  const mediaUrl = mediaItem?.url;
  const hasMedia = Boolean(mediaUrl && mediaUrl.length > 0);
  const [imgError, setImgError] = useState(false);

  async function handleRegenerate() {
    try {
      setIsRegenerating(true);
      await onRegenerate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Regeneration failed");
    } finally {
      setIsRegenerating(false);
    }
  }

  return (
    <Card className="border border-border/80 bg-card/60 shadow-sm">
      {!post.body && (
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-200">
          <span className="font-semibold">Notice:</span> The brand agent returned no text or
          encountered an error. You can test the agent in{" "}
          <strong>Settings → Agent configuration</strong> or click "Re-prompt" / enter copy manually
          below.
        </div>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex-1 space-y-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <PlatformStack platforms={post.platforms} />
            <StatusBadge status={post.status} />
            <span className="text-[11px] text-muted-foreground">
              {post.scheduledAt &&
                new Date(post.scheduledAt).toLocaleString("en", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
            </span>
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={isRegenerating}
              className="ml-auto flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
            >
              {isRegenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Regenerate
            </button>
          </div>

          {/* Visual display & interaction */}
          {hasMedia && !imgError ? (
            <div className="relative group overflow-hidden rounded-xl border border-border bg-slate-950 transition-all hover:border-primary/50 min-h-[160px] flex items-center justify-center">
              <img
                key={mediaUrl}
                src={mediaUrl}
                alt={post.title || "Post visual"}
                className="max-h-72 w-full object-contain cursor-pointer transition-transform duration-200 group-hover:scale-[1.01]"
                onClick={() => onViewImage(mediaUrl!)}
                onError={() => {
                  console.error("Batch card image failed to load:", mediaUrl?.slice(0, 50));
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
                    onClick={() => onViewImage(mediaUrl!)}
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
            <div className="rounded-xl border border-dashed border-border/80 bg-accent/20 p-5 text-center">
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
                <Sparkles className="h-3.5 w-3.5" /> Direct AI visual
              </button>
            </div>
          )}

          {/* Interactive re-prompt box */}
          {activeMediaPrompt && (
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2">
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
                placeholder="Describe what visual to generate (e.g. flatbed truck towing luxury sedan at dusk, or sleek office micro-market grab-and-go)"
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
                        onUpdate(post.id, {
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
                        setImgError(false);
                        setActiveMediaPrompt(false);
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

          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Title</label>
            <input
              className="input mt-1"
              value={post.title}
              onChange={(e) => onUpdate(post.id, { title: e.target.value })}
            />
          </div>

          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Caption / Copy</label>
            <textarea
              className="input mt-1 min-h-20 resize-y"
              value={post.body}
              onChange={(e) => onUpdate(post.id, { body: e.target.value })}
            />
          </div>

          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-muted-foreground">
              Reschedule
            </span>
            <input
              type="datetime-local"
              className="input"
              value={post.scheduledAt ? post.scheduledAt.slice(0, 16) : ""}
              onChange={(e) =>
                onUpdate(post.id, {
                  scheduledAt: e.target.value
                    ? new Date(e.target.value).toISOString()
                    : post.scheduledAt,
                })
              }
            />
          </label>
        </div>
        <button
          onClick={() => onRemove(post.id)}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10"
        >
          <X className="h-3.5 w-3.5" /> Remove
        </button>
      </div>
    </Card>
  );
}
