import { YoutubeTranscript } from "youtube-transcript";
import type { ExtractedSegment, ExtractedSource } from "../types";
import { assembleContent } from "../chunk";

/** Pull a YouTube video id out of any common URL form (or a bare id). */
export function parseYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname === "youtu.be") return url.pathname.slice(1, 12) || null;
    if (url.searchParams.get("v")) return url.searchParams.get("v");
    const embed = url.pathname.match(/\/(embed|shorts|v)\/([a-zA-Z0-9_-]{11})/);
    if (embed) return embed[2];
  } catch {
    /* not a URL */
  }
  return null;
}

async function fetchTitle(videoId: string): Promise<string> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
    );
    if (res.ok) {
      const data = (await res.json()) as { title?: string };
      if (data.title) return data.title;
    }
  } catch {
    /* fall through */
  }
  return `YouTube video ${videoId}`;
}

/**
 * Fetch the transcript and turn each caption cue into a segment carrying its
 * start/end time, so citations can deep-link to the exact timestamp.
 */
export async function extractYouTube(url: string): Promise<ExtractedSource> {
  const videoId = parseYouTubeId(url);
  if (!videoId) throw new Error("Could not parse a YouTube video id from the link.");

  let cues: { text: string; offset: number; duration: number }[];
  try {
    cues = await YoutubeTranscript.fetchTranscript(videoId);
  } catch {
    throw new Error(
      "No transcript available for this video (captions may be disabled).",
    );
  }
  if (!cues.length) throw new Error("This video has no transcript.");

  const segments: ExtractedSegment[] = cues
    .map((cue) => {
      // youtube-transcript reports offset/duration in milliseconds.
      const startSec = Math.round(cue.offset / 1000);
      const endSec = Math.round((cue.offset + cue.duration) / 1000);
      const text = decodeEntities(cue.text).replace(/\s+/g, " ").trim();
      return { text, location: { startSec, endSec } };
    })
    .filter((s) => s.text.length > 0);

  const title = await fetchTitle(videoId);
  return { title, content: assembleContent(segments), segments };
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;#39;|&#39;/g, "'")
    .replace(/&amp;quot;|&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
