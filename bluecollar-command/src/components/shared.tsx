import { cn } from "@/lib/utils";
import type { Platform, PostStatus } from "@/lib/types";
import { STATUS_META } from "@/lib/types";

export function StatusBadge({ status }: { status: PostStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
        meta.badge,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

export function PlatformIcon({ platform, className }: { platform: Platform; className?: string }) {
  const label =
    platform === "facebook"
      ? "f"
      : platform === "instagram"
        ? "IG"
        : platform === "linkedin"
          ? "in"
          : platform === "google"
            ? "G"
            : "X";
  return (
    <span
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-[11px] font-bold text-secondary-foreground",
        className,
      )}
      title={platform}
    >
      {label}
    </span>
  );
}

/**
 * Renders a small overlapping stack of platform icons for a multi-platform post.
 */
export function PlatformStack({
  platforms,
  max = 3,
  iconClassName,
  className,
}: {
  platforms: Platform[];
  max?: number;
  iconClassName?: string;
  className?: string;
}) {
  const shown = platforms.slice(0, max);
  const extra = platforms.length - shown.length;
  if (platforms.length === 0) {
    return (
      <span
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-md bg-muted text-[10px] text-muted-foreground",
          iconClassName,
        )}
        title="No platform"
      >
        —
      </span>
    );
  }
  return (
    <div className={cn("flex items-center -space-x-1.5", className)}>
      {shown.map((p) => (
        <PlatformIcon key={p} platform={p} className={cn("ring-1 ring-card", iconClassName)} />
      ))}
      {extra > 0 && (
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-md bg-secondary text-[10px] font-semibold text-secondary-foreground ring-1 ring-card",
            iconClassName ?? "h-7 w-7",
          )}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-5 shadow-sm", className)}>
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: string;
}) {
  return (
    <Card>
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-2 text-3xl font-semibold tabular-nums", accent ?? "text-foreground")}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}
