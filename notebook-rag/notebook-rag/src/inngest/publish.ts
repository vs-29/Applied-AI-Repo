import { getSource, setSourceStatus } from "@/lib/store";
import type { Source } from "@/lib/types";
import { inngest, sourceAdded, sourceDeleted, sourceReindexRequested } from "./client";

type IndexEvent = typeof sourceAdded | typeof sourceReindexRequested;

/**
 * Publish an indexing event for a source. If the queue can't be reached, the
 * source is marked failed with a clear reason (instead of sitting on
 * "uploading" until it's flagged as stalled), and the updated record returned.
 */
export async function enqueueIndexing(event: IndexEvent, source: Source): Promise<Source> {
  try {
    await inngest.send({
      name: event.name,
      data: { sourceId: source.id, notebookId: source.notebookId, ownerId: source.ownerId },
    });
    return source;
  } catch (err) {
    console.error(`[inngest] could not send ${event.name} for ${source.id}:`, err);
    const hint =
      process.env.NODE_ENV === "development"
        ? " Is the Inngest dev server running (npx inngest-cli dev)?"
        : "";
    await setSourceStatus(source.id, "error", {
      error: `Could not queue this source for indexing.${hint} Re-index to retry.`,
    });
    return (await getSource(source.id)) ?? source;
  }
}

/** Tell any running indexing job for these sources to stop. Best-effort. */
export async function announceDeleted(sources: Source[]): Promise<void> {
  if (!sources.length) return;
  try {
    await inngest.send(
      sources.map((s) => ({
        name: sourceDeleted.name,
        data: { sourceId: s.id, notebookId: s.notebookId, ownerId: s.ownerId },
      })),
    );
  } catch (err) {
    // Not fatal: each step also checks that its source still exists.
    console.error("[inngest] could not send source/deleted:", err);
  }
}
