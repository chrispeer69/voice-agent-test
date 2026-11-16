import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  PenSquare,
  CalendarDays,
  CheckSquare,
  MessageSquare,
  BarChart3,
  Settings,
  Zap,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const NAV = [
  { to: "/", label: "Home", icon: LayoutDashboard },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/content", label: "Content", icon: CheckSquare },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export const MORE_NAV = [
  { to: "/create", label: "Detailed editor", icon: PenSquare },
  { to: "/batch", label: "Multiple posts", icon: Layers },
  { to: "/approvals", label: "Approvals", icon: CheckSquare },
  { to: "/comments", label: "Comments", icon: MessageSquare },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
] as const;

export function Sidebar() {
  const location = useLocation();
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
      <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15">
          <Zap className="h-5 w-5 text-primary" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-sidebar-foreground">Social Planner</div>
          <div className="text-[11px] text-muted-foreground">Blue Collar AI</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV.map((item) => {
          const active =
            item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              <Icon className="h-4.5 w-4.5 shrink-0" strokeWidth={active ? 2.4 : 2} />
              {item.label}
            </Link>
          );
        })}
        <details className="pt-3"><summary className="cursor-pointer rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-sidebar-accent">More tools</summary><div className="mt-1 space-y-1">{MORE_NAV.map(item => <Link key={item.to} to={item.to} className="block rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground">{item.label}</Link>)}</div></details>
      </nav>
      <div className="border-t border-sidebar-border px-5 py-4">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Connected to GHL. Publishing and scheduling send posts to your selected social accounts.
        </p>
      </div>
    </aside>
  );
}
