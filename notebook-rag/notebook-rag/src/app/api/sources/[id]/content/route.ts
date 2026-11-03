import { assembleContent } from "@/lib/chunk";
import { guard, ok } from "@/lib/http";
import { requireSource, requireUserId } from "@/lib/authz";

export const runtime = "nodejs";

/** Full extracted content for the Source Viewer to render and highlight. */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  return guard(async () => {
    const userId = await requireUserId();
    const source = await requireSource(params.id, userId);
    return ok({
      id: source.id,
      type: source.type,
      title: source.title,
      origin: source.origin,
      segments: source.segments,
      content: assembleContent(source.segments),
    });
  });
}
