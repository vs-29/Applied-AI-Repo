import { reindexSource } from "@/lib/ingest";
import { getSource } from "@/lib/store";
import { fail, guard, ok, sourceDto } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  return guard(async () => {
    const existing = await getSource(params.id);
    if (!existing) return fail("Source not found.", 404);
    await reindexSource(params.id);
    const updated = await getSource(params.id);
    return ok(sourceDto(updated ?? existing));
  });
}
