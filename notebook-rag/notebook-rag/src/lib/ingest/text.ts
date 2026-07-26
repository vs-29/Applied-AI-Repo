import type { ExtractedSegment, ExtractedSource } from "../types";
import { assembleContent } from "../chunk";

/** Split pasted/plain text into paragraph segments. */
export function extractText(raw: string, title: string): ExtractedSource {
  const normalized = raw.replace(/\r\n/g, "\n").trim();
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const segments: ExtractedSegment[] = (
    paragraphs.length ? paragraphs : [normalized]
  ).map((text) => ({ text, location: {} }));

  const derivedTitle =
    title.trim() || normalized.split("\n")[0]?.slice(0, 80) || "Text note";

  return { title: derivedTitle, content: assembleContent(segments), segments };
}
