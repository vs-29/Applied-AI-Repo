import { NonRetriableError } from "inngest";
import {
  EMBED_BATCH,
  embedBatch,
  extractAndStore,
  finalizeSource,
  needsFetch,
  planChunks,
} from "@/lib/ingest";
import { getSource, setSourceStatus, updateSource } from "@/lib/store";
import { inngest, sourceAdded, sourceDeleted, sourceReindexRequested } from "./client";

/**
 * Index one source as a chain of durable steps:
 *
 *   fetch      (URL / YouTube only) download + extract, save segments
 *   plan       pick the new generation, count batches, status "indexing"
 *   embed-N    embed + upsert one batch of 96 chunks, update progress
 *   finalize   delete the previous generation's chunks, status "ready"
 *
 * Inngest stores each step's result, so a failure retries only the failed
 * step; finished batches are never re-embedded. Steps return small values
 * (counts, never vectors) to keep run state tiny, and each step reloads the
 * source and re-derives its chunks (chunking is deterministic), so nothing
 * large passes through the queue.
 */
export const ingestSourceFn = inngest.createFunction(
  {
    id: "ingest-source",
    name: "Index a source",
    triggers: [sourceAdded, sourceReindexRequested],
    retries: 4,
    concurrency: [
      // Fairness: one user uploading 20 PDFs can't starve everyone else.
      { key: "event.data.ownerId", limit: 2 },
      // Global cap, to stay well inside OpenAI's embeddings rate limit.
      { limit: 5 },
    ],
    // Deleting a source stops its run between steps (no wasted embeddings).
    cancelOn: [{ event: sourceDeleted, match: "data.sourceId" }],
    // After the last retry fails, record why, so the UI shows it.
    onFailure: async ({ event, error }) => {
      const sourceId = event.data.event.data.sourceId as string;
      if (await getSource(sourceId)) {
        await setSourceStatus(sourceId, "error", {
          error: error.message || "Indexing failed.",
          progress: undefined,
        });
      }
    },
  },
  async ({ event, step }) => {
    const { sourceId } = event.data;

    await step.run("fetch", async () => {
      const source = await getSource(sourceId);
      if (!source) return { skipped: true };
      if (event.name !== sourceAdded.name || !needsFetch(source.type)) {
        return { skipped: true }; // segments were stored by the API route
      }
      await setSourceStatus(sourceId, "indexing");
      try {
        await extractAndStore(source, { type: source.type, url: source.origin });
      } catch (err) {
        // A missing transcript or a 404 won't fix itself: don't retry.
        throw new NonRetriableError(
          err instanceof Error ? err.message : "Could not fetch this source.",
        );
      }
      return { skipped: false };
    });

    const plan = await step.run("plan", async () => {
      const source = await getSource(sourceId);
      if (!source) return null; // deleted meanwhile
      if (!source.segments?.length) {
        throw new NonRetriableError(
          "Nothing stored to index. Remove and re-add the source.",
        );
      }
      const generation = (source.generation ?? 0) + 1;
      const total = planChunks(source, generation).length;
      if (total === 0) throw new NonRetriableError("Extraction produced no text to index.");
      const batches = Math.ceil(total / EMBED_BATCH);
      await setSourceStatus(sourceId, "indexing", {
        progress: { done: 0, total: batches },
        error: undefined,
      });
      return { generation, total, batches };
    });
    if (!plan) return { status: "skipped", reason: "source deleted" };

    for (let b = 0; b < plan.batches; b++) {
      await step.run(`embed-${b + 1}-of-${plan.batches}`, async () => {
        const source = await getSource(sourceId);
        if (!source) return 0;
        const chunks = planChunks(source, plan.generation).slice(
          b * EMBED_BATCH,
          (b + 1) * EMBED_BATCH,
        );
        await embedBatch(chunks);
        await updateSource(sourceId, { progress: { done: b + 1, total: plan.batches } });
        return chunks.length;
      });
    }

    await step.run("finalize", async () => {
      if (!(await getSource(sourceId))) return;
      await finalizeSource(sourceId, plan.generation, plan.total);
    });

    return { status: "ready", chunks: plan.total, generation: plan.generation };
  },
);

export const functions = [ingestSourceFn];
