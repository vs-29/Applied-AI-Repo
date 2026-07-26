/**
 * Central configuration. Values are exposed as lazy getters so that importing
 * a module never throws — required variables are validated only when actually
 * read at request time. This keeps `next build` working without secrets present.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example.`,
    );
  }
  return value;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  openai: {
    get apiKey() {
      return required("OPENAI_API_KEY");
    },
    get chatModel() {
      return process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";
    },
    get embedModel() {
      return process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";
    },
  },
  qdrant: {
    get url() {
      return required("QDRANT_URL");
    },
    get apiKey(): string | undefined {
      return process.env.QDRANT_API_KEY || undefined;
    },
    get chunksCollection() {
      return process.env.QDRANT_CHUNKS_COLLECTION || "notebook_chunks";
    },
    get entitiesCollection() {
      return process.env.QDRANT_ENTITIES_COLLECTION || "notebook_entities";
    },
    get vectorSize() {
      return num("QDRANT_VECTOR_SIZE", 1536);
    },
  },
  rag: {
    get chunkSize() {
      return num("CHUNK_SIZE", 1100);
    },
    get chunkOverlap() {
      return num("CHUNK_OVERLAP", 180);
    },
    get topK() {
      return num("RETRIEVAL_TOP_K", 6);
    },
  },
};
