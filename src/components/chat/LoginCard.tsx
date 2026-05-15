import { useState } from "react";
import { lovable } from "@/integrations/lovable";
import { MessagesSquare } from "lucide-react";

export function LoginCard() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    setLoading(true);
    setError(null);
    const res = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (res.error) {
      setError(res.error.message ?? "Sign-in failed");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="relative rounded-3xl border border-border bg-surface/80 backdrop-blur-xl p-8 shadow-2xl overflow-hidden">
          <div className="absolute inset-x-0 -top-px h-px gradient-brand opacity-80" />
          <div className="absolute -top-24 -right-16 h-56 w-56 rounded-full bg-secondary/25 blur-3xl" />
          <div className="absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-primary/25 blur-3xl" />

          <div className="relative">
            <div className="flex items-center gap-2 mb-8">
              <div className="h-9 w-9 rounded-xl gradient-brand grid place-items-center shadow-lg">
                <MessagesSquare className="h-5 w-5 text-primary-foreground" strokeWidth={2.4} />
              </div>
              <span className="font-semibold tracking-tight text-lg">WorldChat</span>
            </div>

            <h1 className="text-3xl font-semibold tracking-tight leading-tight">
              One room.<br />
              <span className="text-gradient-brand">The whole planet.</span>
            </h1>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              A single global chat for everyone signed in. Drop a message, share a PDF, mention someone — they'll know.
            </p>

            <button
              onClick={signIn}
              disabled={loading}
              className="mt-8 w-full inline-flex items-center justify-center gap-3 rounded-xl bg-foreground text-background font-medium py-3 px-4 hover:bg-foreground/90 transition disabled:opacity-60"
            >
              <GoogleIcon />
              {loading ? "Redirecting…" : "Continue with Google"}
            </button>

            {error && (
              <p className="mt-4 text-sm text-destructive">{error}</p>
            )}

            <p className="mt-6 text-xs text-muted-foreground">
              First-time sign-in auto-creates your @username.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.5 1.1 7.5 2.9l5.7-5.7C33.6 6.5 29 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.3-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 18.9 12.5 24 12.5c2.9 0 5.5 1.1 7.5 2.9l5.7-5.7C33.6 6.5 29 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 43.5c5 0 9.5-1.9 12.9-5l-6-5c-1.9 1.4-4.3 2.3-6.9 2.3-5.3 0-9.7-3.4-11.3-8L6.2 32.5C9.5 38.5 16.2 43.5 24 43.5z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6 5C40.7 35.7 43.5 30.3 43.5 24c0-1.2-.1-2.3-.4-3.5z"/>
    </svg>
  );
}
