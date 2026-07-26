import { assembleContent } from "@/lib/chunk";
import { getSource } from "@/lib/store";
import { fail, guard, ok } from "@/lib/http";

export const runtime = "nodejs";

/** Full extracted content for the Source Viewer to render and highlight. */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  return guard(async () => {
    const source = await getSource(params.id);
    if (!source) return fail("Source not found.", 404);
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
