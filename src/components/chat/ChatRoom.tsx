import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/hooks/use-auth";
import { MessageBubble, type Message } from "./MessageBubble";
import { Composer } from "./Composer";
import { Avatar } from "./Avatar";
import { Bell, Hash, Loader2, LogOut, MessagesSquare, Plus } from "lucide-react";

const PAGE = 100;
const LOCAL_ROOMS_KEY = "worldchat.localRooms";
const LOCAL_MESSAGES_KEY = "worldchat.localRoomMessages";

type Room = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  created_by: string | null;
  is_default: boolean;
  created_at: string;
};

const LOCAL_GLOBAL_ROOM: Room = {
  id: "local-global",
  name: "Global",
  slug: "global",
  description: "The default WorldChat room.",
  created_by: null,
  is_default: true,
  created_at: "2026-01-01T00:00:00.000Z",
};

function isSchemaMissing(error: unknown, tableOrColumn: string) {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { code?: unknown; message?: unknown };
  const message = typeof maybe.message === "string" ? maybe.message.toLowerCase() : "";
  const target = tableOrColumn.toLowerCase();

  return maybe.code === "PGRST205" || maybe.code === "PGRST204" || message.includes(target);
}

function normalizeMessage(message: Partial<Message>, roomId: string): Message {
  return {
    id: message.id ?? crypto.randomUUID(),
    room_id: message.room_id ?? roomId,
    user_id: message.user_id ?? "",
    username: message.username ?? "anonymous",
    avatar_url: message.avatar_url ?? null,
    text: message.text ?? "",
    mentions: message.mentions ?? [],
    is_anonymous: message.is_anonymous ?? false,
    pdf_url: message.pdf_url ?? null,
    pdf_name: message.pdf_name ?? null,
    pdf_size: message.pdf_size ?? null,
    created_at: message.created_at ?? new Date().toISOString(),
  };
}

function getLocalRooms() {
  if (typeof window === "undefined") return [LOCAL_GLOBAL_ROOM];

  try {
    const saved = JSON.parse(window.localStorage.getItem(LOCAL_ROOMS_KEY) ?? "[]") as Room[];
    const customRooms = saved.filter((room) => room.id !== LOCAL_GLOBAL_ROOM.id);
    return sortRooms([LOCAL_GLOBAL_ROOM, ...customRooms]);
  } catch {
    return [LOCAL_GLOBAL_ROOM];
  }
}

function saveLocalRooms(rooms: Room[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    LOCAL_ROOMS_KEY,
    JSON.stringify(rooms.filter((room) => room.id !== LOCAL_GLOBAL_ROOM.id)),
  );
}

function getLocalRoomMessages(roomId: string) {
  if (typeof window === "undefined") return [];

  try {
    const saved = JSON.parse(window.localStorage.getItem(LOCAL_MESSAGES_KEY) ?? "{}") as Record<
      string,
      Message[]
    >;
    return saved[roomId] ?? [];
  } catch {
    return [];
  }
}

function saveLocalRoomMessages(roomId: string, messages: Message[]) {
  if (typeof window === "undefined") return;

  const saved = JSON.parse(window.localStorage.getItem(LOCAL_MESSAGES_KEY) ?? "{}") as Record<
    string,
    Message[]
  >;
  saved[roomId] = messages;
  window.localStorage.setItem(LOCAL_MESSAGES_KEY, JSON.stringify(saved));
}

