import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarRange,
  X,
  CalendarClock,
  Loader2,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { useBrand } from "@/lib/brand-context";
import { AgentPicker } from "@/components/agent-picker";
import {
  upsertPost,
  approvePost,
  schedulePost,
  getSocialAccounts,
  getAccountBrands,
  generateBatchPosts,
  getPlannerTimezone,
  requestMedia,
  regeneratePost,
  assistPostPrompt,
} from "@/lib/marketing.functions";
import { Card, PageHeader } from "@/components/shared";
import { SimpleAccountPicker } from "@/components/simple-account-picker";
import { BatchPostCard } from "@/components/batch-post-card";
import {
  OBJECTIVES,
  type CampaignObjective,
  type SocialPost,
  type SocialAccount,
} from "@/lib/types";

export const Route = createFileRoute("/batch")({
  head: () => ({
    meta: [
      { title: "Batch Planning — Blue Collar AI Command Center" },
      {
        name: "description",
        content: "Generate multiple posts for a date range.",
      },
      { property: "og:title", content: "Batch Planning — Blue Collar AI Command Center" },
      { property: "og:description", content: "Generate multiple posts together." },
    ],
  }),
  component: BatchPage,
});

function BatchPage() {
  const { brand, agentOptions, setBrandId, refreshAgents, agentsLoading, agentsError } = useBrand();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [objective, setObjective] = useState<CampaignObjective>("awareness");
  const [startDate, setStartDate] = useState('');
  const [days, setDays] = useState(7);
  const [windowStart, setWindowStart] = useState('09:00');
  const [windowEnd, setWindowEnd] = useState('18:00');
  const [postCount, setPostCount] = useState(5);
  const [brief, setBrief] = useState("");
  const [mediaKind, setMediaKind] = useState<'image' | 'video' | 'text'>('image');
  const suggestedIdeas = useRef<string[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [generated, setGenerated] = useState<SocialPost[]>([]);
  const [activePostIndex, setActivePostIndex] = useState(0);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [agentChosen, setAgentChosen] = useState(false);
  const [generationSeconds, setGenerationSeconds] = useState(0);

  const accountsQuery = useQuery({
    queryKey: ["social-accounts"],
    queryFn: () => getSocialAccounts(),
  });
  const assignmentsQuery = useQuery({ queryKey: ['account-brands'], queryFn: () => getAccountBrands() });
  const timezoneQuery = useQuery({ queryKey: ['planner-timezone'], queryFn: () => getPlannerTimezone() });
  useEffect(() => {
    const zone = timezoneQuery.data?.timezone;
    if (!zone) return;
    const fields = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(part => [part.type, part.value]));
    const tomorrow = new Date(Date.UTC(Number(fields['year']), Number(fields['month']) - 1, Number(fields['day']) + 1)).toISOString().slice(0, 10);
    setStartDate(current => current || tomorrow);
  }, [timezoneQuery.data?.timezone]);
  const accounts: SocialAccount[] = accountsQuery.data?.accounts ?? [];
  const accountsError = accountsQuery.data?.error;
  useEffect(() => {
    if (!accounts.length || selectedAccountIds.length) return;
    const saved = localStorage.getItem(`bcc:usual:${brand.id}`);
    const preferred = saved?.split(',').filter(id => accounts.some(account => account.id === id)) ?? [];
    const assigned = accounts.filter(account => assignmentsQuery.data?.[account.id] === brand.id).map(account => account.id);
    if (preferred.length || assigned.length) setSelectedAccountIds(preferred.length ? preferred : assigned);
  }, [accounts, assignmentsQuery.data, brand.id, selectedAccountIds.length]);

  const upsertPostFn = useServerFn(upsertPost);
  const approveFn = useServerFn(approvePost);
  const scheduleFn = useServerFn(schedulePost);
  const generateBatchFn = useServerFn(generateBatchPosts);
  const requestMediaFn = useServerFn(requestMedia);
  const regenerateFn = useServerFn(regeneratePost);
  const assist = useServerFn(assistPostPrompt);
  const suggestIdea = useMutation({
    mutationFn: async () => {
      const result = await assist({ data: { brandId: brand.id, mode: 'idea', context: 'batch', input: brief, previousIdeas: suggestedIdeas.current.slice(-8) } });
      if (suggestedIdeas.current.some(old => old.toLowerCase() === result.text.toLowerCase()) || result.text.toLowerCase() === brief.trim().toLowerCase()) throw new Error('The agent repeated an idea. Try again.');
      return result.text;
    },
    onSuccess: idea => { suggestedIdeas.current.push(idea); setBrief(idea); },
    onError: error => toast.error(error instanceof Error ? error.message : 'Could not suggest an idea.'),
  });
  const improveBrief = useMutation({
    mutationFn: async () => (await assist({ data: { brandId: brand.id, mode: 'improve', context: 'batch', input: brief, previousIdeas: [] } })).text,
    onSuccess: text => setBrief(text),
    onError: error => toast.error(error instanceof Error ? error.message : 'Could not improve the brief.'),
  });
  const briefWordCount = brief.trim().split(/\s+/).filter(Boolean).length;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["posts", brand.id] });
    queryClient.invalidateQueries({ queryKey: ["analytics", brand.id] });
  };

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
          days,
          windowStart,
          windowEnd,
          objective,
          accountIds: selectedAccountIds,
          mediaKind,
        },
      });
    },
    onSuccess: (data) => {
      if (!data.posts.length) { toast.error(data.error || 'The agent did not create any posts. Please try again.'); return; }
      setGenerated(data.posts);
      setActivePostIndex(0);
      setStep(5);
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

  useEffect(() => {
    if (!generateMut.isPending) { setGenerationSeconds(0); return; }
    const started = Date.now();
    const timer = window.setInterval(() => setGenerationSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [generateMut.isPending]);

  function updatePost(id: string, patch: Partial<SocialPost>) {
    setGenerated((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }
  function removePost(id: string) {
    setGenerated((prev) => prev.filter((p) => p.id !== id));
    setActivePostIndex(index => Math.max(0, Math.min(index, generated.length - 2)));
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
      for (const p of generated) {
        await upsertPostFn({ data: { post: { ...p, campaignId: null, status: "draft" } } });
      }
      const report: { id: string; ok: boolean }[] = [];
      for (const p of generated) {
        try {
          await approveFn({ data: { id: p.id } });
          const scheduledAt = p.scheduledAt;
          if (!scheduledAt) throw new Error('Choose a schedule time for every post.');
          const result = await scheduleFn({ data: { id: p.id, scheduledAt } });
          report.push({ id: p.id, ok: result.status === 'scheduled' });
        } catch {
          report.push({ id: p.id, ok: false });
        }
      }
      return { report };
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
      navigate({ to: "/calendar" });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Batch save failed");
    },
  });

  // Save the generated batch as drafts only — nothing is approved or scheduled.
  // The user can then review, edit, and approve each draft individually from the
  // Calendar or Approvals page.
  const saveAsDraftsMut = useMutation({
    mutationFn: async () => {
      for (const p of generated) {
        // Persist each as a draft — no approval, no scheduling, no live action.
        await upsertPostFn({
          data: { post: { ...p, campaignId: null, status: "draft" } },
        });
      }
      return { count: generated.length };
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
        title="Multiple posts"
        description={`Generate and review several posts for ${brand.name}, then save or schedule them.`}
      />

      <div className="mx-auto mt-8 max-w-6xl">
        <div className="mb-3 flex justify-between text-sm"><span className="font-semibold text-primary">Step {step} of 5</span><span className="text-muted-foreground">{['', 'Posting plan', 'Knowledge base', 'Content brief', 'Social accounts', 'Review posts'][step]}</span></div>
        <div className="mb-7 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${step / 5 * 100}%` }} /></div>
        {/* Config */}
        {step < 5 && <Card className="min-h-[440px] p-6 sm:p-9">
          <div className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-primary" />
            <h2 className="text-xl font-semibold text-foreground">{['', 'Plan your posts', 'Which knowledge base should guide them?', 'What should the posts be about?', 'Where should they go?'][step]}</h2>
          </div>
          <div className="mt-4 space-y-4">
            {step === 2 && <><p className="text-sm text-muted-foreground">Choose the GHL AI agent for this business.</p><AgentPicker options={agentOptions} selectedId={agentChosen ? brand.id : null} loading={agentsLoading} error={agentsError} onRefresh={() => void refreshAgents()} onSelect={id => { setBrandId(id); setAgentChosen(true); setGenerated([]); suggestedIdeas.current = []; setBrief(''); setSelectedAccountIds([]); }} /></>}
            {step === 3 && <label htmlFor="batch-goal" className="block text-sm font-semibold">What do you want people to do?<select id="batch-goal" className="input mt-2 w-full bg-white" value={objective} onChange={e => setObjective(e.target.value as CampaignObjective)}>{OBJECTIVES.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>}
            {step === 1 && <div className="space-y-6"><p className="text-lg leading-relaxed">I want to make <input aria-label="Number of posts" type="number" min={1} max={20} value={postCount} onChange={e => setPostCount(Number(e.target.value))} className="mx-1 w-20 rounded-lg border border-border bg-input px-2 py-1 text-center font-semibold" /> posts in <input aria-label="Number of days" type="number" min={1} max={90} value={days} onChange={e => setDays(Number(e.target.value))} className="mx-1 w-20 rounded-lg border border-border bg-input px-2 py-1 text-center font-semibold" /> days.</p><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">From<input aria-label="Window start" type="time" value={windowStart} onChange={e => setWindowStart(e.target.value)} className="input mt-2" /></label><label className="text-sm font-medium">To<input aria-label="Window end" type="time" value={windowEnd} onChange={e => setWindowEnd(e.target.value)} className="input mt-2" /></label></div><label className="block text-sm font-medium">Starting on<input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input mt-2" /></label><p className="rounded-lg border border-border bg-accent/40 p-3 text-sm text-muted-foreground">Posts will be spread across these days, only between {windowStart} and {windowEnd} in {timezoneQuery.data?.timezone || 'the GHL subaccount timezone'}.</p>{!timezoneQuery.isLoading && !timezoneQuery.data?.timezone && <p role="alert" className="text-sm text-destructive">Set GHL_TIMEZONE to your GHL subaccount timezone before continuing.</p>}</div>}
            {step === 3 && <div><label htmlFor="batch-brief" className="block text-sm font-semibold">What should the posts be about?<textarea id="batch-brief" className="mt-2 min-h-36 w-full resize-y rounded-xl border border-border bg-white p-4 text-base shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" value={brief} onChange={e => setBrief(e.target.value)} placeholder="Example: helpful tips for drivers in Columbus" /></label><button type="button" disabled={suggestIdea.isPending || improveBrief.isPending} onClick={() => suggestIdea.mutate()} className="mt-3 text-sm text-primary hover:underline disabled:opacity-50">{suggestIdea.isPending ? 'Finding a new idea…' : brief ? 'Suggest another idea' : 'Suggest an idea'}</button>{briefWordCount >= 8 && <button type="button" disabled={suggestIdea.isPending || improveBrief.isPending} onClick={() => improveBrief.mutate()} className="ml-5 text-sm text-primary hover:underline disabled:opacity-50">{improveBrief.isPending ? 'Improving your prompt…' : 'Improve prompt with AI'}</button>}{improveBrief.isPending && <p role="status" className="mt-3 text-sm text-muted-foreground">Expanding your idea into a clearer brief for the batch…</p>}</div>}
            {step === 3 && <fieldset className="mt-7"><legend className="text-sm font-semibold text-foreground">What kind of content?</legend><div className="mt-3 grid gap-3 sm:grid-cols-3">{([['image', 'AI photo', 'Caption and generated photo'], ['video', 'AI video', 'Caption and generated video'], ['text', 'Text only', 'Caption without media']] as const).map(([id, label, hint]) => <label key={id} className={`flex cursor-pointer items-start gap-3 rounded-xl border bg-white p-4 ${mediaKind === id ? 'border-primary bg-primary/5' : 'border-border'}`}><input type="radio" name="batch-media-kind" value={id} checked={mediaKind === id} onChange={() => setMediaKind(id)} className="mt-1" /><span><span className="block text-sm font-semibold">{label}</span><span className="mt-1 block text-xs text-muted-foreground">{hint}</span></span></label>)}</div><p className="mt-2 text-xs text-muted-foreground">Video requires video generation enabled on the selected GHL agent and takes longer. You can review every result before saving.</p></fieldset>}

            {step === 4 && <><SimpleAccountPicker
              accounts={accounts}
              selectedIds={selectedAccountIds}
              loading={accountsQuery.isLoading}
              error={accountsError}
              onChange={setSelectedAccountIds}
            />

            {selectedAccountIds.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Select at least one connected account to generate posts for it.
              </p>
            )}
            {mediaKind === 'video' && accounts.some(account => selectedAccountIds.includes(account.id) && account.platform === 'google') && <p role="alert" className="text-sm text-destructive">Google Business Profile does not accept video posts. Remove that account or choose AI photo.</p>}
            {mediaKind === 'text' && accounts.some(account => selectedAccountIds.includes(account.id) && account.platform === 'instagram') && <p role="alert" className="text-sm text-destructive">Instagram requires a photo or video. Remove that account or choose a visual format.</p>}
            <p className="text-xs text-muted-foreground">
              The brand AI writes each caption{mediaKind === 'text' ? '' : ` and generates a ${mediaKind === 'video' ? 'video' : 'photo'}`}. The batch appears on the
              calendar preview before anything is saved. You can edit, remove, re-prompt images, or
              reschedule each post individually.
            </p>
            {generateMut.isPending && <div role="status" aria-live="polite" className="rounded-xl border border-primary/30 bg-primary/5 p-5"><div className="flex items-center gap-3 font-semibold"><Loader2 className="h-5 w-5 animate-spin text-primary" /> Creating {postCount} posts…</div><p className="mt-2 text-sm text-muted-foreground">Writing captions{mediaKind === 'text' ? '' : ` and creating ${mediaKind === 'video' ? 'videos' : 'photos'}`}. This can take a few minutes. {generationSeconds}s elapsed.</p><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full w-1/3 animate-pulse rounded-full bg-primary" /></div></div>}</>}
          </div>
          <div className="mt-10 flex items-center justify-between gap-3 border-t border-border pt-6"><button type="button" disabled={step === 1 || generateMut.isPending} onClick={() => setStep(value => value - 1)} className="rounded-lg border border-border px-5 py-2.5 text-sm font-semibold disabled:opacity-40">Back</button><button type="button" disabled={generateMut.isPending || (step === 1 && (!timezoneQuery.data?.timezone || !startDate || !Number.isInteger(postCount) || postCount < 1 || postCount > 20 || !Number.isInteger(days) || days < 1 || days > 90 || windowStart >= windowEnd)) || (step === 2 && !agentChosen) || (step === 3 && !brief.trim()) || (step === 4 && (selectedAccountIds.length === 0 || mediaKind === 'video' && accounts.some(account => selectedAccountIds.includes(account.id) && account.platform === 'google') || mediaKind === 'text' && accounts.some(account => selectedAccountIds.includes(account.id) && account.platform === 'instagram')))} onClick={() => step === 4 ? generateMut.mutate() : setStep(value => value + 1)} className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{generateMut.isPending ? 'Creating posts…' : step === 4 ? 'Generate posts' : 'Continue'}</button></div>
        </Card>}

        {/* Preview / generated batch */}
        {step === 5 && <div className="space-y-4"><button type="button" onClick={() => setStep(4)} className="text-sm font-semibold text-primary">← Back to accounts</button>
          {generated.length === 0 ? (
            <Card>
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <CalendarRange className="h-10 w-10 text-muted-foreground/40" />
                <p className="mt-3 text-sm text-muted-foreground">
                  Configure a brief and generate a preview. Nothing is saved until you choose to save or schedule.
                </p>
              </div>
            </Card>
          ) : (
            <>
              <h2 className="text-base font-semibold text-foreground">Review {generated.length} posts</h2>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3"><button type="button" disabled={activePostIndex === 0} onClick={() => setActivePostIndex(index => index - 1)} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold disabled:opacity-40">← Previous</button><span className="text-sm font-semibold">Post {activePostIndex + 1} of {generated.length}</span><button type="button" disabled={activePostIndex >= generated.length - 1} onClick={() => setActivePostIndex(index => index + 1)} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold disabled:opacity-40">Next →</button></div>
              {generated[activePostIndex] && (
                <BatchPostCard
                  key={generated[activePostIndex].id}
                  post={generated[activePostIndex]}
                  brandId={brand.id}
                  timezone={timezoneQuery.data?.timezone || 'America/New_York'}
                  onUpdate={updatePost}
                  onRemove={removePost}
                  onRegenerate={() => regeneratePostById(generated[activePostIndex]!.id)}
                  onRequestMedia={(params) => requestMediaFn({ data: params })}
                  onViewImage={(url) => setExpandedImage(url)}
                />
              )}
              <div className="flex flex-wrap justify-center gap-2" aria-label="Choose a post to review">{generated.map((post, index) => <button key={post.id} type="button" aria-label={`Review post ${index + 1}`} aria-current={index === activePostIndex ? 'step' : undefined} onClick={() => setActivePostIndex(index)} className={`h-9 min-w-9 rounded-lg border px-2 text-xs font-semibold ${index === activePostIndex ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:border-primary'}`}>{index + 1}</button>)}</div>

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
                  onClick={() => saveAndScheduleMut.mutate()}
                  disabled={saveAndScheduleMut.isPending}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <CalendarClock className="h-4 w-4" /> {saveAndScheduleMut.isPending ? "Scheduling…" : "Schedule all"}
                </button>
              </div>
            </>
          )}
        </div>}
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

      <style>{`
        .input { width: 100%; border-radius: 0.5rem; border: 1px solid var(--color-border); background: var(--color-input); padding: 0.5rem 0.75rem; font-size: 0.875rem; color: var(--color-foreground); outline: none; }
        .input:focus { border-color: var(--color-ring); box-shadow: 0 0 0 2px color-mix(in oklab, var(--color-ring) 30%, transparent); }
      `}</style>
    </div>
  );
}

export default BatchPage;
