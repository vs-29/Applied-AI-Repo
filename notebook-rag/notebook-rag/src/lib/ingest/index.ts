import { v4 as uuid } from "uuid";
import { chunkSegments } from "../chunk";
import { embedTexts } from "../openai";
import { deleteChunksBySource, upsertChunks } from "../qdrant";
import { getSource, setSourceStatus, updateSource } from "../store";
import type { Chunk, ExtractedSource } from "../types";
import { extractPdf } from "./pdf";
import { extractText } from "./text";
import { extractUrl } from "./url";
import { extractVtt } from "./vtt";
import { extractYouTube } from "./youtube";

/** Raw material handed to ingestion at upload time, by source type. */
export type IngestInput =
  | { type: "pdf"; buffer: Buffer; filename: string }
  | { type: "text"; text: string; title: string }
  | { type: "vtt"; text: string; filename: string }
  | { type: "url"; url: string }
  | { type: "youtube"; url: string };

async function extract(input: IngestInput): Promise<ExtractedSource> {
  switch (input.type) {
    case "pdf":
      return extractPdf(input.buffer, input.filename);
    case "text":
      return extractText(input.text, input.title);
    case "vtt":
      return extractVtt(input.text, input.filename);
    case "url":
      return extractUrl(input.url);
    case "youtube":
      return extractYouTube(input.url);
  }
}

/**
 * Full pipeline for a freshly added source:
 * extract → persist segments → chunk → embed → upsert vectors → mark ready.
 * Status is written at each stage so the UI dot reflects real progress.
 */
export async function ingestSource(
  sourceId: string,
  input: IngestInput,
): Promise<void> {
  const source = await getSource(sourceId);
  if (!source) return;

  try {
    await setSourceStatus(sourceId, "indexing");
    const extracted = await extract(input);
    await updateSource(sourceId, {
      title: extracted.title || source.title,
      segments: extracted.segments,
    });
    await embedAndStore(source.notebookId, sourceId, extracted, {
      title: extracted.title || source.title,
      origin: source.origin,
      type: source.type,
    });
  } catch (err) {
    await setSourceStatus(sourceId, "error", {
      error: err instanceof Error ? err.message : "Indexing failed.",
    });
  }
}

/**
 * Re-run chunking + embedding from the stored extraction. Used by the re-index
 * action (e.g. after changing chunk size or embedding model) without needing
 * the original upload again. Location metadata is preserved.
 */
export async function reindexSource(sourceId: string): Promise<void> {
  const source = await getSource(sourceId);
  if (!source) return;
  if (!source.segments?.length) {
    await setSourceStatus(sourceId, "error", {
      error: "Nothing stored to re-index. Remove and re-add the source.",
    });
    return;
  }
  try {
    await setSourceStatus(sourceId, "indexing");
    await embedAndStore(
      source.notebookId,
      sourceId,
      { title: source.title, content: "", segments: source.segments },
      { title: source.title, origin: source.origin, type: source.type },
    );
  } catch (err) {
    await setSourceStatus(sourceId, "error", {
      error: err instanceof Error ? err.message : "Re-indexing failed.",
    });
  }
}

async function embedAndStore(
  notebookId: string,
  sourceId: string,
  extracted: ExtractedSource,
  meta: { title: string; origin: string; type: Chunk["sourceType"] },
): Promise<void> {
  const pieces = chunkSegments(extracted.segments);
  if (pieces.length === 0) {
    throw new Error("Extraction produced no text to index.");
  }

  const chunks: Chunk[] = pieces.map((piece, index) => ({
    id: uuid(),
    notebookId,
    sourceId,
    sourceType: meta.type,
    sourceTitle: meta.title,
    origin: meta.origin,
    index,
    text: piece.text,
    location: piece.location,
  }));

  const vectors = await embedTexts(chunks.map((c) => c.text));

  // Replace any prior vectors for this source (clean re-index / re-add).
  await deleteChunksBySource(sourceId);
  await upsertChunks(chunks, vectors);

  await setSourceStatus(sourceId, "ready", { chunkCount: chunks.length });
}
