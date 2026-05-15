import { useState, type ReactNode } from "react";
import { authClient } from "@/integrations/auth/client";
import { EarthGlobe3D } from "@/components/chat/EarthGlobe3D";
import {
  ArrowRight,
  Globe2,
  LogIn,
  MessageCircle,
  MessagesSquare,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

export function LoginCard() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAuth, setShowAuth] = useState(false);

  const signIn = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await authClient.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/`,
      });

      if (res.error) {
        setError(res.error.message ?? "Sign-in failed");
        setLoading(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
      setLoading(false);
    }
  };

  const openAuth = () => {
    setShowAuth(true);
    window.setTimeout(() => {
      document.getElementById("login")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_38%,oklch(0.22_0.04_160/0.55)_0,transparent_55%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/0 via-background/30 to-background" />
      </div>

      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <a href="#top" className="flex items-center gap-2" aria-label="WorldChat home">
          <span className="grid h-9 w-9 place-items-center rounded-[8px] gradient-brand shadow-lg">
            <MessagesSquare className="h-5 w-5 text-primary-foreground" strokeWidth={2.4} />
          </span>
          <span className="text-lg font-semibold tracking-tight">WorldChat</span>
        </a>

        <nav className="flex items-center gap-1 text-sm text-muted-foreground">
          <a
            className="rounded-md px-3 py-2 transition hover:bg-foreground/10 hover:text-foreground"
            href="#about"
          >
            About
          </a>
          <button
            type="button"
            onClick={openAuth}
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 transition hover:bg-foreground/10 hover:text-foreground"
          >
            <LogIn className="h-4 w-4" />
            Login
          </button>
        </nav>
      </header>

      <section
        id="top"
        className="relative z-10 mx-auto w-full max-w-7xl overflow-x-clip px-5 pb-16 pt-2 sm:px-8 lg:min-h-[calc(100vh-76px)] lg:pt-8"
      >
        <GlobeScene
          size="large"
          className="pointer-events-none absolute inset-y-0 right-[-2%] z-0 hidden w-[82%] translate-x-[300px] translate-y-[200px] lg:block"
        />

        <div className="relative grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.8fr)] lg:items-center">
          <div className="relative z-10 max-w-2xl py-2 lg:py-12">
            <div className="mb-5 inline-flex items-center gap-2 rounded-md border border-foreground/15 bg-foreground/10 px-3 py-2 text-sm text-foreground/85 backdrop-blur">
              <Globe2 className="h-4 w-4 text-primary" />
              One global room, live for everyone.
            </div>

            <GlobeScene className="mb-4 min-h-[380px] sm:min-h-[500px] lg:hidden" />

            <h1 className="mt-[150px] max-w-3xl text-5xl font-semibold leading-[1.02] tracking-normal text-foreground drop-shadow-[0_2px_18px_rgba(0,0,0,0.55)] sm:text-6xl lg:mt-0 lg:text-7xl">
              WorldChat
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground drop-shadow-[0_2px_12px_rgba(0,0,0,0.55)] sm:text-xl">
              Talk with people around the world in one shared real-time chat. Sign up when you are
              ready and step straight into the conversation.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={openAuth}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:bg-primary/90"
              >
                Sign up
                <ArrowRight className="h-4 w-4" />
              </button>
              <a
                href="#about"
                className="inline-flex items-center justify-center rounded-md border border-foreground/15 bg-foreground/10 px-5 py-3 text-sm font-medium text-foreground backdrop-blur transition hover:bg-foreground/15"
              >
                About WorldChat
              </a>
            </div>
          </div>

          <div className="hidden lg:block" />
        </div>
      </section>

      <section
        id="about"
        className="relative z-10 border-y border-border/45 bg-surface/25 px-5 py-20 backdrop-blur-sm sm:px-8"
      >
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.8fr_1fr]">
          <div>
            <p className="text-sm font-medium text-primary">About</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-normal sm:text-4xl">
              A simple chat room with the whole planet in view.
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Feature
              icon={<Globe2 className="h-5 w-5" />}
              title="Worldwide"
              text="One shared lounge for global conversation."
            />
            <Feature
              icon={<MessagesSquare className="h-5 w-5" />}
              title="Real time"
              text="Messages appear as the room moves."
            />
            <Feature
              icon={<ShieldCheck className="h-5 w-5" />}
              title="Google sign-in"
              text="Quick entry with your account."
            />
          </div>
        </div>
      </section>

      <section id="login" className="relative z-10 px-5 py-20 sm:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_420px] lg:items-center">
          <div>
            <p className="text-sm font-medium text-primary">Login</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-normal sm:text-4xl">
              Join WorldChat when you are ready.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
              The Google sign-up panel stays hidden until someone chooses to sign up or log in from
              this landing page.
            </p>
          </div>

          {showAuth ? (
            <div className="rounded-[8px] border border-border bg-surface/88 p-6 shadow-2xl backdrop-blur-xl">
              <div className="mb-6 flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-[8px] gradient-brand">
                  <MessagesSquare className="h-5 w-5 text-primary-foreground" strokeWidth={2.4} />
                </span>
                <div>
                  <h3 className="font-semibold">Continue to WorldChat</h3>
                  <p className="text-sm text-muted-foreground">
                    Your account creates a chat profile.
                  </p>
                </div>
              </div>

              <button
                onClick={signIn}
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-3 rounded-md bg-foreground px-4 py-3 font-medium text-background transition hover:bg-foreground/90 disabled:opacity-60"
              >
                <GoogleIcon />
                {loading ? "Redirecting..." : "Sign in with Google"}
              </button>

              {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

              <p className="mt-5 text-xs leading-5 text-muted-foreground">
                First-time sign-in auto-creates your @username.
              </p>
            </div>
          ) : (
            <div className="rounded-[8px] border border-border bg-surface/70 p-6 backdrop-blur-md">
              <h3 className="text-lg font-semibold">Sign-up is one click away.</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Tap the button and the Google sign-up option will appear right here.
              </p>
              <button
                type="button"
                onClick={openAuth}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
              >
                Show sign-up
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </section>

      <footer className="relative z-10 border-t border-border px-5 py-8 text-sm text-muted-foreground sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p>WorldChat. One global room.</p>
          <div className="flex gap-4">
            <a className="transition hover:text-foreground" href="#about">
              About
            </a>
            <button type="button" onClick={openAuth} className="transition hover:text-foreground">
              Login
            </button>
          </div>
        </div>
      </footer>
    </main>
  );
}

function GlobeScene({
  className,
  size = "normal",
}: {
  className?: string;
  size?: "normal" | "large";
}) {
  const globeWidth = size === "large" ? "w-[min(135%,1100px)]" : "w-[min(100%,560px)]";
  const orbitWidth = size === "large" ? "w-[min(142%,1180px)]" : "w-[min(110%,640px)]";
  return (
    <div className={`relative ${className ?? ""}`}>
      <div
        className={`absolute left-1/2 top-1/2 z-0 aspect-square -translate-x-1/2 -translate-y-1/2 ${globeWidth}`}
      >
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,oklch(0.55_0.18_160/0.22)_0%,transparent_62%)] blur-2xl" />
        <div className="relative h-full w-full overflow-hidden rounded-full shadow-[0_0_80px_-20px_rgba(57,255,136,0.35)] ring-1 ring-primary/15">
          <EarthGlobe3D className="absolute inset-0 h-full w-full" />
        </div>
      </div>
      <div
        className={`pointer-events-none absolute left-1/2 top-1/2 z-[1] aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/20 animate-orbit-ring ${orbitWidth}`}
      />
      <FloatingMessage
        className="left-0 top-3 lg:left-[18%] lg:top-[6rem]"
        icon={<MessageCircle className="h-4 w-4" />}
        title="Seoul"
        text="Anyone awake?"
      />
      <FloatingMessage
        className="right-0 top-16 animation-delay-2"
        icon={<UsersRound className="h-4 w-4" />}
        title="Lagos"
        text="Just joined."
      />
      <FloatingMessage
        className="left-[34%] top-[6.9rem]"
        icon={<MessageCircle className="h-4 w-4" />}
        title="Beijing"
        text="Late night hello."
      />
      <FloatingMessage
        className="left-2 top-[13.5rem] animation-delay-4"
        icon={<Globe2 className="h-4 w-4" />}
        title="Sydney"
        text="Morning from here."
      />
      <FloatingMessage
        className="right-3 top-[15.5rem] animation-delay-2"
        icon={<MessageCircle className="h-4 w-4" />}
        title="Kathmandu"
        text="Namaste everyone."
      />
      <FloatingMessage
        className="left-10 top-[24.3rem] animation-delay-4"
        icon={<Globe2 className="h-4 w-4" />}
        title="Berlin"
        text="Hallo from Berlin."
      />
      <FloatingMessage
        className="right-8 top-[20rem] animation-delay-2"
        icon={<MessageCircle className="h-4 w-4" />}
        title="Austin"
        text="Dropping into chat."
      />
    </div>
  );
}

function FloatingMessage({
  className,
  icon,
  title,
  text,
}: {
  className: string;
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div
      className={`absolute z-10 w-40 rounded-[8px] border border-foreground/15 bg-surface/82 p-3 shadow-xl backdrop-blur-xl animate-chat-float sm:w-44 ${className}`}
    >
      <div className="flex items-center gap-2 text-primary">
        {icon}
        <span className="text-xs font-semibold uppercase">{title}</span>
      </div>
      <p className="mt-2 text-sm text-foreground">{text}</p>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-[8px] border border-border/60 bg-background/22 p-5 backdrop-blur-sm">
      <div className="mb-4 grid h-10 w-10 place-items-center rounded-[8px] bg-primary/12 text-primary">
        {icon}
      </div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.5 1.1 7.5 2.9l5.7-5.7C33.6 6.5 29 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.5 16 18.9 12.5 24 12.5c2.9 0 5.5 1.1 7.5 2.9l5.7-5.7C33.6 6.5 29 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 43.5c5 0 9.5-1.9 12.9-5l-6-5c-1.9 1.4-4.3 2.3-6.9 2.3-5.3 0-9.7-3.4-11.3-8L6.2 32.5C9.5 38.5 16.2 43.5 24 43.5z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6 5C40.7 35.7 43.5 30.3 43.5 24c0-1.2-.1-2.3-.4-3.5z"
      />
    </svg>
  );
}
