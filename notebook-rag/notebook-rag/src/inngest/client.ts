import { Inngest, eventType, staticSchema } from "inngest";

/**
 * Inngest client and the events this app publishes.
 *
 * Events carry ids only, never file contents: queue payloads are size-limited,
 * and everything a worker needs (segments, origin URL) is stored on the source
 * record before the event is sent.
 *
 * Dev mode (send to and be called by the local Inngest dev server on :8288)
 * is on under `next dev`. In production the SDK uses INNGEST_EVENT_KEY and
 * INNGEST_SIGNING_KEY, which the Inngest Vercel integration sets.
 */
export const inngest = new Inngest({
  id: "notebook-rag",
  // Leave undefined outside `next dev` so the SDK falls back to INNGEST_DEV.
  isDev: process.env.NODE_ENV === "development" ? true : undefined,
});

type SourceRef = { sourceId: string; notebookId: string; ownerId: string };

/** A new source was saved; index it. URL/YouTube sources still need fetching. */
export const sourceAdded = eventType("source/added", {
  schema: staticSchema<SourceRef>(),
});

/** Re-index an existing source from its stored segments. */
export const sourceReindexRequested = eventType("source/reindex.requested", {
  schema: staticSchema<SourceRef>(),
});

/** A source was deleted; cancels any indexing run for it. */
export const sourceDeleted = eventType("source/deleted", {
  schema: staticSchema<SourceRef>(),
});
