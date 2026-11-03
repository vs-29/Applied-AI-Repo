import { v5 as uuidv5 } from "uuid";
import { chunkSegments } from "../chunk";
import { embedTexts } from "../openai";
import { deleteOtherGenerations, upsertChunks } from "../qdrant";
import { getSource, setSourceStatus, updateSource } from "../store";
import type { Chunk, ExtractedSource, Source, SourceType } from "../types";
import { extractPdf } from "./pdf";
import { extractText } from "./text";
import { extractUrl } from "./url";
import { extractVtt } from "./vtt";
import { extractYouTube } from "./youtube";

/**
 * Ingestion, as small composable stages:
 *
 *   extractAndStore  raw input -> segments saved on the source record
 *   planChunks       stored segments -> chunks with deterministic ids
 *   embedBatch       one slice of chunks -> embeddings -> upsert
 *   finalizeSource   drop the previous generation's chunks, mark ready
 *
 * The Inngest function (src/inngest/functions.ts) runs these as separate,
 * individually retried steps. `ingestSource` / `reindexSource` below run the
 * same stages inline, for maintenance scripts (eval, reindex-all).
 *
 * Every (re-)index writes a new *generation* of chunks. Chunk ids are derived
 * from (sourceId, generation, index), so a retried step overwrites its own
 * chunks instead of duplicating them, and the previous generation keeps
 * serving queries until the new one is complete.
 */

/** Raw material handed to ingestion at upload time, by source type. */
export type IngestInput =
  | { type: "pdf"; buffer: Buffer; filename: string }
  | { type: "text"; text: string; title: string }
  | { type: "vtt"; text: string; filename: string }
  | { type: "url"; url: string }
  | { type: "youtube"; url: string };

/** Chunks per embeddings request, and per queue step. */
export const EMBED_BATCH = 96;

/** Fixed namespace for deriving chunk ids (any constant UUID works). */
const CHUNK_ID_NAMESPACE = "6f1c2a4e-8b7d-4c3a-9e5f-1a2b3c4d5e6f";

/** Sources whose content must be fetched from the network (done in a queue step). */
export function needsFetch(type: SourceType): type is "url" | "youtube" {
  return type === "url" || type === "youtube";
}

export async function extract(input: IngestInput): Promise<ExtractedSource> {
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

/** Stage 1: extract and persist segments (and the derived title) on the source. */
export async function extractAndStore(
  source: Source,
  input: IngestInput,
): Promise<Source | null> {
  const extracted = await extract(input);
  if (!extracted.segments.length) {
    throw new Error("Extraction produced no text to index.");
  }
  return updateSource(source.id, {
    title: extracted.title || source.title,
    segments: extracted.segments,
  });
}

/** Stage 2: deterministic chunks for one generation of a source. */
export function planChunks(source: Source, generation: number): Chunk[] {
  return chunkSegments(source.segments).map((piece, index) => ({
    id: uuidv5(`${source.id}:${generation}:${index}`, CHUNK_ID_NAMESPACE),
    notebookId: source.notebookId,
    sourceId: source.id,
    sourceType: source.type,
    sourceTitle: source.title,
    origin: source.origin,
    index,
    generation,
    text: piece.text,
    location: piece.location,
  }));
}

/** Stage 3: embed and store one batch. Safe to retry (same ids overwrite). */
export async function embedBatch(chunks: Chunk[]): Promise<void> {
  if (!chunks.length) return;
  const vectors = await embedTexts(chunks.map((c) => c.text));
  await upsertChunks(chunks, vectors);
}

/** Stage 4: switch the source over to the new generation. */
export async function finalizeSource(
  sourceId: string,
  generation: number,
  chunkCount: number,
): Promise<void> {
  await deleteOtherGenerations(sourceId, generation);
  await setSourceStatus(sourceId, "ready", {
    chunkCount,
    generation,
    progress: undefined,
    error: undefined,
  });
}

/** Run stages 2-4 inline for a source whose segments are already stored. */
async function indexStored(source: Source): Promise<void> {
  const generation = (source.generation ?? 0) + 1;
  const chunks = planChunks(source, generation);
  if (!chunks.length) throw new Error("Extraction produced no text to index.");
  await setSourceStatus(source.id, "indexing");
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    await embedBatch(chunks.slice(i, i + EMBED_BATCH));
  }
  await finalizeSource(source.id, generation, chunks.length);
}

async function recordFailure(sourceId: string, err: unknown, fallback: string) {
  await setSourceStatus(sourceId, "error", {
    error: err instanceof Error ? err.message : fallback,
    progress: undefined,
  });
}

/** Inline full pipeline for a fresh source (scripts only; the app uses the queue). */
export async function ingestSource(sourceId: string, input: IngestInput): Promise<void> {
  const source = await getSource(sourceId);
  if (!source) return;
  try {
    await setSourceStatus(sourceId, "indexing");
    const stored = await extractAndStore(source, input);
    if (stored) await indexStored(stored);
  } catch (err) {
    await recordFailure(sourceId, err, "Indexing failed.");
  }
}

/** Inline re-index from the stored extraction (scripts only; the app uses the queue). */
export async function reindexSource(sourceId: string): Promise<void> {
  const source = await getSource(sourceId);
  if (!source) return;
  if (!source.segments?.length) {
    await recordFailure(
      sourceId,
      new Error("Nothing stored to re-index. Remove and re-add the source."),
      "",
    );
    return;
  }
  try {
    await indexStored(source);
  } catch (err) {
    await recordFailure(sourceId, err, "Re-indexing failed.");
  }
}
