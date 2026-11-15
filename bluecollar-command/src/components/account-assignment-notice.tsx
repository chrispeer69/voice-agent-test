import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { getAccountBrands, getSocialAccounts } from '@/lib/marketing.functions';

export function AccountAssignmentNotice() {
  const accounts = useQuery({ queryKey: ['social-accounts'], queryFn: () => getSocialAccounts() });
  const assignments = useQuery({ queryKey: ['account-brands'], queryFn: () => getAccountBrands() });
  const unassigned = accounts.data?.accounts.filter(a => !assignments.data?.[a.id]).length || 0;
  const error = accounts.error || assignments.error;
  if (error || accounts.data?.error) return <p role="alert" className="border-b border-border px-4 py-3 text-sm text-destructive">{error?.message || accounts.data?.error}</p>;
  if (!unassigned || !assignments.data) return null;
  return <p className="border-b border-border px-4 py-3 text-sm text-muted-foreground">Assign {unassigned} connected {unassigned === 1 ? 'account' : 'accounts'} to a brand in <Link to="/settings" className="font-medium text-primary underline">Settings</Link> to show existing GHL posts in the correct brand calendar.</p>;
}
