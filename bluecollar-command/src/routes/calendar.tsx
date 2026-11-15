import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useBrand } from "@/lib/brand-context";
import {
  getPosts,
  getCampaigns,
  reschedulePost,
  approvePost,
  publishPost,
} from "@/lib/marketing.functions";
import { Card, PageHeader, StatusBadge, PlatformStack } from "@/components/shared";
import { PLATFORMS, STATUS_META } from "@/lib/types";
import type { Platform, PostStatus, SocialPost } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Content Calendar — Blue Collar AI Command Center" },
      {
        name: "description",
        content: "Month, week, and list views of scheduled and published social posts.",
      },
      { property: "og:title", content: "Content Calendar — Blue Collar AI Command Center" },
      { property: "og:description", content: "Month, week, and list views of social posts." },
    ],
  }),
  component: CalendarPage,
});

type View = "month" | "week" | "list";

function CalendarPage() {
  const { brand } = useBrand();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<"all" | "brand">("all");
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [platformFilter, setPlatformFilter] = useState<Platform | "all">("all");
  const [statusFilter, setStatusFilter] = useState<PostStatus | "all">("all");
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [selected, setSelected] = useState<SocialPost | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const postsQuery = useQuery({
    queryKey: ["posts", scope === "all" ? "all" : brand.id],
    queryFn: () => getPosts({ data: scope === "all" ? {} : { brandId: brand.id } }),
  });
  const campaignsQuery = useQuery({
    queryKey: ["campaigns", scope === "all" ? "all" : brand.id],
    queryFn: () => getCampaigns({ data: scope === "all" ? {} : { brandId: brand.id } }),
  });
  const campaigns = campaignsQuery.data ?? [];

  const reschedule = useServerFn(reschedulePost);
  const approve = useServerFn(approvePost);
  const publish = useServerFn(publishPost);

  const rescheduleMut = useMutation({
    mutationFn: (vars: { id: string; scheduledAt: string }) => reschedule({ data: vars }),
    onSuccess: () => {
      toast.success("Post rescheduled");
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to reschedule");
    },
  });
  const approveMut = useMutation({
    mutationFn: (id: string) => approve({ data: { id } }),
    onSuccess: () => {
      toast.success("Post approved");
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to approve");
    },
  });
  const publishMut = useMutation({
    mutationFn: (id: string) => publish({ data: { id } }),
    onSuccess: (res) => {
      if (res.status === "failed") {
        const err =
          res.publishResults?.find((r) => !r.ok)?.error || "Failed to publish to Social Planner";
        toast.error(`Social Planner Error: ${err}`);
      } else {
        toast.success("Successfully pushed to Social Planner!");
      }
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to publish to Social Planner");
    },
  });

  const posts = useMemo(() => {
    const all = postsQuery.data ?? [];
    return all.filter(
      (p) =>
        (platformFilter === "all" || p.platforms.includes(platformFilter)) &&
        (statusFilter === "all" || p.status === statusFilter) &&
        (campaignFilter === "all" || p.campaignId === campaignFilter),
    );
  }, [postsQuery.data, platformFilter, statusFilter, campaignFilter]);

  function postDate(p: SocialPost): Date {
    const iso = p.scheduledAt || p.publishedAt || p.createdAt;
    if (iso) {
      const d = new Date(iso);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  }

  function sameDay(a: Date, b: Date) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  function handleDrop(targetDate: Date) {
    if (!dragId) return;
    const p = posts.find((x) => x.id === dragId);
    if (!p) return;
    targetDate.setHours(10, 0, 0, 0);
    rescheduleMut.mutate({ id: p.id, scheduledAt: targetDate.toISOString() });
    setDragId(null);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
      {(postsQuery.error) && <p role="alert" className="mb-4 rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{(postsQuery.error)?.message}</p>}
      <PageHeader
        title="Content calendar"
        description={scope === "all" ? "All posts from this GHL subaccount, including existing published posts" : `Posts assigned to ${brand.name}`}
      >
        <div className="flex rounded-lg border border-border p-0.5">
          {(["month", "week", "list"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                view === v
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </PageHeader>

      <p className="mt-4 text-sm text-muted-foreground">
        {postsQuery.isLoading ? "Loading GHL posts…" : `${posts.length} posts match your filters. Month and week views show only the selected dates; List shows all dates.`}
      </p>
      {/* Filters */}
      <div className="mt-6 flex flex-wrap gap-3">
        <FilterSelect
          label="Scope"
          value={scope}
          onChange={(value) => { setScope(value as "all" | "brand"); setCampaignFilter("all"); }}
          options={[{ value: "all", label: "Entire subaccount" }, { value: "brand", label: brand.name }]}
        />
        <FilterSelect
          label="Platform"
          value={platformFilter}
          onChange={(v) => setPlatformFilter(v as Platform | "all")}
          options={[
            { value: "all", label: "All platforms" },
            ...PLATFORMS.map((p) => ({ value: p.id, label: p.label })),
          ]}
        />
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as PostStatus | "all")}
          options={[
            { value: "all", label: "All statuses" },
            ...Object.entries(STATUS_META).map(([k, m]) => ({ value: k, label: m.label })),
          ]}
        />
        <FilterSelect
          label="Campaign"
          value={campaignFilter}
          onChange={(v) => setCampaignFilter(v)}
          options={[
            { value: "all", label: "All campaigns" },
            ...campaigns.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      </div>

      {/* Navigation */}
      {view !== "list" && (
        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={() => setCursor((prev) => addInterval(prev, view, -1))}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:bg-accent"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-foreground">{navLabel(cursor, view)}</span>
          <button
            onClick={() => setCursor((prev) => addInterval(prev, view, 1))}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:bg-accent"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Month view */}
      {view === "month" && (
        <div className="mt-4 overflow-hidden rounded-xl border border-border">
          <div className="grid grid-cols-7 border-b border-border bg-card">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div
                key={d}
                className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthDays(cursor).map((day, i) => {
              const dayPosts = posts.filter((p) => {
                const d = postDate(p);
                return sameDay(d, day);
              });
              const inMonth = day.getMonth() === cursor.getMonth();
              return (
                <div
                  key={i}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(day)}
                  className={cn(
                    "min-h-28 border-b border-r border-border p-1.5",
                    !inMonth && "bg-background/40 opacity-50",
                  )}
                >
                  <div className="text-[11px] font-medium text-muted-foreground">
                    {day.getDate()}
                  </div>
                  <div className="mt-1 space-y-1">
                    {dayPosts.slice(0, 3).map((p) => (
                      <button
                        key={p.id}
                        draggable
                        onDragStart={() => setDragId(p.id)}
                        onClick={() => setSelected(p)}
                        className={cn(
                          "flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-[10px] font-medium transition-colors hover:opacity-80",
                          STATUS_META[p.status].badge,
                        )}
                      >
                        <PlatformStack platforms={p.platforms} iconClassName="h-4 w-4" />
                        <span className="truncate">{p.title || p.type}</span>
                      </button>
                    ))}
                    {dayPosts.length > 3 && (
                      <div className="px-1.5 text-[10px] text-muted-foreground">
                        +{dayPosts.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Week view */}
      {view === "week" && (
        <div className="mt-4 grid grid-cols-7 gap-2">
          {weekDays(cursor).map((day, i) => {
            const dayPosts = posts.filter((p) => {
              const d = postDate(p);
              return sameDay(d, day);
            });
            return (
              <div
                key={i}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(day)}
                className="min-h-48 rounded-xl border border-border bg-card p-2"
              >
                <div className="text-xs font-semibold text-foreground">
                  {day.toLocaleDateString("en", { weekday: "short" })}
                </div>
                <div className="text-[11px] text-muted-foreground">{day.getDate()}</div>
                <div className="mt-2 space-y-1.5">
                  {dayPosts.map((p) => (
                    <button
                      key={p.id}
                      draggable
                      onDragStart={() => setDragId(p.id)}
                      onClick={() => setSelected(p)}
                      className={cn(
                        "w-full rounded-lg p-2 text-left text-[11px] transition-colors hover:opacity-80",
                        STATUS_META[p.status].badge,
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <PlatformStack platforms={p.platforms} iconClassName="h-4 w-4" />
                        <span className="truncate font-medium">{p.title || p.type}</span>
                      </div>
                      {p.scheduledAt && (
                        <div className="mt-1 text-[10px] opacity-70">
                          {new Date(p.scheduledAt).toLocaleTimeString("en", {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </div>
                      )}
                    </button>
                  ))}
                  {dayPosts.length === 0 && (
                    <div className="py-4 text-center text-[10px] text-muted-foreground">
                      Drop here
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List view */}
      {view === "list" && (
        <div className="mt-4 space-y-2">
          {posts.length === 0 ? (
            <Card>
              <p className="py-8 text-center text-sm text-muted-foreground">
                No posts match these filters.
              </p>
            </Card>
          ) : (
            posts
              .slice()
              .sort((a, b) => {
                const da = postDate(a)?.getTime() ?? 0;
                const db = postDate(b)?.getTime() ?? 0;
                return db - da;
              })
              .map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelected(p)}
                  className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent"
                >
                  <PlatformStack platforms={p.platforms} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {p.title || p.type}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {(p.scheduledAt ?? p.publishedAt)
                        ? new Date(p.scheduledAt ?? p.publishedAt!).toLocaleString("en", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })
                        : "Unscheduled"}
                    </div>
                  </div>
                  <StatusBadge status={p.status} />
                </button>
              ))
          )}
        </div>
      )}

      {selected && (
        <PostDrawer
          post={selected}
          publishing={publishMut.isPending}
          onClose={() => setSelected(null)}
          onApprove={(id) => {
            approveMut.mutate(id);
            setSelected(null);
          }}
          onPublish={(id) => {
            publishMut.mutate(id);
          }}
          onReschedule={(id, at) => {
            rescheduleMut.mutate({ id, scheduledAt: at });
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}

function PostDrawer({
  post,
  onClose,
  onApprove,
  onPublish,
  onReschedule,
  publishing,
}: {
  post: SocialPost;
  onClose: () => void;
  onApprove: (id: string) => void;
  onPublish: (id: string) => void;
  onReschedule: (id: string, at: string) => void;
  publishing?: boolean;
}) {
  const [at, setAt] = useState(() => {
    try {
      if (post.scheduledAt) {
        const d = new Date(post.scheduledAt);
        if (!isNaN(d.getTime())) return d.toISOString().slice(0, 16);
      }
    } catch {
      // fallback
    }
    return "";
  });
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Post detail</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-accent">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <PlatformStack platforms={post.platforms} />
          <StatusBadge status={post.status} />
        </div>
        <h3 className="mt-3 text-sm font-semibold text-foreground">{post.title || post.type}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{post.body}</p>
        {post.offer && <p className="mt-2 text-xs font-medium text-primary">🎁 {post.offer}</p>}
        {post.cta && <p className="mt-1 text-xs text-muted-foreground">CTA: {post.cta}</p>}
        {post.commentToDm && (
          <p className="mt-2 text-xs text-brand-convini">
            Comment-to-DM keyword: {post.commentToDmKeyword}
          </p>
        )}
        {post.scheduledAt && (
          <p className="mt-3 text-xs text-muted-foreground">
            Scheduled:{" "}
            {new Date(post.scheduledAt).toLocaleString("en", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        )}

        <div className="mt-5 space-y-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Schedule / Reschedule (Date Picker)
            </span>
            <input
              type="datetime-local"
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground [color-scheme:dark]"
              value={at}
              onChange={(e) => setAt(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => {
                const d = new Date();
                d.setHours(d.getHours() + 2);
                setAt(d.toISOString().slice(0, 16));
              }}
              className="rounded-md border border-border bg-card px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent"
            >
              +2 Hours
            </button>
            <button
              type="button"
              onClick={() => {
                const d = new Date();
                d.setDate(d.getDate() + 1);
                d.setHours(10, 0, 0, 0);
                setAt(d.toISOString().slice(0, 16));
              }}
              className="rounded-md border border-border bg-card px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent"
            >
              Tomorrow 10 AM
            </button>
            <button
              type="button"
              onClick={() => {
                const d = new Date();
                d.setDate(d.getDate() + 2);
                d.setHours(14, 0, 0, 0);
                setAt(d.toISOString().slice(0, 16));
              }}
              className="rounded-md border border-border bg-card px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent"
            >
              In 2 Days 2 PM
            </button>
          </div>
          <button
            disabled={!at}
            onClick={() => onReschedule(post.id, new Date(at).toISOString())}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            Reschedule
          </button>
          <button
            onClick={() => onApprove(post.id)}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            Approve
          </button>
          <button
            onClick={() => onPublish(post.id)}
            disabled={publishing}
            className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50"
          >
            {publishing ? "Pushing to Social Planner…" : "Publish to Social Planner now"}
          </button>

          {post.publishResults && post.publishResults.length > 0 && (
            <div className="mt-3 space-y-1.5 text-xs">
              <div className="font-semibold text-muted-foreground">Social Planner Sync Status:</div>
              {post.publishResults.map((r, i) => (
                <div
                  key={i}
                  className={cn(
                    "p-2 rounded border",
                    r.ok
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : "bg-destructive/10 border-destructive/30 text-destructive",
                  )}
                >
                  <span className="font-semibold capitalize">{r.platform}: </span>
                  {r.ok ? `Synced to Social Planner (ID: ${r.ghlPostId || "OK"})` : r.error}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// ---- date helpers ----
function prevDate(fn: (prev: Date) => Date): Date {
  return fn(new Date());
}
function addInterval(d: Date, view: View, dir: number): Date {
  const n = new Date(d);
  if (view === "month") n.setMonth(n.getMonth() + dir);
  else n.setDate(n.getDate() + dir * 7);
  return n;
}
function navLabel(d: Date, view: View): string {
  return view === "month"
    ? d.toLocaleDateString("en", { month: "long", year: "numeric" })
    : `${weekDays(d)[0].toLocaleDateString("en", { month: "short", day: "numeric" })} – ${weekDays(d)[6].toLocaleDateString("en", { month: "short", day: "numeric" })}`;
}
function monthDays(d: Date): Date[] {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const start = new Date(first);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    return day;
  });
}
function weekDays(d: Date): Date[] {
  const start = new Date(d);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    return day;
  });
}
