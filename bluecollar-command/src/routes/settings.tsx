import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield,
  KeyRound,
  Bot,
  CheckCircle2,
  AlertTriangle,
  Users,
  Play,
  Loader2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useBrand } from "@/lib/brand-context";
import { getSocialAccounts, getApprovers, runAgentDiagnostic, getAccountBrands, setAccountBrand, getBrandSetup, saveBrandSetup } from "@/lib/marketing.functions";
import { Card, PageHeader, PlatformIcon } from "@/components/shared";
import { PLATFORMS } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Blue Collar AI Command Center" },
      {
        name: "description",
        content: "Brand configuration, connected social accounts, and agent status.",
      },
      { property: "og:title", content: "Settings — Blue Collar AI Command Center" },
      { property: "og:description", content: "Brand configuration and connected accounts." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { brand, brands, setBrandId } = useBrand();
  const queryClient = useQueryClient();
  const assignmentQuery = useQuery({ queryKey: ["account-brands"], queryFn: () => getAccountBrands() });
  const assign = useMutation({
    mutationFn: (data: { accountId: string; brandId: "convini" | "ustow" | null }) => setAccountBrand({ data }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["account-brands"] }); queryClient.invalidateQueries({ queryKey: ["posts"] }); toast.success("Account brand saved"); },
    onError: (error) => toast.error(error.message),
  });
  const accountsQuery = useQuery({
    queryKey: ["social-accounts"],
    queryFn: () => getSocialAccounts(),
  });
  const approversQuery = useQuery({
    queryKey: ["approvers"],
    queryFn: () => getApprovers(),
  });
  const accounts = accountsQuery.data?.accounts ?? [];
  const accountsError = accountsQuery.data?.error;
  const approvers = approversQuery.data ?? [];

  const runTestFn = useServerFn(runAgentDiagnostic);
  const [testingBrand, setTestingBrand] = useState<string | null>(null);
  const [agentTestResults, setAgentTestResults] = useState<
    Record<string, { ok: boolean; reply?: string; error?: string }>
  >({});

  const handleTestAgent = async (brandId: "convini" | "ustow") => {
    try {
      setTestingBrand(brandId);
      const res = await runTestFn({ data: { brandId } });
      setAgentTestResults((prev) => ({ ...prev, [brandId]: res }));
    } catch (e) {
      setAgentTestResults((prev) => ({
        ...prev,
        [brandId]: { ok: false, error: e instanceof Error ? e.message : String(e) },
      }));
    } finally {
      setTestingBrand(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
      <PageHeader
        title="Settings"
        description="Brand configuration, connected accounts, and integrations"
      />

      {/* Brand selection */}
      <Card className="mt-8">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Active brand</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Every campaign, conversation, and post is isolated to the selected brand.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {brands.map((b) => (
            <button
              key={b.id}
              onClick={() => setBrandId(b.id)}
              className={cn(
                "flex items-center gap-3 rounded-xl border p-4 text-left transition-colors",
                brand.id === b.id ? "border-primary bg-primary/5" : "border-border hover:bg-accent",
              )}
            >
              <span
                className={cn(
                  "h-10 w-10 rounded-full",
                  b.id === "convini" ? "bg-brand-convini" : "bg-brand-ustow",
                )}
              />
              <div className="flex-1">
                <div className="text-sm font-semibold text-foreground">{b.name}</div>
                <div className="text-xs text-muted-foreground">{b.tagline}</div>
              </div>
              {brand.id === b.id && <CheckCircle2 className="h-5 w-5 text-primary" />}
            </button>
          ))}
        </div>
      </Card>

      {/* Connected social accounts */}
      <BrandSetupCard brandId={brand.id} brandName={brand.name} />

      {/* Connected social accounts */}
      <Card className="mt-6">
        <h2 className="text-base font-semibold text-foreground">Connected social accounts</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Loaded live from the social planner Get Accounts API. These are the only accounts
          available when creating or publishing content — generic platform options are not shown
          when no account is connected. Assign each account to a brand to import its existing GHL posts into that brand's calendar.
        </p>
        <div className="mt-4 space-y-2">
          {accountsQuery.isLoading && (
            <p className="text-sm text-muted-foreground">Loading connected accounts…</p>
          )}
          {accounts.length === 0 && !accountsQuery.isLoading && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground">No live accounts returned.</p>
                {accountsError ? (
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground/80">
                    API response: {accountsError}
                  </p>
                ) : (
                  <p className="mt-0.5">
                    Connect accounts in the social planner to enable publishing.
                  </p>
                )}
              </div>
            </div>
          )}
          {accounts.map((a) => (
            <div
              key={a.id || a.platform}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background/40 p-3 sm:flex-nowrap"
            >
              {a.profileImageUrl ? (
                <img src={a.profileImageUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
              ) : (
                <PlatformIcon platform={a.platform} className="h-9 w-9" />
              )}
              <div className="min-w-0 flex-1 basis-[calc(100%-4rem)] sm:basis-0">
                <div className="text-sm font-medium text-foreground">{a.account}</div>
                <div className="text-xs text-muted-foreground">
                  {PLATFORMS.find((p) => p.id === a.platform)?.label ?? a.platform}
                </div>
              </div>
              <label className="text-xs text-muted-foreground">
                Brand
                <select aria-label={`Brand for ${a.account}`} className="ml-2 rounded border border-border bg-background p-2 text-foreground" value={assignmentQuery.data?.[a.id] || ""} disabled={assign.isPending || assignmentQuery.isLoading} onChange={event => assign.mutate({ accountId: a.id, brandId: (event.target.value || null) as "convini" | "ustow" | null })}>
                  <option value="">Not assigned</option><option value="convini">Convini</option><option value="ustow">US Tow</option>
                </select>
              </label>
              <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-medium text-success">
                <CheckCircle2 className="h-3 w-3" /> Connected
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Approvers */}
      <Card className="mt-6">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Valid approvers</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Loaded from HighLevel users. Only these users can approve or deny content.
        </p>
        <div className="mt-4 space-y-2">
          {approversQuery.isLoading && (
            <p className="text-sm text-muted-foreground">Loading approvers…</p>
          )}
          {approvers.length === 0 && !approversQuery.isLoading && (
            <p className="text-sm text-muted-foreground">No approvers returned.</p>
          )}
          {approvers.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-background/40 p-3"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                {a.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-foreground">{a.name}</div>
                {a.email && <div className="text-xs text-muted-foreground">{a.email}</div>}
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-medium text-primary">
                Approver
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Integrations / secrets status */}
      <Card className="mt-6">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Integration status</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Secrets are stored server-side and never exposed to the browser. All API calls run through
          server functions protected by authentication.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            { label: "Private integration token", key: "GHL_PRIVATE_INTEGRATION_TOKEN" },
            { label: "Location ID", key: "GHL_LOCATION_ID" },
            { label: "Convini agent ID", key: "CONVINI_AGENT_ID" },
            { label: "US Tow agent ID", key: "USTOW_AGENT_ID" },
            { label: "App access password", key: "APP_ACCESS_PASSWORD" },
            { label: "Session secret", key: "SESSION_SECRET" },
          ].map((s) => (
            <div
              key={s.key}
              className="flex items-center justify-between rounded-lg border border-border bg-background/40 p-3"
            >
              <div>
                <div className="text-sm font-medium text-foreground">{s.label}</div>
                <div className="text-[11px] font-mono text-muted-foreground">{s.key}</div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-medium text-success">
                <CheckCircle2 className="h-3 w-3" /> Configured
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Agent status */}
      <Card className="mt-6">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Agent configuration</h2>
        </div>
        <div className="mt-4 space-y-3">
          {brands.map((b) => {
            const testResult = agentTestResults[b.id];
            const isTesting = testingBrand === b.id;
            return (
              <div
                key={b.id}
                className="rounded-lg border border-border bg-background/40 p-3 space-y-2.5"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "h-8 w-8 rounded-full shrink-0",
                      b.id === "convini" ? "bg-brand-convini" : "bg-brand-ustow",
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground">{b.name} agent</div>
                    <div className="text-xs text-muted-foreground truncate">
                      Conversational continuity preserved via executionId returned by each agent
                      turn.
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isTesting}
                    onClick={() => handleTestAgent(b.id)}
                    className="flex items-center gap-1 rounded bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
                  >
                    {isTesting ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Play className="h-3 w-3" />
                    )}
                    Test Agent Live
                  </button>
                </div>

                {testResult && (
                  <div
                    className={cn(
                      "rounded border p-2.5 text-xs font-mono break-all",
                      testResult.ok
                        ? "border-success/30 bg-success/10 text-success"
                        : "border-destructive/30 bg-destructive/10 text-destructive",
                    )}
                  >
                    {testResult.ok ? (
                      <div className="space-y-1">
                        <div className="font-semibold">✓ Agent responded successfully:</div>
                        <div className="text-foreground font-sans text-xs">{testResult.reply}</div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="font-semibold">✗ Agent call returned error:</div>
                        <div>{testResult.error}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        No live social-media actions are performed. Publishing requires explicit final approval.
      </p>
    </div>
  );
}

function BrandSetupCard({ brandId, brandName }: { brandId: "convini" | "ustow"; brandName: string }) {
  const queryClient = useQueryClient();
  const details = useQuery({ queryKey: ["brand-setup", brandId], queryFn: () => getBrandSetup({ data: { brandId } }), retry: false });
  const saveFn = useServerFn(saveBrandSetup);
  const [profile, setProfile] = useState({ audience: "", tone: "", businessDetails: "", defaultCta: "", avoid: "" });
  useEffect(() => { if (details.data?.profile) setProfile(details.data.profile); }, [brandId, details.data]);
  const save = useMutation({ mutationFn: () => saveFn({ data: { brandId, profile } }), onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["brand-setup", brandId] });
    toast.success("Brand guidance saved");
  }, onError: error => toast.error(error.message) });
  const fields = [
    { key: "audience", label: "Who you want to reach", hint: "For example: local drivers or towing companies" },
    { key: "tone", label: "How the posts should sound", hint: "For example: direct, warm, and practical" },
    { key: "businessDetails", label: "Verified business facts", hint: "Services, products, location, hours, offers, or claims you can verify" },
    { key: "defaultCta", label: "Usual call to action", hint: "For example: call, visit the site, or request a demo" },
    { key: "avoid", label: "Topics or claims to avoid", hint: "Anything the agent should not say" },
  ] as const;
  return <Card className="mb-6">
    <h2 className="text-lg font-semibold text-foreground">{brandName} content guide</h2>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">This guide is used automatically when the planner asks your GHL agent to write a post. Fill it out once; you can change it later.</p>
    {details.isLoading && <p className="mt-4 text-sm text-muted-foreground">Loading saved GHL agent details…</p>}
    {details.error && <p role="alert" className="mt-4 text-sm text-destructive">{details.error.message}</p>}
    {details.data?.agent && <div className="mt-5 rounded-xl border border-border bg-background p-4 text-sm">
      <p className="font-semibold">Imported from GHL: {details.data.agent.name}</p>
      <p className="mt-1 leading-6 text-muted-foreground">{details.data.agent.description}</p>
      <p className="mt-2 text-xs text-muted-foreground">{details.data.agent.knowledgeBaseIds.length} linked knowledge base · {details.data.agent.tools.includes("image_generation") ? "Image tool enabled" : "No image tool"} · {details.data.agent.tools.includes("video_generation") ? "Video tool enabled" : "No video tool"}</p>
      <p className="mt-2 text-xs text-muted-foreground">Knowledge-base contents and Brand Voice fields could not be imported with the current GHL token. Add any details you want to use below.</p>
    </div>}
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      {fields.map(field => <label key={field.key} className={field.key === "businessDetails" ? "sm:col-span-2" : ""}>
        <span className="text-sm font-semibold text-foreground">{field.label}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{field.hint}</span>
        {field.key === "businessDetails" ? <textarea className="mt-2 min-h-28 w-full rounded-xl border border-border bg-white p-3 text-sm outline-none focus:border-primary" value={profile[field.key]} onChange={e => setProfile(p => ({ ...p, [field.key]: e.target.value }))} /> : <input className="mt-2 w-full rounded-xl border border-border bg-white p-3 text-sm outline-none focus:border-primary" value={profile[field.key]} onChange={e => setProfile(p => ({ ...p, [field.key]: e.target.value }))} />}
      </label>)}
    </div>
    <button type="button" onClick={() => save.mutate()} disabled={save.isPending || details.isLoading} className="mt-5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{save.isPending ? "Saving…" : "Save content guide"}</button>
  </Card>;
}
