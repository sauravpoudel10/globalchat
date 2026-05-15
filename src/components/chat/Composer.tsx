import { useEffect, useRef, useState } from "react";
import { Paperclip, Send, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/hooks/use-auth";
import { extractMentions, formatBytes } from "@/lib/mentions";

const MAX_BYTES = 1024 * 1024;

type Pending = { file: File } | null;

type Props = {
  profile: Profile;
  candidates: { username: string; online: boolean }[];
  onOptimistic: (m: {
    tempId: string;
    text: string;
    pdf?: { url: string; name: string; size: number };
  }) => void;
  onTyping: () => void;
};

export function Composer({ profile, candidates, onOptimistic, onTyping }: Props) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.style.height = "auto";
    inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 160) + "px";
  }, [text]);

  const filtered = mentionQuery == null
    ? []
    : candidates
        .filter((c) => c.username !== profile.username && c.username.startsWith(mentionQuery.toLowerCase()))
        .slice(0, 6);

  const updateText = (v: string) => {
    setText(v);
    onTyping();
    const caret = inputRef.current?.selectionStart ?? v.length;
    const before = v.slice(0, caret);
    const m = before.match(/(?:^|\s)@([a-z0-9_]*)$/i);
    if (m) {
      setMentionQuery(m[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  };

  const insertMention = (username: string) => {
    const caret = inputRef.current?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([a-z0-9_]*)$/i, `@${username} `);
    const after = text.slice(caret);
    const next = before + after;
    setText(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      const pos = before.length;
      inputRef.current?.setSelectionRange(pos, pos);
    });
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery != null && filtered.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((i) => (i + 1) % filtered.length); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setMentionIndex((i) => (i - 1 + filtered.length) % filtered.length); return; }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(filtered[mentionIndex].username);
        return;
      }
      if (e.key === "Escape") { setMentionQuery(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const pickFile = (file: File | null) => {
    setError(null);
    if (!file) return;
    if (file.type !== "application/pdf") {
      setError("Only PDF files are allowed.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`File is ${formatBytes(file.size)} — max is 1.00 MB.`);
      return;
    }
    setPending({ file });
  };

  const send = async () => {
    if (sending) return;
    const t = text.trim();
    if (!t && !pending) return;
    setSending(true);
    setError(null);
    const tempId = crypto.randomUUID();
    let pdf: { url: string; name: string; size: number } | undefined;

    try {
      if (pending) {
        const file = pending.file;
        const path = `${profile.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
        const up = await supabase.storage.from("pdfs").upload(path, file, {
          contentType: "application/pdf",
          upsert: false,
        });
        if (up.error) throw up.error;
        const { data: pub } = supabase.storage.from("pdfs").getPublicUrl(path);
        pdf = { url: pub.publicUrl, name: file.name, size: file.size };
      }

      onOptimistic({ tempId, text: t, pdf });

      const mentions = extractMentions(t);
      const { error: insErr } = await supabase.from("messages").insert({
        user_id: profile.id,
        username: profile.username,
        avatar_url: profile.avatar_url,
        text: t,
        mentions,
        pdf_url: pdf?.url ?? null,
        pdf_name: pdf?.name ?? null,
        pdf_size: pdf?.size ?? null,
      });
      if (insErr) throw insErr;

      setText("");
      setPending(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to send";
      setError(msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="relative">
      {filtered.length > 0 && (
        <div className="absolute bottom-full left-4 mb-2 w-72 rounded-xl border border-border bg-popover shadow-2xl overflow-hidden z-10">
          {filtered.map((c, i) => (
            <button
              key={c.username}
              onMouseDown={(e) => { e.preventDefault(); insertMention(c.username); }}
              className={`w-full text-left px-3 py-2 flex items-center gap-2 text-sm ${
                i === mentionIndex ? "bg-mention/15" : "hover:bg-surface-elevated"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${c.online ? "bg-online" : "bg-muted-foreground/40"}`} />
              <span className="font-medium">@{c.username}</span>
              {c.online && <span className="text-xs text-muted-foreground ml-auto">online</span>}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="mx-4 mb-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {pending && (
        <div className="mx-4 mb-2 flex items-center gap-2 text-sm bg-surface-elevated border border-border rounded-lg px-3 py-2">
          <Paperclip className="h-4 w-4 text-secondary" />
          <span className="truncate flex-1">{pending.file.name}</span>
          <span className="text-xs text-muted-foreground">{formatBytes(pending.file.size)}</span>
          <button onClick={() => setPending(null)} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="mx-4 mb-4 flex items-end gap-2 rounded-2xl border border-border bg-surface/80 backdrop-blur-md px-3 py-2 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20 transition">
        <button
          onClick={() => fileRef.current?.click()}
          className="p-2 rounded-lg text-muted-foreground hover:text-secondary hover:bg-secondary/10 transition shrink-0"
          aria-label="Attach PDF"
          type="button"
        >
          <Paperclip className="h-5 w-5" />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => updateText(e.target.value)}
          onKeyDown={onKey}
          rows={1}
          placeholder="Say something to the world…"
          className="flex-1 resize-none bg-transparent outline-none py-2 text-[15px] placeholder:text-muted-foreground max-h-40 scrollbar-thin"
        />
        <button
          onClick={send}
          disabled={sending || (!text.trim() && !pending)}
          className="h-9 px-3 rounded-lg gradient-brand text-primary-foreground font-medium inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition shrink-0"
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
