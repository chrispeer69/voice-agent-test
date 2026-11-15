import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Send, MessageCircle, ArrowRight } from "lucide-react";
import { useBrand } from "@/lib/brand-context";
import { getComments, replyToComment, getPosts } from "@/lib/marketing.functions";
import { Card, PageHeader, PlatformIcon } from "@/components/shared";
import { PLATFORMS } from "@/lib/types";
import type { Platform } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/comments")({
  head: () => ({
    meta: [
      { title: "Comments — Blue Collar AI Command Center" },
      {
        name: "description",
        content: "Post comments and comment-to-DM activity by brand and platform.",
      },
      { property: "og:title", content: "Comments — Blue Collar AI Command Center" },
      { property: "og:description", content: "Post comments and comment-to-DM activity." },
    ],
  }),
  component: CommentsPage,
});

function CommentsPage() {
  const { brand } = useBrand();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<"all" | "brand">("all");
  const [platformFilter, setPlatformFilter] = useState<Platform | "all">("all");

  const commentsQuery = useQuery({
    queryKey: ["comments", scope === "all" ? "all" : brand.id, platformFilter],
    queryFn: () =>
      getComments({
        data: {
          brandId: scope === "all" ? undefined : brand.id,
          platform: platformFilter === "all" ? undefined : platformFilter,
        },
      }),
  });
  const postsQuery = useQuery({
    queryKey: ["posts", scope === "all" ? "all" : brand.id],
    queryFn: () => getPosts({ data: scope === "all" ? {} : { brandId: brand.id } }),
  });
  const comments = commentsQuery.data ?? [];
  const posts = postsQuery.data ?? [];

  const reply = useServerFn(replyToComment);
  const replyMut = useMutation({
    mutationFn: (vars: { commentId: string; postId: string; text: string }) =>
      reply({ data: { ...vars, author: brand.name } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["comments"] }),
    onError: error => toast.error(error.message),
  });



  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
      {(commentsQuery.error) && <p role="alert" className="mb-4 rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{(commentsQuery.error)?.message}</p>}
      <PageHeader
        title="Comments"
        description={`${comments.length} comments · ${scope === "all" ? "Entire subaccount" : brand.name}. Replies are sent through the connected social profile.`}
      />

      <p className="mt-3 text-sm text-muted-foreground">Facebook, Instagram, and LinkedIn comments synced by GHL are supported. Google reviews and direct messages are not included.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Scope
          <select aria-label="Comment scope" value={scope} onChange={e => setScope(e.target.value as "all" | "brand")} className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground">
            <option value="all">Entire subaccount</option><option value="brand">{brand.name}</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Platform</span>
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value as Platform | "all")}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground"
          >
            <option value="all">All platforms</option>
            {PLATFORMS.filter(p => ["facebook", "instagram", "linkedin"].includes(p.id)).map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-6 space-y-3">
        {comments.length === 0 ? (
          <Card>
            <p className="py-12 text-center text-sm text-muted-foreground">
              {commentsQuery.isLoading ? "Loading GHL comments…" : "No synced comments match this scope and platform. Check comment sync in GHL if you expect comments here."}
            </p>
          </Card>
        ) : (
          comments.map((c) => {
            const post = posts.find((p) => p.id === c.postId);
            return (
              <CommentRow
                key={c.id}
                comment={c}
                postTitle={post?.title ?? "Unknown post"}
                onReply={(text) => replyMut.mutate({ commentId: c.id, postId: c.postId, text })}
                pending={replyMut.isPending}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

function CommentRow({
  comment,
  postTitle,
  onReply,
  pending,
}: {
  comment: import("@/lib/types").Comment;
  postTitle: string;
  onReply: (text: string) => void;
  pending: boolean;
}) {
  const [reply, setReply] = useState("");
  const [showReply, setShowReply] = useState(false);
  return (
    <Card>
      <div className="flex items-start gap-3">
        <PlatformIcon platform={comment.platform} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{comment.author}</span>
            <span className="text-[11px] text-muted-foreground">
              {new Date(comment.createdAt).toLocaleDateString("en", {
                month: "short",
                day: "numeric",
              })}
            </span>
            {comment.isDmTriggered && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-convini/15 px-2 py-0.5 text-[10px] font-medium text-brand-convini">
                <ArrowRight className="h-2.5 w-2.5" /> Comment-to-DM
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-foreground">{comment.text}</p>
          <p className="mt-1.5 text-[11px] text-muted-foreground">On: {postTitle}</p>

          {comment.reply && (
            <div className="mt-3 rounded-lg border border-border bg-background/40 p-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-primary">{comment.replyAuthor}</span>
                <span className="text-[10px] text-muted-foreground">
                  {comment.repliedAt
                    ? new Date(comment.repliedAt).toLocaleString("en", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })
                    : ""}
                </span>
              </div>
              <p className="mt-1 text-sm text-foreground">{comment.reply}</p>
            </div>
          )}

          {!comment.reply && (
            <div className="mt-3">
              {!showReply ? (
                <button
                  onClick={() => setShowReply(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                >
                  <MessageCircle className="h-3.5 w-3.5" /> Reply
                </button>
              ) : (
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Write a reply…"
                  />
                  <button
                    disabled={!reply.trim() || pending}
                    onClick={() => {
                      onReply(reply.trim());
                      setReply("");
                      setShowReply(false);
                    }}
                    className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
