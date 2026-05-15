type Props = {
  url?: string | null;
  name: string;
  size?: number;
  online?: boolean;
};

export function Avatar({ url, name, size = 36, online }: Props) {
  const initials = name
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .split(/[\s_]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          referrerPolicy="no-referrer"
          className="rounded-full object-cover w-full h-full ring-1 ring-border"
        />
      ) : (
        <div
          className="rounded-full grid place-items-center text-xs font-semibold gradient-brand text-primary-foreground w-full h-full"
        >
          {initials}
        </div>
      )}
      {online && (
        <span
          className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full bg-online ring-2 ring-background"
          aria-label="online"
        />
      )}
    </div>
  );
}
