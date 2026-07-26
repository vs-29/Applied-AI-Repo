import type { IndexStatus } from "@/lib/types";

const CONFIG: Record<
  IndexStatus,
  { color: string; label: string; pulse: boolean }
> = {
  uploading: { color: "bg-status-idle", label: "Uploading", pulse: false },
  indexing: { color: "bg-status-indexing", label: "Indexing", pulse: true },
  ready: { color: "bg-status-ready", label: "Ready", pulse: false },
  error: { color: "bg-status-error", label: "Failed", pulse: false },
};

export function StatusDot({
  status,
  withLabel = false,
}: {
  status: IndexStatus;
  withLabel?: boolean;
}) {
  const c = CONFIG[status];
  return (
    <span className="inline-flex items-center gap-1.5" title={c.label}>
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${c.color} ${
          c.pulse ? "animate-pulsering" : ""
        }`}
      />
      {withLabel && (
        <span className="font-mono text-[11px] uppercase tracking-wide text-muted">
          {c.label}
        </span>
      )}
    </span>
  );
}
