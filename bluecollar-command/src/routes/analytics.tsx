import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, AlertCircle, Lightbulb } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { useBrand } from "@/lib/brand-context";
import { getAnalytics, getCampaigns, getPosts } from "@/lib/marketing.functions";
import { Card, PageHeader, Stat, PlatformIcon, PlatformStack } from "@/components/shared";
import { PLATFORMS } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Blue Collar AI Command Center" },
      {
        name: "description",
        content: "Performance by brand, campaign, platform, and post with AI recommendations.",
      },
      { property: "og:title", content: "Analytics — Blue Collar AI Command Center" },
      {
        property: "og:description",
        content: "Performance by brand, campaign, platform, and post.",
      },
    ],
  }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { brand } = useBrand();
  const analyticsQuery = useQuery({
    queryKey: ["analytics", brand.id],
    queryFn: () => getAnalytics({ data: { brandId: brand.id } }),
  });
  const campaignsQuery = useQuery({
    queryKey: ["campaigns", brand.id],
    queryFn: () => getCampaigns({ data: { brandId: brand.id } }),
  });
  const postsQuery = useQuery({
    queryKey: ["posts", brand.id],
    queryFn: () => getPosts({ data: { brandId: brand.id } }),
  });

  const summary = analyticsQuery.data?.summary ?? [];
  const recommendations = analyticsQuery.data?.recommendations ?? [];
  const campaigns = campaignsQuery.data ?? [];
  const posts = postsQuery.data ?? [];

  const totalReach = summary.reduce((n, s) => n + s.reach, 0);
  const totalEngagement = summary.reduce((n, s) => n + s.engagement, 0);
  const totalComments = summary.reduce((n, s) => n + s.comments, 0);

  const chartData = summary.map((s) => ({
    platform: PLATFORMS.find((p) => p.id === s.platform)?.label ?? s.platform,
    Reach: s.reach,
    Engagement: s.engagement,
  }));

  // Per-campaign performance
  const campaignPerf = campaigns.map((c) => {
    const cPosts = posts.filter((p) => p.campaignId === c.id);
    const platformSum = cPosts.reduce((acc, p) => {
      const s = summary.find((x) => p.platforms.includes(x.platform));
      if (s)
        acc +=
          s.reach / Math.max(1, summary.filter((x) => p.platforms.includes(x.platform)).length);
      return acc;
    }, 0);
    return { name: c.name, posts: cPosts.length, reach: Math.round(platformSum) };
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
      {(analyticsQuery.error) && <p role="alert" className="mb-4 rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{(analyticsQuery.error)?.message}</p>}
      <PageHeader
        title="Analytics"
        description={`Performance for ${brand.name} by campaign, platform, and post`}
      />

      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total reach" value={totalReach.toLocaleString()} accent="text-primary" />
        <Stat label="Engagement" value={totalEngagement.toLocaleString()} />
        <Stat label="Comments" value={totalComments} accent="text-brand-convini" />
        <Stat label="Reporting window" value="Last 7 days" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="text-base font-semibold text-foreground">Performance by platform</h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.08)" />
                <XAxis dataKey="platform" stroke="oklch(0.7 0.025 250)" fontSize={12} />
                <YAxis stroke="oklch(0.7 0.025 250)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "0.5rem",
                    fontSize: "0.8rem",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
                <Bar dataKey="Reach" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Engagement" fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h2 className="text-base font-semibold text-foreground">Publishing status</h2>
          <div className="mt-4 space-y-3">
            {summary.map((s) => (
              <div key={s.platform} className="flex items-center gap-3">
                <PlatformIcon platform={s.platform} />
                <div className="flex-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Published</span>
                    <span className="font-medium text-foreground">{s.publishedCount}</span>
                  </div>
                  <div className="mt-1 flex justify-between text-xs">
                    <span className="text-muted-foreground">Scheduled</span>
                    <span className="font-medium text-foreground">{s.scheduledCount}</span>
                  </div>
                  <div className="mt-1 flex justify-between text-xs">
                    <span className="text-muted-foreground">Drafts</span>
                    <span className="font-medium text-foreground">{s.draftCount}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Campaign performance */}
      {campaignPerf.length > 0 && (
        <Card className="mt-6">
          <h2 className="text-base font-semibold text-foreground">Campaign performance</h2>
          <div className="mt-4 space-y-2">
            {campaignPerf.map((c) => (
              <div
                key={c.name}
                className="flex items-center gap-3 rounded-lg border border-border bg-background/40 p-3"
              >
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">{c.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.posts} posts · est. {c.reach.toLocaleString()} reach
                  </div>
                </div>
                <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${Math.min(100, (c.reach / Math.max(1, totalReach)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Top posts */}
      <Card className="mt-6">
        <h2 className="text-base font-semibold text-foreground">Top posts</h2>
        <div className="mt-4 space-y-2">
          {posts
            .filter((p) => p.status === "published")
            .slice(0, 5)
            .map((p) => {
              const s = summary.find((x) => p.platforms.includes(x.platform));
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-background/40 p-3"
                >
                  <PlatformStack platforms={p.platforms} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {p.title || p.type}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {(s?.reach ?? 0).toLocaleString()} reach ·{" "}
                      {(s?.engagement ?? 0).toLocaleString()} engagement
                    </div>
                  </div>
                </div>
              );
            })}
          {posts.filter((p) => p.status === "published").length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No published posts yet.
            </p>
          )}
        </div>
      </Card>

      {/* AI recommendations */}
      <Card className="mt-6">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-warning" />
          <h2 className="text-base font-semibold text-foreground">AI-generated recommendations</h2>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {recommendations.map((r) => (
            <div key={r.id} className="rounded-lg border border-border bg-background/40 p-4">
              <div className="flex items-center gap-2">
                <AlertCircle
                  className={cn(
                    "h-4 w-4",
                    r.priority === "high"
                      ? "text-destructive"
                      : r.priority === "medium"
                        ? "text-warning"
                        : "text-muted-foreground",
                  )}
                />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {r.priority} priority
                </span>
              </div>
              <p className="mt-2 text-sm font-medium text-foreground">{r.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{r.detail}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
