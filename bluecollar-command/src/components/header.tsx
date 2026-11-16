import { NAV, MORE_NAV } from "./sidebar";
import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useLocation } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Menu, LogOut } from "lucide-react";
import { signOut } from "@/lib/auth.functions";

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const guided = useLocation().pathname === "/quick-create";
  const queryClient = useQueryClient();
  const signOutFn = useServerFn(signOut);

  const logoutMut = useMutation({
    mutationFn: () => signOutFn({ data: undefined }),
    onSuccess: () => {
      queryClient.clear();
      navigate({ to: "/login" });
    },
  });

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-xl md:px-6">
      {!guided && <button
        onClick={() => { setMenuOpen(v => !v); onMenuClick?.(); }}
        aria-expanded={menuOpen}
        aria-controls="mobile-site-menu"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent md:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>}

      {!guided && menuOpen && <nav id="mobile-site-menu" aria-label="Planner navigation" className="absolute inset-x-0 top-16 z-40 grid gap-1 border-b border-border bg-background p-3 shadow-lg md:hidden">
        {NAV.map(item => <Link key={item.to} to={item.to} onClick={() => setMenuOpen(false)} className="rounded px-3 py-2 text-sm hover:bg-accent">{item.label}</Link>)}
        <details className="border-t border-border pt-2"><summary className="cursor-pointer rounded px-3 py-2 text-sm">More tools</summary>{MORE_NAV.map(item => <Link key={item.to} to={item.to} onClick={() => setMenuOpen(false)} className="block rounded px-3 py-2 text-sm hover:bg-accent">{item.label}</Link>)}</details>
      </nav>}
      <div className="hidden min-w-0 flex-col sm:flex">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {guided ? "Create a post" : "Social Planner"}
        </span>
        <span className="truncate text-sm font-semibold text-foreground">Create, review and schedule</span>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <a href="/voice-lab/" className="shrink-0 whitespace-nowrap rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent">Voice Lab</a>

        {/* Sign out */}
        <button
          onClick={() => logoutMut.mutate()}
          disabled={logoutMut.isPending}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
