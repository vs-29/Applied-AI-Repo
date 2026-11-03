import { createNotebook, listNotebooks } from "@/lib/store";
import { guard, ok, fail } from "@/lib/http";
import { requireUserId } from "@/lib/authz";

export const runtime = "nodejs";

export async function GET() {
  return guard(async () => {
    const userId = await requireUserId();
    return ok(await listNotebooks(userId));
  });
}

export async function POST(req: Request) {
  return guard(async () => {
    const userId = await requireUserId();
    const { name } = (await req.json().catch(() => ({}))) as { name?: string };
    if (!name || !name.trim()) return fail("A notebook name is required.");
    return ok(await createNotebook(name, userId), 201);
  });
}
