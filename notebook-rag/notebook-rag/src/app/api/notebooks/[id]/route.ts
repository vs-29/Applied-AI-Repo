import { deleteChunksByNotebook } from "@/lib/qdrant";
import { deleteNotebook, getNotebook, renameNotebook } from "@/lib/store";
import { fail, guard, ok } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  return guard(async () => {
    const notebook = await getNotebook(params.id);
    if (!notebook) return fail("Notebook not found.", 404);
    return ok(notebook);
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  return guard(async () => {
    const { name } = (await req.json().catch(() => ({}))) as { name?: string };
    if (!name || !name.trim()) return fail("A new name is required.");
    const updated = await renameNotebook(params.id, name);
    if (!updated) return fail("Notebook not found.", 404);
    return ok(updated);
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  return guard(async () => {
    await deleteChunksByNotebook(params.id);
    await deleteNotebook(params.id);
    return ok({ deleted: true });
  });
}
