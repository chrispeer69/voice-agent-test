import { NAV, MORE_NAV } from "./sidebar";
import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useLocation } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Menu, LogOut, RefreshCw } from "lucide-react";
import { useBrand } from "@/lib/brand-context";
import { signOut } from "@/lib/auth.functions";
import { cn } from "@/lib/utils";
import type { BrandId } from "@/lib/types";

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const { brand, brands, setBrandId, refreshAgents, agentsLoading, agentsError } = useBrand();
  const [open, setOpen] = useState(false);
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
        <span className="truncate text-sm font-semibold text-foreground">{brand.name}</span>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <a href="/voice-lab/" className="shrink-0 whitespace-nowrap rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent">Voice Lab</a>
        {/* Agent selector */}
        <div className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            <span className={cn("h-2.5 w-2.5 rounded-full", brand.dotClass)} />
            <span className="hidden sm:inline">{brand.name}</span>
            <span className="sm:hidden">{brand.shortName}</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
          {open && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
              <div className="absolute right-0 z-20 mt-2 w-72 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
                <div className="flex items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span>Select AI agent</span>
                  <button type="button" onClick={() => void refreshAgents()} disabled={agentsLoading} aria-label="Refresh AI agents" title="Refresh AI agents" className="rounded p-1 hover:bg-accent disabled:opacity-50"><RefreshCw className={cn("h-4 w-4", agentsLoading && "animate-spin")} /></button>
                </div>
                {agentsError && <p role="alert" className="px-3 pb-2 text-xs text-destructive">{agentsError}</p>}
                <div className="max-h-80 overflow-y-auto">
                {brands.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => {
                      setBrandId(b.id as BrandId);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent",
                      brand.id === b.id && "bg-accent/60",
                    )}
                  >
                    <span className={cn("h-2.5 w-2.5 rounded-full", b.dotClass)} />
                    <div className="flex-1">
                      <div className="font-medium text-foreground">{b.name}</div>
                      <div className="text-[11px] text-muted-foreground">{b.tagline}</div>
                    </div>
                    {brand.id === b.id && <Check className="h-4 w-4 text-primary" />}
                  </button>
                ))}
                </div>
                <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">Published GHL agents appear after refresh.</p>
              </div>
            </>
          )}
        </div>

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
