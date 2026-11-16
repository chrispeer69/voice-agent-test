import { useState } from 'react';
import { Check, ChevronDown, RefreshCw } from 'lucide-react';
import type { Brand, BrandId } from '@/lib/types';
import { GHL_AGENT_STUDIO_URL } from '@/lib/ghl-links';

export function AgentPicker({ options, selectedId, onSelect, loading, error, onRefresh }: {
  options: Brand[];
  selectedId: BrandId | null;
  onSelect: (id: BrandId) => void;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find(option => option.id === selectedId);
  return <div className="mt-6">
    <label id="agent-picker-label" className="block text-sm font-semibold text-foreground">AI agent</label>
    <button type="button" aria-labelledby="agent-picker-label" aria-expanded={open} aria-controls="agent-picker-options" disabled={!options.length} onClick={() => setOpen(value => !value)} className="mt-2 flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-border bg-white px-4 py-3 text-left font-semibold text-foreground shadow-sm hover:border-primary disabled:cursor-not-allowed disabled:opacity-60">
      <span>{selected?.name ?? (loading ? 'Loading GHL agents…' : options.length ? 'Select an agent' : 'No published agents available')}</span><ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && <div id="agent-picker-options" role="listbox" aria-labelledby="agent-picker-label" className="mt-2 overflow-hidden rounded-xl border border-border bg-white shadow-lg">{options.map(option => <button key={option.id} type="button" role="option" aria-selected={option.id === selectedId} onClick={() => { onSelect(option.id); setOpen(false); }} className="flex min-h-14 w-full items-center justify-between gap-3 border-b border-border px-4 py-3 text-left hover:bg-primary/5 last:border-b-0"><span><span className="block font-semibold">{option.name}</span>{option.tagline && <span className="block text-xs text-muted-foreground">{option.tagline}</span>}</span>{option.id === selectedId && <Check className="h-5 w-5 shrink-0 text-primary" />}</button>)}</div>}
    {!open && options.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Available: {options.map(option => option.name).join(' · ')}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-destructive">Could not load GHL agents: {error}</p>}
    {!loading && !error && !options.length && <p role="status" className="mt-3 text-sm text-muted-foreground">Publish a Managed Agent in this GHL subaccount, then refresh.</p>}
    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm"><button type="button" disabled={loading} onClick={onRefresh} className="inline-flex items-center gap-1 text-primary hover:underline disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh GHL agents</button><a href={GHL_AGENT_STUDIO_URL} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Create an agent in GHL ↗</a></div>
  </div>;
}
