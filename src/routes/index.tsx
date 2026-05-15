import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { LoginCard } from "@/components/chat/LoginCard";
import { ChatRoom } from "@/components/chat/ChatRoom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WorldChat - one global room" },
      {
        name: "description",
        content:
          "A single global, real-time chat room. Sign in with Google and join the conversation.",
      },
      { property: "og:title", content: "WorldChat - one global room" },
      {
        property: "og:description",
        content: "A single global, real-time chat room. Sign in with Google and join.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const { user, profile, profileError, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) return <LoginCard />;

  if (!profile) {
    if (profileError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
          <div className="max-w-md space-y-4">
            <div>
              <h1 className="text-xl font-semibold text-foreground">Profile setup needs database access</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                You are signed in, but WorldChat could not create your chat profile.
              </p>
            </div>
            <p className="rounded-md border border-border/70 bg-surface/40 px-4 py-3 text-xs text-muted-foreground">
              {profileError}
            </p>
            <div className="flex justify-center gap-3">
              <Button onClick={() => window.location.reload()}>Try again</Button>
              <Button variant="outline" onClick={() => supabase.auth.signOut()}>
                Sign out
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-sm text-muted-foreground">Setting up your profile...</div>
      </div>
    );
  }

  return <ChatRoom profile={profile} />;
}
