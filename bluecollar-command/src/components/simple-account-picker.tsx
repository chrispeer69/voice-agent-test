import { Link } from '@tanstack/react-router';
import type { SocialAccount } from '@/lib/types';

export function SimpleAccountPicker({ accounts, selectedIds, onChange, loading, error }: {
  accounts: SocialAccount[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  loading: boolean;
  error?: string | undefined;
}) {
  return <div className="grid gap-3">
    {accounts.map(account => <label key={account.id} className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-white px-4 py-3 text-sm font-semibold shadow-sm transition-all hover:border-primary hover:shadow-md">
      <input type="checkbox" checked={selectedIds.includes(account.id)} onChange={event => onChange(event.target.checked ? [...selectedIds, account.id] : selectedIds.filter(id => id !== account.id))} />
      {account.profileImageUrl ? <img src={account.profileImageUrl} alt="" className="h-10 w-10 rounded-full object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-xs font-bold uppercase">{account.platform.slice(0, 2)}</span>}
      <span className="min-w-0"><span className="block truncate">{account.account}</span><small className="text-muted-foreground">{account.platform === 'google' ? 'Google Business Profile · updates and photos only' : account.platform}</small></span>
    </label>)}
    {loading && <p className="text-sm text-muted-foreground">Loading connected accounts…</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!loading && !error && !accounts.length && <p className="text-sm">No connected accounts available. <Link to="/settings" className="text-primary underline">Open Settings</Link></p>}
  </div>;
}
