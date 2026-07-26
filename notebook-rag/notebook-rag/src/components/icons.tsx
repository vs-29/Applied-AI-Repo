import type { SourceType } from "@/lib/types";

type P = { className?: string };

export const PlusIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const TrashIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <path d="M4 7h16M9 7V5h6v2m-8 0 1 12h8l1-12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const RefreshIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <path d="M20 11a8 8 0 1 0-.9 4M20 5v6h-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const CloseIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const SendIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <path d="M4 12l16-8-6 16-2.5-6.5L4 12z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
  </svg>
);

export const ExternalIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <path d="M14 5h5v5M19 5l-8 8M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Two-letter glyph badge per source type. */
export const SourceGlyph = ({ type }: { type: SourceType }) => {
  const map: Record<SourceType, { t: string; bg: string }> = {
    pdf: { t: "PDF", bg: "bg-rose-100 text-rose-700" },
    text: { t: "TXT", bg: "bg-slate-100 text-slate-700" },
    url: { t: "WEB", bg: "bg-sky-100 text-sky-700" },
    youtube: { t: "YT", bg: "bg-red-100 text-red-700" },
    vtt: { t: "VTT", bg: "bg-emerald-100 text-emerald-700" },
  };
  const g = map[type];
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-mono text-[9px] font-semibold ${g.bg}`}
    >
      {g.t}
    </span>
  );
};
