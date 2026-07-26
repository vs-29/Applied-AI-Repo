import type { ExtractedSegment, ExtractedSource } from "../types";
import { assembleContent } from "../chunk";
import { extractText } from "./text";

const TIMESTAMP =
  /(\d{1,2}:)?(\d{1,2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{1,2}:)?(\d{1,2}):(\d{2})[.,](\d{3})/;

function toSeconds(h: string | undefined, m: string, s: string): number {
  return (h ? parseInt(h) * 3600 : 0) + parseInt(m) * 60 + parseInt(s);
}

/**
 * Parse a WebVTT (or SRT-like) transcript into timestamped segments. Falls back
 * to plain-text handling if no cue timings are present.
 */
export function extractVtt(raw: string, title: string): ExtractedSource {
  const clean = raw.replace(/\r\n/g, "\n").replace(/^WEBVTT.*$/m, "").trim();
  const blocks = clean.split(/\n{2,}/);
  const segments: ExtractedSegment[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    const tsLine = lines.find((l) => TIMESTAMP.test(l));
    if (!tsLine) continue;
    const m = tsLine.match(TIMESTAMP);
    if (!m) continue;
    const startSec = toSeconds(m[1]?.replace(":", ""), m[2], m[3]);
    const endSec = toSeconds(m[5]?.replace(":", ""), m[6], m[7]);
    const text = lines
      .filter((l) => !TIMESTAMP.test(l) && !/^\d+$/.test(l.trim()))
      .join(" ")
      .replace(/<[^>]+>/g, "") // strip inline cue tags
      .replace(/\s+/g, " ")
      .trim();
    if (text) segments.push({ text, location: { startSec, endSec } });
  }

  if (segments.length === 0) {
    // No timings detected — treat the file as plain text.
    return extractText(raw, title);
  }

  const derivedTitle = title.replace(/\.(vtt|srt)$/i, "") || "Transcript";
  return {
    title: derivedTitle,
    content: assembleContent(segments),
    segments,
  };
}
