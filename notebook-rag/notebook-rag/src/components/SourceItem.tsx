import { StatusDot } from "./StatusDot";
import { RefreshIcon, SourceGlyph, TrashIcon } from "./icons";
import type { SourceDTO } from "@/lib/client";

export function SourceItem({
  source,
  onReindex,
  onDelete,
}: {
  source: SourceDTO;
  onReindex: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const busy = source.status === "indexing" || source.status === "uploading";
  return (
    <li className="group flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-primary-soft/60">
      <SourceGlyph type={source.type} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-ink" title={source.title}>
          {source.title}
        </p>
        <div className="mt-0.5 flex items-center gap-2">
          <StatusDot status={source.status} withLabel />
          {source.status === "ready" && (
            <span className="font-mono text-[10px] text-faint">
              {source.chunkCount} chunks
            </span>
          )}
        </div>
        {source.status === "error" && source.error && (
          <p className="mt-0.5 text-[11px] text-status-error" title={source.error}>
            {source.error}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
        <button
          className="btn-ghost !p-1.5"
          title="Re-index"
          disabled={busy}
          onClick={() => onReindex(source.id)}
        >
          <RefreshIcon className="h-4 w-4" />
        </button>
        <button
          className="btn-ghost !p-1.5 hover:!bg-status-error/10 hover:!text-status-error"
          title="Remove source"
          onClick={() => onDelete(source.id)}
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}
