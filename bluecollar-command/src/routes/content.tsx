import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { getPosts, removePost } from '@/lib/marketing.functions';
import { StatusBadge } from '@/components/shared';

export const Route = createFileRoute('/content')({ component: Content });
type Filter = 'review' | 'drafts' | 'scheduled' | 'published';
const statuses: Record<Filter, string[]> = {
  review: ['draft', 'in_review', 'approved', 'denied', 'failed'],
  drafts: ['draft'],
  scheduled: ['scheduled', 'publishing'],
  published: ['published'],
};

function Content() {
  const [filter, setFilter] = useState<Filter>('review');
  const [index, setIndex] = useState(0);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [discardError, setDiscardError] = useState('');
  const queryClient = useQueryClient();
  const remove = useServerFn(removePost);
  const discard = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: (removed) => {
      if (!removed) { setDiscardError('This draft could not be discarded. Refresh and try again.'); return; }
      setConfirmDiscard(false);
      setDiscardError('');
      setIndex(i => Math.max(0, i - 1));
      void queryClient.invalidateQueries({ queryKey: ['posts'] });
    },
    onError: (error) => setDiscardError(error.message),
  });
  const posts = useQuery({ queryKey: ['posts', 'all'], queryFn: () => getPosts({ data: {} }) });
  const list = (posts.data ?? []).filter(post => statuses[filter].includes(post.status));
  const current = list[Math.min(index, Math.max(0, list.length - 1))];
  const chooseFilter = (value: Filter) => { setFilter(value); setIndex(0); setConfirmDiscard(false); setDiscardError(''); };

  return <main className="mx-auto max-w-4xl px-4 py-8 md:px-8">
    <h1 className="text-3xl font-semibold">Content</h1>
    <p className="mt-2 text-sm text-muted-foreground">Read one post at a time across your knowledge bases.</p>
    <div className="mt-7 flex flex-wrap gap-2">{(['review', 'drafts', 'scheduled', 'published'] as const).map(value => <button key={value} type="button" onClick={() => chooseFilter(value)} aria-pressed={filter === value} className={`rounded-lg border px-4 py-2 text-sm font-medium capitalize ${filter === value ? 'border-primary bg-primary/10' : 'border-border bg-card'}`}>{value}</button>)}</div>
    {posts.error && <p role="alert" className="mt-5 text-sm text-destructive">{posts.error.message}</p>}
    {posts.isLoading && <p className="mt-6 text-sm text-muted-foreground">Loading posts…</p>}
    {current ? <>
      <div className="mt-6 flex items-center justify-between rounded-xl border border-border bg-card p-3">
        <button type="button" aria-label="Previous post" disabled={index === 0} onClick={() => { setIndex(i => i - 1); setConfirmDiscard(false); setDiscardError(''); }} className="rounded-lg border border-border p-2 disabled:opacity-40"><ChevronLeft className="h-5 w-5" /></button>
        <span className="text-sm font-medium">Post {Math.min(index + 1, list.length)} of {list.length}</span>
        <button type="button" aria-label="Next post" disabled={index >= list.length - 1} onClick={() => { setIndex(i => i + 1); setConfirmDiscard(false); setDiscardError(''); }} className="rounded-lg border border-border p-2 disabled:opacity-40"><ChevronRight className="h-5 w-5" /></button>
      </div>
      <article key={current.id} className="mt-3 rounded-xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><h2 className="text-xl font-semibold">{current.title || 'Untitled post'}</h2><StatusBadge status={current.status} /></div>
        {current.media.map(item => item.type === 'image' ? <img key={item.id} src={item.url} alt={item.caption || 'Post visual'} className="mt-5 max-h-96 w-full rounded-lg object-contain" /> : <video key={item.id} src={item.url} controls className="mt-5 max-h-96 w-full rounded-lg" />)}
        <p className="mt-5 whitespace-pre-wrap break-words text-sm leading-7">{current.body || 'No caption yet.'}</p>
        <p className="mt-5 text-xs text-muted-foreground">{current.platforms.join(', ') || 'No accounts selected'}</p>
        {statuses.review.includes(current.status) && <a href={`/approvals?post=${encodeURIComponent(current.id)}`} className="mt-5 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Open review controls</a>}
        {current.status === 'draft' && <div className="mt-5 border-t border-border pt-5">
          {confirmDiscard ? <div className="rounded-lg border border-destructive/30 p-4"><p className="text-sm font-medium">Discard this draft? This cannot be undone.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={discard.isPending} onClick={() => discard.mutate(current.id)} className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50">{discard.isPending ? 'Discarding…' : 'Yes, discard draft'}</button><button type="button" onClick={() => setConfirmDiscard(false)} className="rounded-lg border border-border px-4 py-2 text-sm">Cancel</button></div></div> : <button type="button" onClick={() => { setDiscardError(''); setConfirmDiscard(true); }} className="inline-flex items-center gap-2 text-sm text-destructive hover:underline"><Trash2 className="h-4 w-4" /> Discard draft</button>}
          {discardError && <p role="alert" className="mt-2 text-sm text-destructive">{discardError}</p>}
        </div>}
      </article>
    </> : !posts.isLoading && <p className="mt-6 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">No {filter} posts yet.</p>}
    <div className="mt-8 flex gap-5 text-sm"><Link to="/calendar" className="text-primary underline">Open calendar</Link><Link to="/create" className="text-primary underline">Detailed editor</Link></div>
  </main>;
}