function sortRooms(rooms: Room[]) {
  return rooms.slice().sort((a, b) => {
    if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}

function makeSlug(name: string) {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 38) || "room";
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

export function ChatRoom({ profile }: { profile: Profile }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomName, setRoomName] = useState("");
  const [roomError, setRoomError] = useState<string | null>(null);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [roomsStoredRemotely, setRoomsStoredRemotely] = useState(true);

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [presence, setPresence] = useState<
    Map<string, { username: string; avatar_url: string | null }>
  >(new Map());
  const [typingUsers, setTypingUsers] = useState<Map<string, number>>(new Map());
  const [flashId, setFlashId] = useState<string | null>(null);
  const [unreadMentions, setUnreadMentions] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const activeRoom = useMemo(
    () =>
      rooms.find((room) => room.id === activeRoomId) ??
      rooms.find((room) => room.is_default) ??
      rooms[0] ??
      null,
    [activeRoomId, rooms],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setRoomsLoading(true);
      const { data, error } = await supabase
        .from("chat_rooms")
        .select("*")
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true });

      if (cancelled) return;
      if (error) {
        if (isSchemaMissing(error, "chat_rooms")) {
          const localRooms = getLocalRooms();
          setRooms(localRooms);
          setActiveRoomId((prev) => prev ?? localRooms[0]?.id ?? null);
          setRoomsStoredRemotely(false);
          setRoomError(null);
          setRoomsLoading(false);
          return;
        }

        setRoomError(error.message);
        setRoomsLoading(false);
        return;
      }

      const nextRooms = sortRooms((data ?? []) as Room[]);
      setRooms(nextRooms);
      setRoomsStoredRemotely(true);
      setActiveRoomId((prev) => {
        if (prev && nextRooms.some((room) => room.id === prev)) return prev;
        return nextRooms[0]?.id ?? null;
      });
      setRoomsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!roomsStoredRemotely) return;

    const roomChannel = supabase
      .channel("worldchat-rooms")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_rooms" },
        (payload) => {
          const room = payload.new as Room;
          setRooms((prev) =>
            sortRooms(prev.some((r) => r.id === room.id) ? prev : [...prev, room]),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_rooms" },
        (payload) => {
          const room = payload.new as Room;
          setRooms((prev) => sortRooms(prev.map((r) => (r.id === room.id ? room : r))));
        },
      )
      .subscribe();

    return () => {
      roomChannel.unsubscribe();
      supabase.removeChannel(roomChannel);
    };
  }, [roomsStoredRemotely]);

  useEffect(() => {
    if (!activeRoomId) return;

    let cancelled = false;
    setLoading(true);
    setMessages([]);
    setHasMore(true);
    setUnreadMentions(0);
    setPresence(new Map());
    setTypingUsers(new Map());
    setAutoScroll(true);

    (async () => {
      if (!roomsStoredRemotely) {
        setMessages(getLocalRoomMessages(activeRoomId));
        setHasMore(false);
        setLoading(false);
        requestAnimationFrame(() => bottomRef.current?.scrollIntoView());
        return;
      }

      let data: unknown[] | null = null;
      let error: unknown = null;

      if (roomsStoredRemotely) {
        const res = await supabase
          .from("messages")
          .select("*")
          .eq("room_id", activeRoomId)
          .order("created_at", { ascending: false })
          .limit(PAGE);
        data = res.data;
        error = res.error;
      }

      if (!roomsStoredRemotely || isSchemaMissing(error, "room_id")) {
        const res = await supabase
          .from("messages")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(PAGE);
        data = res.data;
        error = res.error;
      }

      if (cancelled) return;
      if (error && isSchemaMissing(error, "messages")) {
        setMessages([]);
        setHasMore(false);
        setLoading(false);
        return;
      }

      const list = (data ?? [])
        .slice()
        .reverse()
        .map((message) => normalizeMessage(message as Partial<Message>, activeRoomId));
      const localMessages = getLocalRoomMessages(activeRoomId).filter(
        (localMessage) => !list.some((remoteMessage) => remoteMessage.id === localMessage.id),
      );
      const mergedMessages = [...list, ...localMessages].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      setMessages(mergedMessages);
      setHasMore((data ?? []).length === PAGE);
      setLoading(false);
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView());
    })();

    return () => {
      cancelled = true;
    };
  }, [activeRoomId, roomsStoredRemotely]);

  useEffect(() => {
    if (!activeRoomId) return;
    if (!roomsStoredRemotely) return;

    const channel = supabase.channel(`worldchat:${activeRoomId}`, {
      config: { presence: { key: profile.id } },
    });

    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `room_id=eq.${activeRoomId}`,
        },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) => {
            const idx = prev.findIndex(
              (p) =>
                p.user_id === m.user_id &&
                p.room_id === m.room_id &&
                p.text === m.text &&
                p.is_anonymous === m.is_anonymous,
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
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages" },
        (payload) => {
          const id = (payload.old as { id: string }).id;
          setMessages((prev) => prev.filter((m) => m.id !== id));
        },
      )
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
            if (p?.username)
              map.set(p.username, { username: p.username, avatar_url: p.avatar_url });
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
      if (channelRef.current === channel) channelRef.current = null;
    };
  }, [activeRoomId, roomsStoredRemotely, profile.id, profile.username, profile.avatar_url]);

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

  useEffect(() => {
    if (!autoScroll) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, autoScroll]);

  const loadOlder = async () => {
    if (loadingMore || !hasMore || messages.length === 0 || !activeRoomId) return;
    if (!roomsStoredRemotely) return;
    setLoadingMore(true);
    const oldest = messages[0].created_at;
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("room_id", activeRoomId)
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

  const onlineUsernames = useMemo(() => new Set(presence.keys()), [presence]);

  const candidates = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const u of onlineUsernames) map.set(u, true);
    for (let i = messages.length - 1; i >= Math.max(0, messages.length - 50); i--) {
      const m = messages[i];
      if (m.is_anonymous) continue;
      const u = m.username;
      if (u && !map.has(u)) map.set(u, false);
    }
    return [...map.entries()].map(([username, online]) => ({ username, online }));
  }, [messages, onlineUsernames]);

  const createRoom = async () => {
    const name = roomName.trim();
    if (name.length < 2) {
      setRoomError("Room name needs at least 2 characters.");
      return;
    }

    setCreatingRoom(true);
    setRoomError(null);

    if (!roomsStoredRemotely) {
      const room: Room = {
        id: crypto.randomUUID(),
        name,
        slug: makeSlug(name),
        description: null,
        created_by: profile.id,
        is_default: false,
        created_at: new Date().toISOString(),
      };
      const nextRooms = sortRooms([...rooms, room]);
      setRooms(nextRooms);
      saveLocalRooms(nextRooms);
      setActiveRoomId(room.id);
      setRoomName("");
      setCreatingRoom(false);
      return;
    }

    const { data, error } = await supabase
      .from("chat_rooms")
      .insert({
        name,
        slug: makeSlug(name),
        created_by: profile.id,
      })
      .select("*")
      .single();

    setCreatingRoom(false);
    if (error) {
      if (isSchemaMissing(error, "chat_rooms")) {
        setRoomsStoredRemotely(false);
        setRoomError(null);
        const localRooms = getLocalRooms();
        setRooms(localRooms);
        setActiveRoomId((prev) => prev ?? localRooms[0]?.id ?? null);
        return;
      }

      setRoomError(error.message);
      return;
    }

    const room = data as Room;
    setRooms((prev) => sortRooms(prev.some((r) => r.id === room.id) ? prev : [...prev, room]));
    setActiveRoomId(room.id);
    setRoomName("");
  };

  const onMentionClick = useCallback(
    (username: string) => {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (!messages[i].is_anonymous && messages[i].username === username) {
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
    },
    [messages],
  );

  const onOptimistic = useCallback(
    ({
      tempId,
      text,
      isAnonymous,
      pdf,
    }: {
      tempId: string;
      text: string;
      isAnonymous: boolean;
      pdf?: { url: string; name: string; size: number };
    }) => {
      if (!activeRoomId) return;

      const m: Message = {
        id: tempId,
        room_id: activeRoomId,
        user_id: profile.id,
        username: isAnonymous ? "anonymous" : profile.username,
        avatar_url: isAnonymous ? null : profile.avatar_url,
        text,
        mentions: [],
        is_anonymous: isAnonymous,
        pdf_url: pdf?.url ?? null,
        pdf_name: pdf?.name ?? null,
        pdf_size: pdf?.size ?? null,
        created_at: new Date().toISOString(),
        pending: true,
      };
      setMessages((prev) => {
        const nextMessages = [...prev, m];
        if (!roomsStoredRemotely) {
          saveLocalRoomMessages(activeRoomId, nextMessages);
        }
        return nextMessages;
      });
      setAutoScroll(true);
    },
    [activeRoomId, roomsStoredRemotely, profile.id, profile.username, profile.avatar_url],
  );

  const onSettled = useCallback(
    (tempId: string) => {
      if (!activeRoomId) return;

      setMessages((prev) => {
        const nextMessages = prev.map((message) =>
          message.id === tempId ? { ...message, pending: false } : message,
        );
        saveLocalRoomMessages(
          activeRoomId,
          nextMessages.filter((message) => !message.pending),
        );
        return nextMessages;
      });
    },
    [activeRoomId],
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
    <div className="flex h-screen flex-col">
      <header className="relative shrink-0 border-b border-border glass">
        <div className="absolute inset-x-0 -bottom-px h-px gradient-brand opacity-50" />
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl gradient-brand shadow-lg">
            <MessagesSquare className="h-5 w-5 text-primary-foreground" strokeWidth={2.4} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-semibold leading-none tracking-tight">
              WorldChat
              {activeRoom && <span className="text-muted-foreground">/ {activeRoom.name}</span>}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-online animate-pulse" />
              {presence.size} online in this room
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {unreadMentions > 0 && (
              <button
                onClick={() => {
                  setUnreadMentions(0);
                  bottomRef.current?.scrollIntoView({ behavior: "smooth" });
                }}
                className="relative inline-flex items-center gap-1.5 rounded-lg bg-mention/15 px-2.5 py-1.5 text-xs font-medium text-mention transition hover:bg-mention/25"
              >
                <Bell className="h-3.5 w-3.5" />
                {unreadMentions} mention{unreadMentions === 1 ? "" : "s"}
              </button>
            )}
            <div className="flex items-center gap-2 pl-2">
              <Avatar url={profile.avatar_url} name={profile.username} size={28} online />
              <div className="hidden text-sm sm:block">
                <div className="font-medium leading-none">@{profile.username}</div>
              </div>
            </div>
            <button
              onClick={signOut}
              className="ml-1 rounded-lg p-2 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <MobileRooms rooms={rooms} activeRoomId={activeRoomId} onSelect={setActiveRoomId} />

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-72 shrink-0 border-r border-border bg-surface/35 p-3 md:flex md:flex-col">
          <RoomPanel
            rooms={rooms}
            activeRoomId={activeRoomId}
            roomsLoading={roomsLoading}
            roomName={roomName}
            roomError={roomError}
            creatingRoom={creatingRoom}
            onRoomNameChange={setRoomName}
            onCreateRoom={createRoom}
            onSelectRoom={setActiveRoomId}
          />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="flex-1 overflow-y-auto scrollbar-thin"
          >
            <div className="mx-auto max-w-3xl py-4">
              {loadingMore && (
                <div className="py-2 text-center text-xs text-muted-foreground">
                  Loading older messages...
                </div>
              )}
              {!hasMore && messages.length > 0 && (
                <div className="py-2 text-center text-xs text-muted-foreground">
                  Start of this room
                </div>
              )}
              {loading && (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  Connecting to the room...
                </div>
              )}
              {!loading && !activeRoom && (
                <div className="px-6 py-16 text-center text-sm text-muted-foreground">
                  Create a room to start chatting.
                </div>
              )}
              {!loading && activeRoom && messages.length === 0 && (
                <div className="px-6 py-16 text-center text-sm text-muted-foreground">
                  No messages in {activeRoom.name} yet. Start the conversation.
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

          <div className="shrink-0">
            <div className="mx-auto max-w-3xl">
              <div className="flex h-6 items-center px-6 text-xs text-muted-foreground">
                {typingList.length > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-flex gap-0.5">
                      <span className="typing-dot inline-block h-1 w-1 rounded-full bg-muted-foreground" />
                      <span
                        className="typing-dot inline-block h-1 w-1 rounded-full bg-muted-foreground"
                        style={{ animationDelay: "0.15s" }}
                      />
                      <span
                        className="typing-dot inline-block h-1 w-1 rounded-full bg-muted-foreground"
                        style={{ animationDelay: "0.3s" }}
                      />
                    </span>
                    {typingList.map((u, i) => (
                      <span key={u}>
                        @{u}
                        {i < typingList.length - 1 ? ", " : ""}
                      </span>
                    ))}
                    {typingList.length === 1 ? " is typing..." : " are typing..."}
                  </span>
                )}
              </div>
              {activeRoomId && (
                <Composer
                  profile={profile}
                  candidates={candidates}
                  roomId={activeRoomId}
                  localOnly={!roomsStoredRemotely}
                  onOptimistic={onOptimistic}
                  onSettled={onSettled}
                  onTyping={onTyping}
                />
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function MobileRooms({
  rooms,
  activeRoomId,
  onSelect,
}: {
  rooms: Room[];
  activeRoomId: string | null;
  onSelect: (id: string) => void;
}) {
  if (rooms.length === 0) return null;

  return (
    <div className="border-b border-border bg-surface/35 px-3 py-2 md:hidden">
      <div className="flex gap-2 overflow-x-auto scrollbar-thin">
        {rooms.map((room) => (
          <button
            key={room.id}
            onClick={() => onSelect(room.id)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition ${
              activeRoomId === room.id
                ? "border-primary/45 bg-primary/15 text-foreground"
                : "border-border bg-background/35 text-muted-foreground hover:text-foreground"
            }`}
          >
            <Hash className="h-3.5 w-3.5" />
            {room.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function RoomPanel({
  rooms,
  activeRoomId,
  roomsLoading,
  roomName,
  roomError,
  creatingRoom,
  onRoomNameChange,
  onCreateRoom,
  onSelectRoom,
}: {
  rooms: Room[];
  activeRoomId: string | null;
  roomsLoading: boolean;
  roomName: string;
  roomError: string | null;
  creatingRoom: boolean;
  onRoomNameChange: (value: string) => void;
  onCreateRoom: () => void;
  onSelectRoom: (id: string) => void;
}) {
  return (
    <>
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="text-sm font-semibold">Rooms</div>
        {roomsLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 scrollbar-thin">
        {rooms.map((room) => (
          <button
            key={room.id}
            onClick={() => onSelectRoom(room.id)}
            className={`w-full rounded-md border px-3 py-2 text-left transition ${
              activeRoomId === room.id
                ? "border-primary/45 bg-primary/15 text-foreground"
                : "border-transparent text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
            }`}
          >
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{room.name}</span>
              {room.is_default && (
                <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  global
                </span>
              )}
            </div>
            {room.description && (
              <div className="mt-1 truncate pl-6 text-xs text-muted-foreground">
                {room.description}
              </div>
            )}
          </button>
        ))}
      </div>

      <form
        className="mt-3 space-y-2 border-t border-border pt-3"
        onSubmit={(event) => {
          event.preventDefault();
          void onCreateRoom();
        }}
      >
        <label className="text-xs font-medium text-muted-foreground" htmlFor="room-name">
          New room
        </label>
        <div className="flex gap-2">
          <input
            id="room-name"
            value={roomName}
            onChange={(event) => onRoomNameChange(event.target.value)}
            placeholder="Room name"
            className="min-w-0 flex-1 rounded-md border border-border bg-background/55 px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
          />
          <button
            type="submit"
            disabled={creatingRoom}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Create room"
          >
            {creatingRoom ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </button>
        </div>
        {roomError && <p className="text-xs leading-5 text-destructive">{roomError}</p>}
      </form>
    </>
  );
}
