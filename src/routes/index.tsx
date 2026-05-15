import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { LoginCard } from "@/components/chat/LoginCard";
import { ChatRoom } from "@/components/chat/ChatRoom";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WorldChat — one global room" },
      { name: "description", content: "A single global, real-time chat room. Sign in with Google and join the conversation." },
      { property: "og:title", content: "WorldChat — one global room" },
      { property: "og:description", content: "A single global, real-time chat room. Sign in with Google and join." },
    ],
  }),
  component: Index,
});

function Index() {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!user) return <LoginCard />;

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Setting up your profile…</div>
      </div>
    );
  }

  return <ChatRoom profile={profile} />;
}
