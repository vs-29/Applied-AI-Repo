import { createNotebook, listNotebooks } from "@/lib/store";
import { guard, ok, fail } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  return guard(async () => ok(await listNotebooks()));
}

export async function POST(req: Request) {
  return guard(async () => {
    const { name } = (await req.json().catch(() => ({}))) as { name?: string };
    if (!name || !name.trim()) return fail("A notebook name is required.");
    return ok(await createNotebook(name), 201);
  });
}
