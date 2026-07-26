import { deleteChunksBySource } from "@/lib/qdrant";
import { deleteSourceRecord, getSource } from "@/lib/store";
import { fail, guard, ok, sourceDto } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  return guard(async () => {
    const source = await getSource(params.id);
    if (!source) return fail("Source not found.", 404);
    return ok(sourceDto(source));
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  return guard(async () => {
    await deleteChunksBySource(params.id);
    await deleteSourceRecord(params.id);
    return ok({ deleted: true });
  });
}
