import { deleteChunksBySource } from "@/lib/qdrant";
import { deleteSourceRecord } from "@/lib/store";
import { guard, ok, sourceDto } from "@/lib/http";
import { requireSource, requireUserId } from "@/lib/authz";

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
    await requireSource(params.id, userId);
    await deleteChunksBySource(params.id);
    await deleteSourceRecord(params.id);
    return ok({ deleted: true });
  });
}
