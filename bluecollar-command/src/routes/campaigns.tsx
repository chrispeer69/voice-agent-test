import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Repeat, Calendar, Target } from "lucide-react";
import { useBrand } from "@/lib/brand-context";
import { getCampaigns, upsertCampaign, getPosts } from "@/lib/marketing.functions";
import { Card, PageHeader, StatusBadge, PlatformStack } from "@/components/shared";
import { OBJECTIVES } from "@/lib/types";
import type { Campaign, CampaignCadence, CampaignObjective } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/campaigns")({
  head: () => ({
    meta: [
      { title: "Campaigns — Blue Collar AI Command Center" },
      { name: "description", content: "One-time and recurring content campaigns by brand." },
      { property: "og:title", content: "Campaigns — Blue Collar AI Command Center" },
      { property: "og:description", content: "One-time and recurring content campaigns by brand." },
    ],
  }),
  component: CampaignsPage,
});

function CampaignsPage() {
  const { brand } = useBrand();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const campaignsQuery = useQuery({
    queryKey: ["campaigns", brand.id],
    queryFn: () => getCampaigns({ data: { brandId: brand.id } }),
  });
  const postsQuery = useQuery({
    queryKey: ["posts", brand.id],
    queryFn: () => getPosts({ data: { brandId: brand.id } }),
  });
  const campaigns = campaignsQuery.data ?? [];
  const posts = postsQuery.data ?? [];

  const upsert = useServerFn(upsertCampaign);
  const upsertMut = useMutation({
    mutationFn: (c: Campaign) => upsert({ data: { campaign: c } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["campaigns", brand.id] }),
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
      <PageHeader title="Campaigns" description={`One-time and recurring plans for ${brand.name}`}>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> New campaign
        </button>
      </PageHeader>

      <div className="mt-8 grid gap-5 md:grid-cols-2">
        {campaigns.map((c) => {
          const cPosts = posts.filter((p) => p.campaignId === c.id);
          return (
            <Card key={c.id}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-semibold text-foreground">{c.name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{c.description}</p>
                </div>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium",
                    c.cadence === "one_time"
                      ? "bg-muted text-muted-foreground"
                      : "bg-primary/15 text-primary",
                  )}
                >
                  {c.cadence === "one_time" ? (
                    <Calendar className="h-3 w-3" />
                  ) : (
                    <Repeat className="h-3 w-3" />
                  )}
                  {c.cadence === "one_time"
                    ? "One-time"
                    : c.cadence === "weekly"
                      ? "Weekly"
                      : "Monthly"}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Target className="h-3.5 w-3.5" />{" "}
                  {OBJECTIVES.find((o) => o.id === c.objective)?.label}
                </span>
                <span>·</span>
                <span>
                  {new Date(c.startDate).toLocaleDateString("en", {
                    month: "short",
                    day: "numeric",
                  })}
                  {c.endDate
                    ? ` – ${new Date(c.endDate).toLocaleDateString("en", { month: "short", day: "numeric" })}`
                    : ""}
                </span>
                <span>·</span>
                <span>{cPosts.length} posts</span>
              </div>
              <div className="mt-4 space-y-1.5">
                {cPosts.slice(0, 4).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 rounded-lg border border-border bg-background/40 p-2"
                  >
                    <PlatformStack platforms={p.platforms} iconClassName="h-5 w-5" />
                    <span className="flex-1 truncate text-xs text-foreground">
                      {p.title || p.type}
                    </span>
                    <StatusBadge status={p.status} />
                  </div>
                ))}
                {cPosts.length === 0 && (
                  <p className="py-2 text-xs text-muted-foreground">No posts yet.</p>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {showForm && (
        <CampaignForm
          brandId={brand.id}
          onClose={() => setShowForm(false)}
          onSave={(c) => {
            upsertMut.mutate(c);
            setShowForm(false);
          }}
        />
      )}
    </div>
  );
}

function CampaignForm({
  brandId,
  onClose,
  onSave,
}: {
  brandId: "convini" | "ustow";
  onClose: () => void;
  onSave: (c: Campaign) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [objective, setObjective] = useState<CampaignObjective>("awareness");
  const [cadence, setCadence] = useState<CampaignCadence>("weekly");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold text-foreground">New campaign</h2>
        <div className="mt-4 space-y-3">
          <Input
            label="Name"
            value={name}
            onChange={setName}
            placeholder="e.g. Fall Restock Promo"
          />
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Description
            </span>
            <textarea
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Objective"
              value={objective}
              onChange={(v) => setObjective(v as CampaignObjective)}
              options={OBJECTIVES.map((o) => ({ value: o.id, label: o.label }))}
            />
            <Select
              label="Cadence"
              value={cadence}
              onChange={(v) => setCadence(v as CampaignCadence)}
              options={[
                { value: "one_time", label: "One-time" },
                { value: "weekly", label: "Weekly" },
                { value: "monthly", label: "Monthly" },
              ]}
            />
            <Input label="Start date" type="date" value={startDate} onChange={setStartDate} />
            <Input label="End date (optional)" type="date" value={endDate} onChange={setEndDate} />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Cancel
          </button>
          <button
            disabled={!name}
            onClick={() =>
              onSave({
                id: `camp_${Math.random().toString(36).slice(2, 8)}`,
                brandId,
                name,
                description,
                objective,
                cadence,
                startDate: new Date(startDate).toISOString(),
                endDate: endDate ? new Date(endDate).toISOString() : undefined,
                postCount: 0,
              })
            }
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Create campaign
          </button>
        </div>
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type={type}
        className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
function Select({
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
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <select
        className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground"
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
