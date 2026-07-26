import * as cheerio from "cheerio";
import type { ExtractedSegment, ExtractedSource } from "../types";
import { assembleContent } from "../chunk";

/**
 * Fetch a web page and extract readable text as section-aware segments.
 * Headings update the running "section" label so citations can name where in
 * the page an answer came from.
 */
export async function extractUrl(url: string): Promise<ExtractedSource> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; NotebookRAG/1.0; +https://example.com/bot)",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Could not fetch page (HTTP ${res.status}).`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  $("script, style, noscript, nav, footer, header, aside, form, svg").remove();

  const title =
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("title").first().text().trim() ||
    new URL(url).hostname;

  const root = $("article").length ? $("article") : $("body");
  const segments: ExtractedSegment[] = [];
  let section: string | undefined;

  root.find("h1, h2, h3, h4, p, li, blockquote").each((_, el) => {
    const tag = el.tagName.toLowerCase();
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (!text) return;
    if (/^h[1-4]$/.test(tag)) {
      section = text;
      segments.push({ text, location: { section } });
    } else if (text.length > 2) {
      segments.push({ text, location: section ? { section } : {} });
    }
  });

  if (segments.length === 0) {
    const fallback = $("body").text().replace(/\s+/g, " ").trim();
    if (!fallback) throw new Error("No readable text found on this page.");
    segments.push({ text: fallback, location: {} });
  }

  return { title, content: assembleContent(segments), segments };
}
