import { config } from "./config";
import type { ChunkLocation, ExtractedSegment } from "./types";

/** Separator used to join segments into the canonical source text. */
export const SEGMENT_SEP = "\n\n";

/**
 * Assemble the full source text from segments. Every extractor uses this so a
 * chunk's character offsets line up exactly with Source.content, which is what
 * lets the text/website viewers highlight the cited passage.
 */
export function assembleContent(segments: ExtractedSegment[]): string {
  return segments.map((s) => s.text).join(SEGMENT_SEP);
}

export interface ChunkResult {
  text: string;
  location: ChunkLocation;
}

interface Placed {
  start: number;
  end: number;
  location: ChunkLocation;
}

/**
 * Split segmented content into overlapping chunks.
 *
 * Why this strategy: fixed-size character windows keep chunks uniformly sized
 * for stable embeddings, the overlap prevents facts from being split across a
 * boundary and lost, and boundaries snap to whitespace so words stay intact.
 * Each chunk inherits location metadata (page / timestamp / char range) from
 * the segments it overlaps, which is what makes every citation inspectable.
 */
export function chunkSegments(
  segments: ExtractedSegment[],
  size = config.rag.chunkSize,
  overlap = config.rag.chunkOverlap,
): ChunkResult[] {
  const placed: Placed[] = [];
  const parts: string[] = [];
  let cursor = 0;
  for (const seg of segments) {
    const start = cursor;
    parts.push(seg.text);
    cursor += seg.text.length;
    placed.push({ start, end: cursor, location: seg.location });
    cursor += SEGMENT_SEP.length; // account for the join separator
  }
  const fullText = parts.join(SEGMENT_SEP);
  const len = fullText.length;
  if (len === 0) return [];

  const step = Math.max(1, size - overlap);
  const chunks: ChunkResult[] = [];
  let pos = 0;

  while (pos < len) {
    let end = Math.min(pos + size, len);
    // Snap the end back to a whitespace boundary so we don't cut a word.
    if (end < len) {
      const window = fullText.slice(pos, end);
      const lastBreak = Math.max(
        window.lastIndexOf(" "),
        window.lastIndexOf("\n"),
      );
      if (lastBreak > size * 0.6) end = pos + lastBreak;
    }
    const text = fullText.slice(pos, end).trim();
    if (text.length > 0) {
      chunks.push({ text, location: deriveLocation(placed, pos, end) });
    }
    if (end >= len) break;
    pos = Math.max(pos + step, end - overlap);
  }
  return chunks;
}

/** Derive a chunk's location from the segments its [start, end) range overlaps. */
function deriveLocation(
  placed: Placed[],
  start: number,
  end: number,
): ChunkLocation {
  const overlapping = placed.filter((p) => p.start < end && p.end > start);
  const loc: ChunkLocation = { charStart: start, charEnd: end };
  if (overlapping.length === 0) return loc;

  const first = overlapping[0].location;
  const last = overlapping[overlapping.length - 1].location;

  if (first.page !== undefined) loc.page = first.page;
  if (first.section !== undefined) loc.section = first.section;

  const starts = overlapping
    .map((p) => p.location.startSec)
    .filter((n): n is number => n !== undefined);
  const ends = overlapping
    .map((p) => p.location.endSec)
    .filter((n): n is number => n !== undefined);
  if (starts.length) loc.startSec = Math.min(...starts);
  if (ends.length) loc.endSec = Math.max(...ends);
  if (last.section !== undefined && loc.section === undefined)
    loc.section = last.section;

  return loc;
}
