import type { ChunkLocation, SourceType } from "./types";

/** Format seconds as m:ss or h:mm:ss. */
export function formatTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** A short human label for where a chunk lives, shown on citation chips. */
export function locationLabel(
  type: SourceType,
  loc: ChunkLocation,
): string | null {
  if (type === "pdf" && loc.page !== undefined) return `p. ${loc.page}`;
  if ((type === "youtube" || type === "vtt") && loc.startSec !== undefined)
    return formatTimestamp(loc.startSec);
  if (type === "url" && loc.section) return truncate(loc.section, 40);
  return null;
}

export function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}

export const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  pdf: "PDF",
  text: "Text",
  url: "Website",
  youtube: "YouTube",
  vtt: "Transcript",
};
