import { deleteChunksBySource } from "@/lib/qdrant";
import { deleteSourceRecord } from "@/lib/store";
import { guard, ok, sourceDto } from "@/lib/http";
import { requireSource, requireUserId } from "@/lib/authz";
import { announceDeleted } from "@/inngest/publish";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  return guard(async () => {
    const userId = await requireUserId();
    return ok(sourceDto(await requireSource(params.id, userId)));
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  return guard(async () => {
    const userId = await requireUserId();
    const source = await requireSource(params.id, userId);
    await announceDeleted([source]); // cancels an in-flight indexing run
    await deleteChunksBySource(params.id);
    await deleteSourceRecord(params.id);
    return ok({ deleted: true });
  });
}
