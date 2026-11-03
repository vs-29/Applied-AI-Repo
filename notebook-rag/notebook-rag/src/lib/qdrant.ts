import { QdrantClient } from "@qdrant/js-client-rest";
import { config } from "./config";
import type { Chunk, Citation } from "./types";

let client: QdrantClient | null = null;

export function getQdrant(): QdrantClient {
  if (!client) {
    client = new QdrantClient({
      url: config.qdrant.url,
      apiKey: config.qdrant.apiKey,
    });
  }
  return client;
}

/**
 * Idempotently create both collections and the payload indexes we filter on.
 * `chunks` holds real embeddings; `entities` is a payload store for notebooks
 * and sources (a size-1 dummy vector keeps it in the same datastore, avoiding
 * a second database for this demo — see README for the production note).
 */
export async function ensureCollections(): Promise<void> {
  const q = getQdrant();
  const existing = await q.getCollections();
  const names = new Set(existing.collections.map((c) => c.name));

  if (!names.has(config.qdrant.chunksCollection)) {
    await q.createCollection(config.qdrant.chunksCollection, {
      vectors: { size: config.qdrant.vectorSize, distance: "Cosine" },
    });
  }
  if (!names.has(config.qdrant.entitiesCollection)) {
    await q.createCollection(config.qdrant.entitiesCollection, {
      vectors: { size: 1, distance: "Dot" },
    });
  }

  await ensureIndex(config.qdrant.chunksCollection, "notebookId");
  await ensureIndex(config.qdrant.chunksCollection, "sourceId");
  await ensureIndex(config.qdrant.entitiesCollection, "kind");
  await ensureIndex(config.qdrant.entitiesCollection, "notebookId");
  await ensureIndex(config.qdrant.entitiesCollection, "ownerId");
}

async function ensureIndex(collection: string, field: string): Promise<void> {
  try {
    await getQdrant().createPayloadIndex(collection, {
      field_name: field,
      field_schema: "keyword",
    });
  } catch {
    // Index already exists — safe to ignore.
  }
}

/** Store chunks with their embedding vectors. Vectors align by index. */
export async function upsertChunks(
  chunks: Chunk[],
  vectors: number[][],
): Promise<void> {
  if (chunks.length === 0) return;
  await getQdrant().upsert(config.qdrant.chunksCollection, {
    wait: true,
    points: chunks.map((chunk, i) => ({
      id: chunk.id,
      vector: vectors[i],
      payload: { ...chunk } as Record<string, unknown>,
    })),
  });
}

/**
 * Semantic search scoped to a single notebook. The notebookId filter is what
 * enforces knowledge-base isolation — a query can never surface another
 * notebook's chunks.
 */
export async function searchChunks(
  notebookId: string,
  queryVector: number[],
  topK: number,
): Promise<Citation[]> {
  const res = await getQdrant().search(config.qdrant.chunksCollection, {
    vector: queryVector,
    limit: topK,
    with_payload: true,
    filter: {
      must: [{ key: "notebookId", match: { value: notebookId } }],
    },
  });
  return res.map((point) => ({
    ...(point.payload as unknown as Chunk),
    score: point.score,
  }));
}

export async function deleteChunksBySource(sourceId: string): Promise<void> {
  await getQdrant().delete(config.qdrant.chunksCollection, {
    wait: true,
    filter: { must: [{ key: "sourceId", match: { value: sourceId } }] },
  });
}

export async function deleteChunksByNotebook(notebookId: string): Promise<void> {
  await getQdrant().delete(config.qdrant.chunksCollection, {
    wait: true,
    filter: { must: [{ key: "notebookId", match: { value: notebookId } }] },
  });
}
