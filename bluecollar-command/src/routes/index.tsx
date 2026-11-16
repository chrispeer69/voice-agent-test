import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, PenSquare, Layers } from 'lucide-react';
import { getPosts } from '@/lib/marketing.functions';
import { StatusBadge } from '@/components/shared';

export const Route = createFileRoute('/')({component:Home,head:()=>({meta:[{title:'Home — Blue Collar AI Social Planner'}]})});
function Home(){
 const posts=useQuery({queryKey:['posts','all'],queryFn:()=>getPosts({data:{}})});
 const review=(posts.data??[]).filter(p=>['draft','in_review','failed'].includes(p.status)).slice(0,4);
 const upcoming=(posts.data??[]).filter(p=>p.status==='scheduled').sort((a,b)=>(a.scheduledAt||'').localeCompare(b.scheduledAt||'')).slice(0,4);
 return <main className="mx-auto max-w-5xl px-4 py-10 md:px-8 md:py-14">
  <p className="text-sm font-medium text-primary">Hello Chris</p>
  <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-foreground md:text-5xl">What would you like to create today?</h1>
  <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">A few answers, a preview, then you choose when it goes live. Creating content never posts it automatically.</p>
  <div className="mt-8 flex snap-x gap-4 overflow-x-auto pb-3">
   <Link to="/quick-create" className="group min-w-[235px] flex-1 snap-start rounded-2xl border border-primary/60 bg-primary/10 p-6 transition-colors hover:bg-primary/15"><PenSquare className="h-6 w-6 text-primary"/><h2 className="mt-4 text-lg font-semibold">One post</h2><p className="mt-1 text-sm text-muted-foreground">Answer a few simple questions.</p><ArrowRight className="mt-6 h-5 w-5 text-primary transition-transform group-hover:translate-x-1"/></Link>
   <Link to="/batch" className="group min-w-[235px] flex-1 snap-start rounded-2xl border border-border bg-card p-6 transition-colors hover:border-primary/40"><Layers className="h-6 w-6 text-primary"/><h2 className="mt-4 text-lg font-semibold">Multiple posts</h2><p className="mt-1 text-sm text-muted-foreground">Create several posts together.</p><ArrowRight className="mt-6 h-5 w-5 text-primary transition-transform group-hover:translate-x-1"/></Link>
  </div>
  {posts.error&&<p role="alert" className="mt-5 text-sm text-destructive">{posts.error.message}</p>}
  <div className="mt-11 grid gap-8 md:grid-cols-2">
   <section><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Needs review</h2><Link to="/content" className="text-sm text-primary hover:underline">View all</Link></div><div className="mt-4 space-y-2">{review.length?review.map(p=><a href={`/approvals?post=${encodeURIComponent(p.id)}`} key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary/50"><div className="min-w-0"><p className="truncate text-sm font-medium">{p.title||'Untitled post'}</p><p className="truncate text-xs text-muted-foreground">{p.body}</p></div><StatusBadge status={p.status}/></a>):<p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">Nothing needs review.</p>}</div></section>
   <section><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Upcoming posts</h2><Link to="/calendar" className="text-sm text-primary hover:underline">Calendar</Link></div><div className="mt-4 space-y-2">{upcoming.length?upcoming.map(p=><div key={p.id} className="rounded-xl border border-border bg-card p-4"><p className="truncate text-sm font-medium">{p.title||'Untitled post'}</p><p className="mt-1 text-xs text-muted-foreground">{p.scheduledAt?new Date(p.scheduledAt).toLocaleString():''}</p></div>):<p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">No upcoming posts yet.</p>}</div></section>
  </div>
 </main>;
}
