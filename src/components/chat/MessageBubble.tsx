import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Avatar } from "./Avatar";
import { PdfCard } from "./PdfCard";
import { parseMessage, relativeTime } from "@/lib/mentions";
import { supabase } from "@/integrations/supabase/client";

export type Message = {
  id: string;
  room_id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  text: string;
  mentions: string[];
  is_anonymous: boolean;
  pdf_url: string | null;
  pdf_name: string | null;
  pdf_size: number | null;
  created_at: string;
  pending?: boolean;
};

type Props = {
  message: Message;
  ownUserId?: string;
  ownUsername?: string;
  onlineUsernames: Set<string>;
  onMentionClick: (username: string) => void;
  flashed?: boolean;
};

export function MessageBubble({
  message,
  ownUserId,
  ownUsername,
  onlineUsernames,
  onMentionClick,
  flashed,
}: Props) {
  const isOwn = message.user_id === ownUserId;
  const isAnonymous = message.is_anonymous;
  const displayName = isAnonymous ? "anonymous" : message.username;
  const displayAvatar = isAnonymous ? null : message.avatar_url;
  const [now, setNow] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNow((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (flashed && ref.current) {
      ref.current.classList.remove("animate-flash");
      // force reflow
      void ref.current.offsetWidth;
      ref.current.classList.add("animate-flash");
    }
  }, [flashed]);

  const tokens = parseMessage(message.text);

  const remove = async () => {
    if (!isOwn) return;
    if (!confirm("Delete this message?")) return;
    await supabase.from("messages").delete().eq("id", message.id);
  };

  return (
    <div
      data-msg-id={message.id}
      data-username={displayName}
      className={`group flex gap-3 px-4 py-2 animate-msg-in rounded-xl ${
        flashed ? "animate-flash" : ""
      }`}
      ref={ref}
    >
      <Avatar
        url={displayAvatar}
        name={displayName}
        online={!isAnonymous && onlineUsernames.has(message.username)}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-sm">
            {isAnonymous ? "Anonymous" : `@${message.username}`}
          </span>
          {isAnonymous && isOwn && (
            <span className="rounded-md bg-foreground/10 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              you
            </span>
          )}
          <span
            className="text-xs text-muted-foreground"
            title={new Date(message.created_at).toLocaleString()}
            data-tick={now}
          >
            {message.pending ? "sending…" : relativeTime(message.created_at)}
          </span>
          {isOwn && (
            <button
              onClick={remove}
              className="opacity-0 group-hover:opacity-100 transition text-muted-foreground hover:text-destructive ml-auto"
              aria-label="Delete message"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {message.text && (
          <div
            className={`mt-1 text-[15px] leading-relaxed inline-block max-w-full px-3 py-2 rounded-2xl break-words ${
              isOwn
                ? "bg-primary/15 border border-primary/30"
                : "bg-surface-elevated border border-border"
            } ${message.pending ? "opacity-60" : ""}`}
          >
            {tokens.map((t, i) =>
              t.type === "text" ? (
                <span key={i}>{t.value}</span>
              ) : (
                <button
                  key={i}
                  onClick={() => onMentionClick(t.value)}
                  className={`inline-flex items-center rounded-md px-1.5 py-0.5 mx-0.5 text-sm font-medium bg-mention/20 text-mention hover:bg-mention/30 transition ${
                    ownUsername === t.value ? "ring-1 ring-mention" : ""
                  }`}
                >
                  @{t.value}
                </button>
              ),
            )}
          </div>
        )}
        {message.pdf_url && message.pdf_name && message.pdf_size != null && (
          <PdfCard url={message.pdf_url} name={message.pdf_name} size={message.pdf_size} />
        )}
      </div>
    </div>
  );
}
