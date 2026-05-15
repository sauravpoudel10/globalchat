import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/hooks/use-auth";
import { MessageBubble, type Message } from "./MessageBubble";
import { Composer } from "./Composer";
import { Avatar } from "./Avatar";
import { LogOut, MessagesSquare, Bell } from "lucide-react";

const PAGE = 100;

export function ChatRoom({ profile }: { profile: Profile }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [presence, setPresence] = useState<Map<string, { username: string; avatar_url: string | null }>>(
    new Map(),
  );
  const [typingUsers, setTypingUsers] = useState<Map<string, number>>(new Map());
  const [flashId, setFlashId] = useState<string | null>(null);
  const [unreadMentions, setUnreadMentions] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(PAGE);
      if (cancelled) return;
      const list = (data ?? []).slice().reverse() as Message[];
      setMessages(list);
      setHasMore((data ?? []).length === PAGE);
      setLoading(false);
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView());
    })();
    return () => { cancelled = true; };
  }, []);

  // Realtime + presence
  useEffect(() => {
    const channel = supabase.channel("worldchat", {
      config: { presence: { key: profile.id } },
    });

    channel
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new as Message;
        setMessages((prev) => {
          // replace optimistic temp by user+text+createdAt match
          const idx = prev.findIndex(
            (p) => p.pending && p.user_id === m.user_id && p.text === m.text,
          );
          if (idx >= 0) {
            const next = prev.slice();
            next[idx] = m;
            return next;
          }
          if (prev.some((p) => p.id === m.id)) return prev;
          return [...prev, m];
        });
        if (m.mentions?.includes(profile.username) && m.user_id !== profile.id) {
          setUnreadMentions((n) => n + 1);
        }
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (payload) => {
        const id = (payload.old as { id: string }).id;
        setMessages((prev) => prev.filter((m) => m.id !== id));
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const u = payload?.username as string | undefined;
        if (!u || u === profile.username) return;
        setTypingUsers((prev) => {
          const next = new Map(prev);
          next.set(u, Date.now());
          return next;
        });
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<
          string,
          Array<{ username: string; avatar_url: string | null }>
        >;
        const map = new Map<string, { username: string; avatar_url: string | null }>();
        for (const arr of Object.values(state)) {
          for (const p of arr) {
            if (p?.username) map.set(p.username, { username: p.username, avatar_url: p.avatar_url });
          }
        }
        setPresence(map);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ username: profile.username, avatar_url: profile.avatar_url });
        }
      });

    channelRef.current = channel;
    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [profile.id, profile.username, profile.avatar_url]);

  // Sweep stale typing indicators
  useEffect(() => {
    const t = setInterval(() => {
      setTypingUsers((prev) => {
        const now = Date.now();
        const next = new Map(prev);
        for (const [k, v] of next) if (now - v > 3500) next.delete(k);
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-scroll on new messages if user is at bottom
  useEffect(() => {
    if (!autoScroll) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, autoScroll]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setAutoScroll(nearBottom);
    if (nearBottom && unreadMentions > 0) setUnreadMentions(0);

    if (el.scrollTop < 60 && hasMore && !loadingMore && messages.length > 0) {
      void loadOlder();
    }
  };

  const loadOlder = async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    const oldest = messages[0].created_at;
    const el = scrollRef.current!;
    const prevHeight = el.scrollHeight;
    const { data } = await supabase
      .from("messages")
      .select("*")
      .lt("created_at", oldest)
      .order("created_at", { ascending: false })
      .limit(PAGE);
    const older = (data ?? []).slice().reverse() as Message[];
    setMessages((prev) => [...older, ...prev]);
    setHasMore((data ?? []).length === PAGE);
    setLoadingMore(false);
    requestAnimationFrame(() => {
      if (!scrollRef.current) return;
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight - prevHeight;
    });
  };

  const onlineUsernames = useMemo(() => new Set(presence.keys()), [presence]);

  // Candidates for mention autocomplete: online users + recent senders
  const candidates = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const u of onlineUsernames) map.set(u, true);
    for (let i = messages.length - 1; i >= Math.max(0, messages.length - 50); i--) {
      const u = messages[i].username;
      if (!map.has(u)) map.set(u, false);
    }
    return [...map.entries()].map(([username, online]) => ({ username, online }));
  }, [messages, onlineUsernames]);

  const onMentionClick = useCallback((username: string) => {
    // Find the most recent message from this user
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].username === username) {
        const id = messages[i].id;
        const el = document.querySelector(`[data-msg-id="${id}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          setFlashId(id);
          setTimeout(() => setFlashId(null), 1700);
        }
        return;
      }
    }
  }, [messages]);

  const onOptimistic = useCallback(
    ({ tempId, text, pdf }: { tempId: string; text: string; pdf?: { url: string; name: string; size: number } }) => {
      const m: Message = {
        id: tempId,
        user_id: profile.id,
        username: profile.username,
        avatar_url: profile.avatar_url,
        text,
        mentions: [],
        pdf_url: pdf?.url ?? null,
        pdf_name: pdf?.name ?? null,
        pdf_size: pdf?.size ?? null,
        created_at: new Date().toISOString(),
        pending: true,
      };
      setMessages((prev) => [...prev, m]);
      setAutoScroll(true);
    },
    [profile.id, profile.username, profile.avatar_url],
  );

  const lastTypingSentRef = useRef(0);
  const onTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSentRef.current < 1500) return;
    lastTypingSentRef.current = now;
    channelRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { username: profile.username },
    });
  }, [profile.username]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const typingList = [...typingUsers.keys()].slice(0, 3);

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="relative shrink-0 border-b border-border glass">
        <div className="absolute inset-x-0 -bottom-px h-px gradient-brand opacity-50" />
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="h-9 w-9 rounded-xl gradient-brand grid place-items-center shadow-lg">
            <MessagesSquare className="h-5 w-5 text-primary-foreground" strokeWidth={2.4} />
          </div>
          <div className="min-w-0">
            <div className="font-semibold tracking-tight leading-none">WorldChat</div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-online animate-pulse" />
              {presence.size} online · one global room
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {unreadMentions > 0 && (
              <button
                onClick={() => {
                  setUnreadMentions(0);
                  bottomRef.current?.scrollIntoView({ behavior: "smooth" });
                }}
                className="relative inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-mention/15 text-mention hover:bg-mention/25 transition"
              >
                <Bell className="h-3.5 w-3.5" />
                {unreadMentions} new mention{unreadMentions === 1 ? "" : "s"}
              </button>
            )}
            <div className="flex items-center gap-2 pl-2">
              <Avatar url={profile.avatar_url} name={profile.username} size={28} online />
              <div className="hidden sm:block text-sm">
                <div className="font-medium leading-none">@{profile.username}</div>
              </div>
            </div>
            <button
              onClick={signOut}
              className="ml-1 p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Stream */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto scrollbar-thin"
      >
        <div className="max-w-3xl mx-auto py-4">
          {loadingMore && (
            <div className="text-center text-xs text-muted-foreground py-2">Loading older messages…</div>
          )}
          {!hasMore && messages.length > 0 && (
            <div className="text-center text-xs text-muted-foreground py-2">— start of the conversation —</div>
          )}
          {loading && (
            <div className="text-center text-sm text-muted-foreground py-12">Connecting to the room…</div>
          )}
          {!loading && messages.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-16">
              No messages yet. Be the first to say hi 👋
            </div>
          )}
          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              ownUserId={profile.id}
              ownUsername={profile.username}
              onlineUsernames={onlineUsernames}
              onMentionClick={onMentionClick}
              flashed={flashId === m.id}
            />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Typing + Composer */}
      <div className="shrink-0">
        <div className="max-w-3xl mx-auto">
          <div className="h-6 px-6 text-xs text-muted-foreground flex items-center">
            {typingList.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-flex gap-0.5">
                  <span className="typing-dot inline-block h-1 w-1 rounded-full bg-muted-foreground" />
                  <span className="typing-dot inline-block h-1 w-1 rounded-full bg-muted-foreground" style={{ animationDelay: "0.15s" }} />
                  <span className="typing-dot inline-block h-1 w-1 rounded-full bg-muted-foreground" style={{ animationDelay: "0.3s" }} />
                </span>
                {typingList.map((u, i) => (
                  <span key={u}>
                    @{u}{i < typingList.length - 1 ? ", " : ""}
                  </span>
                ))}
                {typingList.length === 1 ? " is typing…" : " are typing…"}
              </span>
            )}
          </div>
          <Composer
            profile={profile}
            candidates={candidates}
            onOptimistic={onOptimistic}
            onTyping={onTyping}
          />
        </div>
      </div>
    </div>
  );
}
