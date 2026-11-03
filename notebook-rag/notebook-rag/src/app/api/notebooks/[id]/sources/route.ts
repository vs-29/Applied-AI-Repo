import { ingestSource, type IngestInput } from "@/lib/ingest";
import { createSource, getSource, listSources } from "@/lib/store";
import { fail, guard, ok, sourceDto } from "@/lib/http";
import { requireNotebook, requireUserId } from "@/lib/authz";
import type { SourceType } from "@/lib/types";

export const runtime = "nodejs";
// Ingestion (extract → embed) runs inline; give it room on platforms that allow it.
export const maxDuration = 60;

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  return guard(async () => {
    const userId = await requireUserId();
    await requireNotebook(params.id, userId);
    const sources = await listSources(params.id);
    return ok(sources.map(sourceDto));
  });
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  return guard(async () => {
    const userId = await requireUserId();
    await requireNotebook(params.id, userId);

    const form = await req.formData();
    const type = form.get("type") as SourceType | null;
    if (!type) return fail("Source type is required.");

    let input: IngestInput;
    let title = "";
    let origin = "";

    switch (type) {
      case "pdf": {
        const file = form.get("file");
        if (!(file instanceof File)) return fail("A PDF file is required.");
        const buffer = Buffer.from(await file.arrayBuffer());
        title = file.name;
        origin = file.name;
        input = { type: "pdf", buffer, filename: file.name };
        break;
      }
      case "vtt": {
        const file = form.get("file");
        const text = (form.get("text") as string | null)?.trim();
        if (file instanceof File) {
          title = file.name;
          origin = file.name;
          input = {
            type: "vtt",
            text: await file.text(),
            filename: file.name,
          };
        } else if (text) {
          title = (form.get("title") as string) || "Transcript";
          input = { type: "vtt", text, filename: title };
        } else {
          return fail("A .vtt file or transcript text is required.");
        }
        break;
      }
      case "text": {
        const text = (form.get("text") as string | null)?.trim();
        if (!text) return fail("Text content is required.");
        title = (form.get("title") as string) || "Text note";
        input = { type: "text", text, title };
        break;
      }
      case "url": {
        const url = (form.get("url") as string | null)?.trim();
        if (!url) return fail("A website URL is required.");
        title = url;
        origin = url;
        input = { type: "url", url };
        break;
      }
      case "youtube": {
        const url = (form.get("url") as string | null)?.trim();
        if (!url) return fail("A YouTube link is required.");
        title = url;
        origin = url;
        input = { type: "youtube", url };
        break;
      }
      default:
        return fail("Unsupported source type.");
    }

    const source = await createSource({
      ownerId: userId,
      notebookId: params.id,
      type,
      title,
      origin,
    });

    await ingestSource(source.id, input);
    const finished = await getSource(source.id);
    return ok(sourceDto(finished ?? source), 201);
  });
}
