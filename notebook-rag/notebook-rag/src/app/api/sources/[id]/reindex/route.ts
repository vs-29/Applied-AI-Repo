import { getSource, setSourceStatus } from "@/lib/store";
import { fail, guard, isStalled, ok, sourceDto } from "@/lib/http";
import { requireSource, requireUserId } from "@/lib/authz";
import { sourceReindexRequested } from "@/inngest/client";
import { enqueueIndexing } from "@/inngest/publish";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  return guard(async () => {
    const userId = await requireUserId();
    const existing = await requireSource(params.id, userId);
    const inProgress = existing.status === "uploading" || existing.status === "indexing";
    if (inProgress && !isStalled(existing)) {
      return fail("This source is already being indexed.", 409);
    }
    if (!existing.segments?.length) {
      return fail("Nothing stored to re-index. Remove and re-add the source.", 422);
    }
    // Mark it before responding so the client's first poll already sees it.
    // The current generation keeps answering questions until the new one is done.
    await setSourceStatus(params.id, "uploading", { error: undefined, progress: undefined });
    const marked = (await getSource(params.id)) ?? existing;
    const queued = await enqueueIndexing(sourceReindexRequested, marked);
    return ok(sourceDto(queued), 202);
  });
}
