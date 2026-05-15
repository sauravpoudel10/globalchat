import { FileText } from "lucide-react";
import { formatBytes } from "@/lib/mentions";

type Props = { url: string; name: string; size: number };

export function PdfCard({ url, name, size }: Props) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 inline-flex items-center gap-3 rounded-xl border border-border bg-surface-elevated/70 hover:bg-surface-elevated transition px-3 py-2 max-w-full"
    >
      <div className="h-9 w-9 rounded-lg grid place-items-center bg-secondary/15 text-secondary shrink-0">
        <FileText className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium truncate max-w-[220px]">{name}</div>
        <div className="text-xs text-muted-foreground">PDF · {formatBytes(size)}</div>
      </div>
    </a>
  );
}
