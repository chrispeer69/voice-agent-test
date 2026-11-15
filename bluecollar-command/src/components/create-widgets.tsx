// Sub-components for the Create Content route, split out to keep the route
// file focused. All client-safe.

import { useState, useEffect, useId, useRef } from "react";
import {
  Search,
  X,
  ChevronUp,
  ChevronDown,
  Plus,
  Upload,
  Trash2,
  Check,
  Link2,
  AlertTriangle,
} from "lucide-react";
import { PlatformIcon } from "@/components/shared";
import { PLATFORMS, PLATFORM_MEDIA_LIMITS } from "@/lib/types";
import type { Platform, ContentFormat, MediaItem, SocialAccount } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Searchable multi-select of connected social accounts (by account ID). */
export function AccountMultiSelect({
  accounts,
  selectedAccountIds,
  loading,
  noAccounts,
  error,
  onChange,
}: {
  accounts: SocialAccount[];
  selectedAccountIds: string[];
  loading: boolean;
  noAccounts: boolean;
  error?: string;
  onChange: (accountIds: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const filtered = accounts.filter(
    (a) =>
      a.account.toLowerCase().includes(query.toLowerCase()) ||
      a.platform.toLowerCase().includes(query.toLowerCase()),
  );

  function toggle(id: string) {
    const has = selectedAccountIds.includes(id);
    if (has) onChange(selectedAccountIds.filter((x) => x !== id));
    else onChange([...selectedAccountIds, id]);
  }

  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Link2 className="h-3.5 w-3.5" />
        Publish to connected accounts
        <span className="font-normal text-muted-foreground/70">
          · {selectedAccountIds.length} selected
        </span>
      </div>
      {loading && <p className="text-xs text-muted-foreground">Loading connected accounts…</p>}
      {noAccounts && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="text-xs text-muted-foreground">
            <p className="font-medium text-foreground">No connected social accounts returned.</p>
            {error ? (
              <p className="mt-1 font-mono text-[11px] text-muted-foreground/80">
                API response: {error}
              </p>
            ) : (
              <p className="mt-0.5">
                Connect accounts in the social planner to enable publishing. You can still draft
                below.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Selected chips */}
      {selectedAccountIds.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selectedAccountIds.map((id) => {
            const acct = accounts.find((a) => a.id === id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
              >
                {acct?.profileImageUrl ? (
                  <img
                    src={acct.profileImageUrl}
                    alt=""
                    className="h-4 w-4 rounded-full object-cover"
                  />
                ) : (
                  <PlatformIcon platform={acct?.platform ?? "facebook"} className="h-4 w-4" />
                )}
                {acct?.account ?? id}
                <button
                  onClick={() => toggle(id)}
                  className="ml-0.5 rounded-full hover:bg-primary/20"
                  aria-label={`Remove ${acct?.account ?? id}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {accounts.length > 0 && (
        <div className="relative">
          <button
            type="button"
            ref={trigger}
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => setOpen((v) => !v)}
            className="relative z-20 flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
          >
            <Search className="h-4 w-4" />
            {selectedAccountIds.length
              ? `${selectedAccountIds.length} accounts selected`
              : "Select accounts…"}
            <ChevronDown
              className={cn("ml-auto h-4 w-4 transition-transform", open && "rotate-180")}
            />
          </button>
          {open && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
              <div id={menuId} className="absolute z-20 mt-1 max-h-64 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
                <div className="border-b border-border p-2">
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="Search connected accounts"
                    placeholder="Search accounts…"
                    className="w-full rounded-md border border-border bg-input px-2.5 py-1.5 text-sm text-foreground"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {filtered.length === 0 && (
                    <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                      No matching accounts.
                    </p>
                  )}
                  {filtered.map((a) => {
                    const active = selectedAccountIds.includes(a.id);
                    return (
                      <button
                        key={a.id || a.platform}
                        type="button"
                        data-account-id={a.id}
                        aria-pressed={active}
                        onClick={() => toggle(a.id)}
                        className={cn(
                          "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                          active && "bg-primary/5",
                        )}
                      >
                        {a.profileImageUrl ? (
                          <img
                            src={a.profileImageUrl}
                            alt=""
                            className="h-7 w-7 rounded-full object-cover"
                          />
                        ) : (
                          <PlatformIcon platform={a.platform} className="h-7 w-7" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-foreground">{a.account}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {PLATFORMS.find((p) => p.id === a.platform)?.label ?? a.platform}
                          </div>
                        </div>
                        {active && <Check className="h-4 w-4 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Only accounts connected in the social planner are shown. Select multiple to publish across
        accounts. When platform-specific copy or media differs, a separate request is created per
        account.
      </p>
    </div>
  );
}

/** Media manager: add (URL/upload), reorder, preview, remove. */
export function MediaManager({
  media,
  format,
  maxImages,
  onAdd,
  onRemove,
  onMove,
}: {
  media: MediaItem[];
  format: ContentFormat;
  maxImages: number;
  onAdd: (url: string, type: "image" | "video") => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
}) {
  const [url, setUrl] = useState("");
  const isVideo = format === "video" || format === "reel" || format === "story";

  function handleAdd() {
    if (!url.trim()) return;
    onAdd(url.trim(), isVideo ? "video" : "image");
    setUrl("");
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    onAdd(objectUrl, file.type.startsWith("video") ? "video" : "image");
    e.target.value = "";
  }

  return (
    <div className="mt-4">
      <div className="flex gap-2">
        <input
          className="input flex-1"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={isVideo ? "Video URL…" : "Image URL…"}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent">
          <Upload className="h-4 w-4" /> Upload
          <input
            type="file"
            className="hidden"
            onChange={handleUpload}
            accept={isVideo ? "video/*" : "image/*"}
          />
        </label>
        <button
          onClick={handleAdd}
          disabled={!url.trim()}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>

      {media.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {media.map((m, i) => (
            <div
              key={m.id}
              className="group relative overflow-hidden rounded-lg border border-border bg-background/40"
            >
              <div className="aspect-square">
                {m.type === "video" ? (
                  <video src={m.url} className="h-full w-full object-cover" />
                ) : (
                  <img src={m.url} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                {i + 1}
              </div>
              <div className="absolute right-1 top-1 flex gap-1">
                <button
                  onClick={() => onMove(m.id, -1)}
                  disabled={i === 0}
                  className="rounded bg-black/60 p-1 text-white hover:bg-black/80 disabled:opacity-30"
                  aria-label="Move left"
                >
                  <ChevronUp className="h-3 w-3 rotate-[-90deg]" />
                </button>
                <button
                  onClick={() => onMove(m.id, 1)}
                  disabled={i === media.length - 1}
                  className="rounded bg-black/60 p-1 text-white hover:bg-black/80 disabled:opacity-30"
                  aria-label="Move right"
                >
                  <ChevronDown className="h-3 w-3 rotate-[-90deg]" />
                </button>
                <button
                  onClick={() => onRemove(m.id)}
                  className="rounded bg-black/60 p-1 text-white hover:bg-destructive"
                  aria-label="Remove"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        {isVideo
          ? "One video per post."
          : `Up to ${maxImages} image${maxImages === 1 ? "" : "s"} for the selected platforms.`}
      </p>
    </div>
  );
}

export function CarouselPreview({ media }: { media: MediaItem[] }) {
  const [idx, setIdx] = useState(0);
  const current = media[idx];
  return (
    <div className="relative h-full w-full">
      {current?.type === "video" ? (
        <video src={current.url} className="h-full w-full object-cover" controls />
      ) : (
        <img src={current?.url} alt="" className="h-full w-full object-cover" />
      )}
      <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
        {media.map((_, i) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            className={cn("h-1.5 w-1.5 rounded-full", i === idx ? "bg-white" : "bg-white/40")}
          />
        ))}
      </div>
      <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
        {idx + 1}/{media.length}
      </span>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function ActionButton({
  onClick,
  icon: Icon,
  label,
  loading,
  variant,
  disabled,
}: {
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  loading?: boolean;
  variant?: "primary";
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className={cn(
        "flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors disabled:opacity-50",
        variant === "primary"
          ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
          : "border-border bg-card text-foreground hover:bg-accent",
      )}
    >
      <Icon className="h-4 w-4" />
      {loading ? "…" : label}
    </button>
  );
}

export { PLATFORM_MEDIA_LIMITS };
