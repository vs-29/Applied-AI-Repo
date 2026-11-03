import { QdrantClient } from "@qdrant/js-client-rest";
import { config } from "./config";
import { sparseForDocument, sparseForQuery } from "./sparse";
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

/** Named vectors stored on every chunk point. */
const DENSE = "dense"; // OpenAI embedding (meaning)
const SPARSE = "bm25"; // keyword vector (exact terms), see sparse.ts

/**
 * Idempotently create both collections and the payload indexes we filter on.
 * `chunks` holds a dense and a sparse vector per chunk (hybrid search);
 * `entities` is a payload store for notebooks and sources (a size-1 dummy
 * vector keeps it in the same datastore, avoiding a second database for this
 * demo — see README for the production note).
 */
export async function ensureCollections(): Promise<void> {
  const q = getQdrant();
  const existing = await q.getCollections();
  const names = new Set(existing.collections.map((c) => c.name));

  if (!names.has(config.qdrant.chunksCollection)) {
    await q.createCollection(config.qdrant.chunksCollection, {
      vectors: { [DENSE]: { size: config.qdrant.vectorSize, distance: "Cosine" } },
      // `idf` makes Qdrant apply inverse document frequency at query time,
      // turning our stored term frequencies into BM25 scores.
      sparse_vectors: { [SPARSE]: { modifier: "idf" } },
    });
  }
  if (!names.has(config.qdrant.entitiesCollection)) {
    await q.createCollection(config.qdrant.entitiesCollection, {
      vectors: { size: 1, distance: "Dot" },
    });
  }

  await ensureIndex(config.qdrant.chunksCollection, "notebookId");
  await ensureIndex(config.qdrant.chunksCollection, "sourceId");
  await ensureIndex(config.qdrant.chunksCollection, "generation", "integer");
  await ensureIndex(config.qdrant.entitiesCollection, "kind");
  await ensureIndex(config.qdrant.entitiesCollection, "notebookId");
  await ensureIndex(config.qdrant.entitiesCollection, "ownerId");
}

async function ensureIndex(
  collection: string,
  field: string,
  schema: "keyword" | "integer" = "keyword",
): Promise<void> {
  try {
    await getQdrant().createPayloadIndex(collection, {
      field_name: field,
      field_schema: schema,
    });
  } catch {
    // Index already exists — safe to ignore.
  }
}

/** Store chunks with their dense embeddings and keyword vectors. Vectors align by index. */
export async function upsertChunks(
  chunks: Chunk[],
  vectors: number[][],
): Promise<void> {
  if (chunks.length === 0) return;
  await getQdrant().upsert(config.qdrant.chunksCollection, {
    wait: true,
    points: chunks.map((chunk, i) => ({
      id: chunk.id,
      vector: {
        [DENSE]: vectors[i],
        [SPARSE]: sparseForDocument(chunk.text),
      },
      payload: { ...chunk } as Record<string, unknown>,
    })),
  });
}

/** RRF constant from the original paper; damps the advantage of rank 1 vs rank 2. */
const RRF_K = 60;

/**
 * Hybrid search scoped to a single notebook: a dense (meaning) search and a
 * keyword (BM25) search run in parallel, and their rankings are merged with
 * reciprocal rank fusion: each chunk scores sum(1 / (60 + rank)) over the
 * lists it appears in. Chunks near the top of both lists win.
 *
 * Fusion is done here rather than in Qdrant so each citation keeps its raw
 * dense similarity (`denseScore`), which a relevance cutoff can use; Qdrant's
 * fused score is rank-based and says nothing about absolute relevance.
 *
 * The notebookId filter on both searches is what enforces knowledge-base
 * isolation — a query can never surface another notebook's chunks.
 */
export async function searchChunks(
  notebookId: string,
  queryText: string,
  queryVector: number[],
  topK: number,
): Promise<{ citations: Citation[]; bestDenseScore: number }> {
  const q = getQdrant();
  const collection = config.qdrant.chunksCollection;
  const filter = { must: [{ key: "notebookId", match: { value: notebookId } }] };
  const depth = Math.max(20, topK * 3); // candidates per list before fusion
  const sparse = sparseForQuery(queryText);

  const [dense, keyword] = await Promise.all([
    q.query(collection, {
      query: queryVector,
      using: DENSE,
      filter,
      limit: depth,
      with_payload: true,
    }),
    sparse.indices.length
      ? q.query(collection, {
          query: sparse,
          using: SPARSE,
          filter,
          limit: depth,
          with_payload: true,
        })
      : Promise.resolve({ points: [] }),
  ]);

  const merged = new Map<
    string,
    { chunk: Chunk; fused: number; denseScore: number | null; keywordScore: number | null }
  >();
  const add = (
    points: { id: string | number; score: number; payload?: Record<string, unknown> | null }[],
    kind: "dense" | "keyword",
  ) => {
    points.forEach((p, rank) => {
      const id = String(p.id);
      const entry = merged.get(id) ?? {
        chunk: p.payload as unknown as Chunk,
        fused: 0,
        denseScore: null,
        keywordScore: null,
      };
      entry.fused += 1 / (RRF_K + rank + 1);
      if (kind === "dense") entry.denseScore = p.score;
      else entry.keywordScore = p.score;
      merged.set(id, entry);
    });
  };
  add(dense.points, "dense");
  add(keyword.points, "keyword");

  const citations = [...merged.values()]
    .sort((a, b) => b.fused - a.fused)
    .slice(0, topK)
    .map((e) => ({
      ...e.chunk,
      score: e.fused,
      denseScore: e.denseScore,
      keywordScore: e.keywordScore,
    }));
  // Dense results come back sorted, so the first is the closest chunk overall.
  return { citations, bestDenseScore: dense.points[0]?.score ?? 0 };
}

/**
 * Delete a source's chunks from every generation except `keep`. Chunks written
 * before generations existed have no `generation` field, so they don't match
 * the must_not clause and are removed too.
 */
export async function deleteOtherGenerations(sourceId: string, keep: number): Promise<void> {
  await getQdrant().delete(config.qdrant.chunksCollection, {
    wait: true,
    filter: {
      must: [{ key: "sourceId", match: { value: sourceId } }],
      must_not: [{ key: "generation", match: { value: keep } }],
    },
  });
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
