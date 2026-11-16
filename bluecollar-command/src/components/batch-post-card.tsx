import { useEffect, useState } from 'react';
import { Image as ImageIcon, Loader2, RefreshCw, Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, PlatformStack, StatusBadge } from '@/components/shared';
import type { BrandId, SocialPost } from '@/lib/types';
import { isoToZonedInput, zonedToIso } from '@/lib/batch-schedule';

interface Props {
  post: SocialPost;
  brandId: BrandId;
  timezone: string;
  onUpdate: (id: string, patch: Partial<SocialPost>) => void;
  onRemove: (id: string) => void;
  onRegenerate: () => Promise<void>;
  onRequestMedia: (params: { brandId: BrandId; prompt: string; type: 'image' | 'video'; executionId?: string }) => Promise<{ mediaUrl?: string; executionId?: string; error?: string }>;
  onViewImage: (url: string) => void;
}

export function BatchPostCard({ post, brandId, timezone, onUpdate, onRemove, onRegenerate, onRequestMedia, onViewImage }: Props) {
  const [mediaPrompt, setMediaPrompt] = useState('');
  const [generatingMedia, setGeneratingMedia] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const media = post.media[0];
  const kind = post.format === 'video' ? 'video' : 'image';
  useEffect(() => { setMediaPrompt(post.title); setMediaError(false); }, [post.id]);

  async function regenerate() {
    setRegenerating(true);
    try { await onRegenerate(); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Could not regenerate this post.'); }
    finally { setRegenerating(false); }
  }
  async function generateVisual() {
    if (!mediaPrompt.trim()) return;
    setGeneratingMedia(true);
    try {
      const result = await onRequestMedia({ brandId, prompt: mediaPrompt.trim(), type: kind, ...(post.agentExecutionId ? { executionId: post.agentExecutionId } : {}) });
      if (!result?.mediaUrl) throw new Error(result?.error || `GHL did not return a ${kind} result. Check this agent's media generation capability and try again.`);
      onUpdate(post.id, { media: [{ id: `media_${crypto.randomUUID()}`, url: result.mediaUrl, type: kind, caption: mediaPrompt.trim() }], ...(result.executionId ? { agentExecutionId: result.executionId } : {}) });
      setMediaError(false);
      toast.success(`${kind === 'video' ? 'Video' : 'Photo'} updated`);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not generate media.'); }
    finally { setGeneratingMedia(false); }
  }

  return <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:items-start">
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4"><div className="flex items-center gap-2"><PlatformStack platforms={post.platforms} /><StatusBadge status={post.status} /></div><span className="text-xs text-muted-foreground">Post preview</span></div>
      {media && !mediaError ? <div className="flex min-h-72 items-center justify-center bg-muted/40 p-4">{media.type === 'video' ? <video key={media.url} src={media.url} controls playsInline className="max-h-[460px] w-full rounded-xl object-contain" onError={() => setMediaError(true)} /> : <button type="button" onClick={() => onViewImage(media.url)} className="w-full"><img key={media.url} src={media.url} alt={post.title || 'Post visual'} className="max-h-[460px] w-full rounded-xl object-contain" onError={() => setMediaError(true)} /></button>}</div> : <div className="flex min-h-48 flex-col items-center justify-center gap-2 bg-muted/30 p-6 text-center"><ImageIcon className="h-7 w-7 text-muted-foreground" /><p className="text-sm text-muted-foreground">{post.format === 'text' ? 'Text-only post' : mediaError ? 'Visual could not be loaded' : `No ${kind} attached`}</p></div>}
      <div className="space-y-3 p-5"><h3 className="text-lg font-semibold text-foreground">{post.title || 'Untitled post'}</h3><p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{post.body || 'No caption yet. Add one in the editor.'}</p>{post.scheduledAt && <p className="border-t border-border pt-3 text-xs text-muted-foreground">Planned for {new Intl.DateTimeFormat('en-US', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(post.scheduledAt))} ({timezone})</p>}</div>
    </Card>
    <Card className="space-y-5 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3"><h3 className="text-lg font-semibold">Edit this post</h3><button type="button" onClick={() => onRemove(post.id)} className="inline-flex items-center gap-1 text-sm text-destructive hover:underline"><Trash2 className="h-4 w-4" /> Remove</button></div>
      <label className="block text-sm font-semibold">Title<input className="input mt-2" value={post.title} onChange={event => onUpdate(post.id, { title: event.target.value })} /></label>
      <label className="block text-sm font-semibold">Caption<textarea className="input mt-2 min-h-44 resize-y" value={post.body} onChange={event => onUpdate(post.id, { body: event.target.value })} /></label>
      <button type="button" onClick={regenerate} disabled={regenerating || generatingMedia} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-primary disabled:opacity-50">{regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{regenerating ? 'Regenerating…' : 'Regenerate post'}</button>
      {post.format !== 'text' && <div className="border-t border-border pt-5"><label className="block text-sm font-semibold">Change the {kind}<textarea className="input mt-2 min-h-24 resize-y" value={mediaPrompt} onChange={event => setMediaPrompt(event.target.value)} placeholder={`Describe the ${kind} you want`} /></label><button type="button" onClick={generateVisual} disabled={generatingMedia || regenerating || !mediaPrompt.trim()} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-primary disabled:opacity-50">{generatingMedia ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}{generatingMedia ? `Creating ${kind}…` : `Regenerate ${kind}`}</button></div>}
      <label className="block border-t border-border pt-5 text-sm font-semibold">Schedule time <span className="text-xs font-normal text-muted-foreground">({timezone})</span><input type="datetime-local" className="input mt-2" value={post.scheduledAt ? isoToZonedInput(post.scheduledAt, timezone) : ''} onChange={event => { if (!event.target.value) return; try { onUpdate(post.id, { scheduledAt: zonedToIso(event.target.value, timezone) }); } catch (error) { toast.error(error instanceof Error ? error.message : 'Invalid schedule time.'); } }} /></label>
    </Card>
  </div>;
}
