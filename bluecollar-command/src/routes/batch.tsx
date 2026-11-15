import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarRange,
  Sparkles,
  Check,
  X,
  CalendarClock,
  AlertTriangle,
  Loader2,
  Image as ImageIcon,
  Save,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { useBrand } from "@/lib/brand-context";
import {
  getCampaigns,
  upsertCampaign,
  upsertPost,
  approvePost,
  scheduleApprovedBatch,
  getSocialAccounts,
  generateBatchPosts,
  requestMedia,
  regeneratePost,
} from "@/lib/marketing.functions";
import { Card, PageHeader } from "@/components/shared";
import { AccountMultiSelect } from "@/components/create-widgets";
import { BatchPostCard } from "@/components/batch-post-card";
import {
  OBJECTIVES,
  type CampaignObjective,
  type CampaignCadence,
  type SocialPost,
  type SocialAccount,
  type Campaign,
} from "@/lib/types";

export const Route = createFileRoute("/batch")({
  head: () => ({
    meta: [
      { title: "Batch Planning — Blue Collar AI Command Center" },
      {
        name: "description",
        content: "Generate multiple posts for a date range as one campaign.",
      },
      { property: "og:title", content: "Batch Planning — Blue Collar AI Command Center" },
      { property: "og:description", content: "Generate a batch of posts as one campaign." },
    ],
  }),
  component: BatchPage,
});

const CADENCE_LABEL: Record<CampaignCadence, string> = {
  one_time: "One-time",
  weekly: "Weekly",
  monthly: "Monthly",
};

