import { reindexSource } from "@/lib/ingest";
import { getSource } from "@/lib/store";
import { guard, ok, sourceDto } from "@/lib/http";
import { requireSource, requireUserId } from "@/lib/authz";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  return guard(async () => {
    const userId = await requireUserId();
    const existing = await requireSource(params.id, userId);
    await reindexSource(params.id);
    const updated = await getSource(params.id);
    return ok(sourceDto(updated ?? existing));
  });
}
