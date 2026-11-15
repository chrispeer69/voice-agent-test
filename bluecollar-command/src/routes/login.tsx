import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Lock, Zap, AlertCircle, Loader2 } from "lucide-react";
import { login } from "@/lib/auth.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Blue Collar AI Command Center" },
      {
        name: "description",
        content: "Internal access to the Blue Collar AI Marketing Command Center.",
      },
      { property: "og:title", content: "Sign in — Blue Collar AI Command Center" },
      { property: "og:description", content: "Internal access to the command center." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const loginFn = useServerFn(login);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: (pw: string) => loginFn({ data: { password: pw } }),
    onSuccess: (data) => {
      if (data.ok) {
        navigate({ to: "/" });
      } else {
        setError(data.error ?? "Sign in failed");
      }
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Sign in failed"),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || mut.isPending) return;
    setError(null);
    mut.mutate(password);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-grid px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15">
            <Zap className="h-6 w-6 text-primary" />
          </div>
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">
            Blue Collar AI
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Marketing Command Center</p>
        </div>

        <form
          onSubmit={submit}
          className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-sm"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Lock className="h-4 w-4 text-primary" />
            Internal access
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            This tool is restricted to authorized team members. Sign in with the access password.
          </p>

          <label className="mt-5 block">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Access password
            </span>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="Enter password"
            />
          </label>

          {error && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
              <span className="text-xs text-destructive">{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={!password || mut.isPending}
            className={cn(
              "mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50",
            )}
          >
            {mut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Sign in
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          No live social-media actions are performed. Publishing requires explicit approval.
        </p>
      </div>
    </div>
  );
}