function BatchPage() {
  const { brand } = useBrand();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [objective, setObjective] = useState<CampaignObjective>("awareness");
  const [cadence, setCadence] = useState<CampaignCadence>("weekly");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [postCount, setPostCount] = useState(5);
  const [brief, setBrief] = useState("");
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [generated, setGenerated] = useState<SocialPost[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  const accountsQuery = useQuery({
    queryKey: ["socialAccounts"],
    queryFn: () => getSocialAccounts(),
  });
  const accounts: SocialAccount[] = accountsQuery.data?.accounts ?? [];
  const accountsError = accountsQuery.data?.error;
  const noAccounts = !accountsQuery.isLoading && accounts.length === 0;

  const upsertCampaignFn = useServerFn(upsertCampaign);
  const upsertPostFn = useServerFn(upsertPost);
  const approveFn = useServerFn(approvePost);
  const scheduleBatchFn = useServerFn(scheduleApprovedBatch);
  const generateBatchFn = useServerFn(generateBatchPosts);
  const requestMediaFn = useServerFn(requestMedia);
  const regenerateFn = useServerFn(regeneratePost);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["posts", brand.id] });
    queryClient.invalidateQueries({ queryKey: ["campaigns", brand.id] });
    queryClient.invalidateQueries({ queryKey: ["analytics", brand.id] });
  };

  // Posting frequency derived from cadence + date span + count.
  const frequency = (() => {
    const start = startDate ? new Date(startDate) : new Date();
    const end = endDate ? new Date(endDate) : new Date(Date.now() + 14 * 86400000);
    const spanDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
    const n = Math.min(Math.max(postCount, 1), 20);
    const every = Math.max(1, Math.floor(spanDays / n));
    if (cadence === "weekly") return `~1 post every ${every} day(s)`;
    if (cadence === "monthly") return `~${n} posts across the month`;
    return `${n} posts over ${spanDays} day(s)`;
  })();

  const generateMut = useMutation({
    mutationFn: async () => {
      if (selectedAccountIds.length === 0) {
        throw new Error("Select at least one connected account before generating.");
      }
      return generateBatchFn({
        data: {
          brandId: brand.id,
          brief,
          count: postCount,
          startDate,
          endDate,
          objective,
          accountIds: selectedAccountIds,
          cadence,
        },
      });
    },
    onSuccess: (data) => {
      setGenerated(data.posts);
      if (data.error) {
        toast.error(`Agent notice: ${data.error}`, { duration: 8000 });
      } else {
        toast.success(`Generated ${data.posts.length} posts with AI copy and visuals`);
      }
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Generation failed", { duration: 8000 });
    },
  });

  function updatePost(id: string, patch: Partial<SocialPost>) {
    setGenerated((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }
  function removePost(id: string) {
    setGenerated((prev) => prev.filter((p) => p.id !== id));
  }
  async function regeneratePostById(id: string) {
    const target = generated.find((p) => p.id === id);
    if (!target) return;
    const result = await regenerateFn({ data: { post: target } });
    if (result.error) toast.warning(`Regeneration: ${result.error}`, { duration: 8000 });
    setGenerated((prev) => prev.map((p) => (p.id === id ? result.post : p)));
  }

  const saveAndScheduleMut = useMutation({
    mutationFn: async () => {
      const campId = `camp_${Math.random().toString(36).slice(2, 10)}`;
      const campaign: Campaign = {
        id: campId,
        brandId: brand.id,
        name: name || "Batch campaign",
        objective,
        cadence,
        startDate: startDate ? new Date(startDate).toISOString() : new Date().toISOString(),
        endDate: endDate ? new Date(endDate).toISOString() : undefined,
        postCount: generated.length,
        description: brief,
      };
      await upsertCampaignFn({ data: { campaign } });

      for (const p of generated) {
        await upsertPostFn({ data: { post: { ...p, campaignId: campId } } });
      }

      for (const p of generated) {
        await approveFn({ data: { id: p.id } });
      }

      const report = await scheduleBatchFn({ data: { brandId: brand.id } });
      return { campId, report };
    },
    onSuccess: (data) => {
      invalidate();
      const failed = data.report.filter((r) => !r.ok);
      if (failed.length === 0 && data.report.length > 0) {
        toast.success(`Scheduled ${data.report.length} posts`);
      } else if (failed.length > 0) {
        toast.warning(`${data.report.length - failed.length} scheduled, ${failed.length} failed`);
      } else {
        toast.success("Batch saved and approved");
      }
      setConfirming(false);
      navigate({ to: "/calendar" });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Batch save failed");
      setConfirming(false);
    },
  });

  // Save the generated batch as drafts only — nothing is approved or scheduled.
  // The user can then review, edit, and approve each draft individually from the
  // Calendar or Approvals page.
  const saveAsDraftsMut = useMutation({
    mutationFn: async () => {
      const campId = `camp_${Math.random().toString(36).slice(2, 10)}`;
      const campaign: Campaign = {
        id: campId,
        brandId: brand.id,
        name: name || "Batch campaign",
        objective,
        cadence,
        startDate: startDate ? new Date(startDate).toISOString() : new Date().toISOString(),
        endDate: endDate ? new Date(endDate).toISOString() : undefined,
        postCount: generated.length,
        description: brief,
      };
      await upsertCampaignFn({ data: { campaign } });
      for (const p of generated) {
        // Persist each as a draft — no approval, no scheduling, no live action.
        await upsertPostFn({
          data: { post: { ...p, campaignId: campId, status: "draft" } },
        });
      }
      return { campId, count: generated.length };
    },
    onSuccess: (data) => {
      invalidate();
      toast.success(`Saved ${data.count} drafts`);
      setGenerated([]);
      navigate({ to: "/approvals" });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Could not save drafts");
    },
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
      <PageHeader
        title="Batch planning"
        description={`Generate multiple posts for ${brand.name} as one campaign, then approve and schedule.`}
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* Config */}
        <Card>
          <div className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold text-foreground">Campaign brief</h2>
          </div>
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Campaign name
              </span>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. October Dispatch Push"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Objective
                </span>
                <select
                  className="input"
                  value={objective}
                  onChange={(e) => setObjective(e.target.value as CampaignObjective)}
                >
                  {OBJECTIVES.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Cadence
                </span>
                <select
                  className="input"
                  value={cadence}
                  onChange={(e) => setCadence(e.target.value as CampaignCadence)}
                >
                  <option value="one_time">One-time</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Start date
                </span>
                <input
                  type="date"
                  className="input"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  End date
                </span>
                <input
                  type="date"
                  className="input"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Number of posts: {postCount}
              </span>
              <input
                type="range"
                min={1}
                max={20}
                value={postCount}
                onChange={(e) => setPostCount(Number(e.target.value))}
                className="w-full accent-[var(--color-primary)]"
              />
            </label>
            <div className="rounded-lg border border-border bg-accent/40 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Posting frequency:</span> {frequency} ·{" "}
              {CADENCE_LABEL[cadence]} campaign
            </div>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Content brief
              </span>
              <textarea
                className="input min-h-24 resize-y"
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="Describe the theme and messaging for this batch…"
              />
            </label>

            <AccountMultiSelect
              accounts={accounts}
              selectedAccountIds={selectedAccountIds}
              loading={accountsQuery.isLoading}
              noAccounts={noAccounts}
              error={accountsError}
              onChange={setSelectedAccountIds}
            />

            <button
              onClick={() => generateMut.mutate()}
              disabled={generateMut.isPending || selectedAccountIds.length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {generateMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Generate batch preview
            </button>
            {selectedAccountIds.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Select at least one connected account to generate posts for it.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              The brand AI writes each caption and generates a visual. The batch appears on the
              calendar preview before anything is saved. You can edit, remove, re-prompt images, or
              reschedule each post individually.
            </p>
          </div>
        </Card>

        {/* Preview / generated batch */}
        <div className="space-y-4">
          {generated.length === 0 ? (
            <Card>
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <CalendarRange className="h-10 w-10 text-muted-foreground/40" />
                <p className="mt-3 text-sm text-muted-foreground">
                  Configure a brief and generate a batch preview. Nothing is saved until you
                  approve.
                </p>
              </div>
            </Card>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-foreground">
                  Generated batch · {generated.length} posts
                </h2>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => saveAsDraftsMut.mutate()}
                    disabled={saveAsDraftsMut.isPending}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
                  >
                    {saveAsDraftsMut.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 text-primary" />
                    )}{" "}
                    Save as drafts
                  </button>
                  <button
                    onClick={() => setConfirming(true)}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent"
                  >
                    <Check className="h-4 w-4 text-success" /> Approve all
                  </button>
                </div>
              </div>

              {/* Mini calendar preview */}
              <BatchCalendarPreview posts={generated} />

              {generated.map((p) => (
                <BatchPostCard
                  key={p.id}
                  post={p}
                  brandId={brand.id}
                  onUpdate={updatePost}
                  onRemove={removePost}
                  onRegenerate={() => regeneratePostById(p.id)}
                  onRequestMedia={(params) => requestMediaFn({ data: params })}
                  onViewImage={(url) => setExpandedImage(url)}
                />
              ))}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => saveAsDraftsMut.mutate()}
                  disabled={saveAsDraftsMut.isPending}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
                >
                  {saveAsDraftsMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}{" "}
                  Save as drafts
                </button>
                <button
                  onClick={() => setConfirming(true)}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <CalendarClock className="h-4 w-4" /> Approve all & schedule
                </button>
              </div>
            </>
          )}
        </div>
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

      {/* Final confirmation modal */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              <h3 className="text-base font-semibold text-foreground">Confirm batch schedule</h3>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              This will create the campaign{" "}
              <span className="font-medium text-foreground">{name || "Batch campaign"}</span>, save{" "}
              {generated.length} posts, approve all of them, and schedule each approved post through
              the social planner API. Partial failures are reported individually.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirming(false)}
                className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={() => saveAndScheduleMut.mutate()}
                disabled={saveAndScheduleMut.isPending}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {saveAndScheduleMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirm & schedule
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .input { width: 100%; border-radius: 0.5rem; border: 1px solid var(--color-border); background: var(--color-input); padding: 0.5rem 0.75rem; font-size: 0.875rem; color: var(--color-foreground); outline: none; }
        .input:focus { border-color: var(--color-ring); box-shadow: 0 0 0 2px color-mix(in oklab, var(--color-ring) 30%, transparent); }
      `}</style>
    </div>
  );
}

function BatchCalendarPreview({ posts }: { posts: SocialPost[] }) {
  if (posts.length === 0) return null;
  const dates = posts
    .map((p) => (p.scheduledAt ? new Date(p.scheduledAt) : null))
    .filter((d): d is Date => d !== null);
  if (dates.length === 0) return null;
  const min = new Date(Math.min(...dates.map((d) => d.getTime())));
  const max = new Date(Math.max(...dates.map((d) => d.getTime())));
  const days: Date[] = [];
  const cur = new Date(min);
  cur.setHours(0, 0, 0, 0);
  while (cur <= max) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  if (days.length > 31) return null;

  return (
    <Card className="p-3">
      <div className="text-xs font-medium text-muted-foreground">Calendar preview</div>
      <div className="mt-2 flex gap-1 overflow-x-auto">
        {days.map((d) => {
          const dayPosts = posts.filter((p) => {
            const pd = p.scheduledAt ? new Date(p.scheduledAt) : null;
            return pd && pd.toDateString() === d.toDateString();
          });
          return (
            <div
              key={d.toISOString()}
              className="flex min-w-14 flex-1 flex-col rounded-lg border border-border bg-background/40 p-1.5"
            >
              <div className="text-center text-[10px] font-medium text-muted-foreground">
                {d.toLocaleDateString("en", { month: "numeric", day: "numeric" })}
              </div>
              <div className="mt-1 space-y-1">
                {dayPosts.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-1 rounded bg-primary/15 px-1 py-0.5 text-[9px] font-medium text-primary"
                  >
                    {p.media[0]?.url ? <ImageIcon className="h-2.5 w-2.5 shrink-0" /> : null}
                    <span className="truncate">{p.title}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default BatchPage;
