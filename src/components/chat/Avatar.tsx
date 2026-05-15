import { UserRound } from "lucide-react";

type Props = {
  url?: string | null;
  name: string;
  size?: number;
  online?: boolean;
};

export function Avatar({ url, name, size = 36, online }: Props) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {url ? (
        <img
          src={url}
          alt=""
          referrerPolicy="no-referrer"
          className="rounded-full object-cover w-full h-full ring-1 ring-border"
        />
      ) : (
        <div className="grid h-full w-full place-items-center rounded-full gradient-brand text-primary-foreground ring-1 ring-border">
          <UserRound aria-hidden className="h-[58%] w-[58%]" strokeWidth={2.2} />
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
