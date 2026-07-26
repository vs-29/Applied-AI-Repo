import pdfParse from "pdf-parse";
import type { ExtractedSegment, ExtractedSource } from "../types";
import { assembleContent } from "../chunk";

/**
 * Extract text page by page so each chunk can cite a specific page number.
 * pdf-parse invokes `pagerender` once per page in order; we capture each
 * page's text into its own segment.
 */
export async function extractPdf(
  buffer: Buffer,
  filename: string,
): Promise<ExtractedSource> {
  const pages: string[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pagerender = async (pageData: any): Promise<string> => {
    const textContent = await pageData.getTextContent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = textContent.items
      .map((item: any) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push(text);
    return text;
  };

  await pdfParse(buffer, { pagerender });

  const segments: ExtractedSegment[] = pages
    .map((text, i) => ({ text, location: { page: i + 1 } }))
    .filter((s) => s.text.length > 0);

  if (segments.length === 0) {
    throw new Error(
      "No selectable text found in this PDF (it may be a scanned image; OCR is not enabled).",
    );
  }

  const title = filename.replace(/\.pdf$/i, "") || "PDF document";
  return { title, content: assembleContent(segments), segments };
}
