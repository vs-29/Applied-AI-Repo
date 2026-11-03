import { reindexSource } from "@/lib/ingest";
import { setSourceStatus } from "@/lib/store";
import { fail, guard, isStalled, ok, sourceDto } from "@/lib/http";
import { requireSource, requireUserId } from "@/lib/authz";
import { runInBackground } from "@/lib/background";

export const runtime = "nodejs";
export const maxDuration = 60;

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
    // Mark it before responding so the client's first poll already sees it.
    await setSourceStatus(params.id, "uploading", { error: undefined });
    runInBackground(`reindex ${params.id}`, () => reindexSource(params.id));
    return ok(sourceDto({ ...existing, status: "uploading", error: undefined }), 202);
  });
}
