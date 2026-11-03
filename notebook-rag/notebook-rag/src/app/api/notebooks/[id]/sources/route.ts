import { extractAndStore, needsFetch, type IngestInput } from "@/lib/ingest";
import { createSource, listSources, setSourceStatus } from "@/lib/store";
import { fail, guard, ok, sourceDto } from "@/lib/http";
import { requireNotebook, requireUserId } from "@/lib/authz";
import { sourceAdded } from "@/inngest/client";
import { enqueueIndexing } from "@/inngest/publish";
import type { SourceType } from "@/lib/types";

export const runtime = "nodejs";
// Only file extraction happens here (PDF parsing can take a few seconds);
// fetching and embedding run in the queue.
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

    // Files are already in this request, so extract them here and store the
    // text; the queue event then only needs the source id. URL and YouTube
    // sources only need their link, so even fetching happens in the queue.
    let saved = source;
    if (!needsFetch(type)) {
      try {
        saved = (await extractAndStore(source, input)) ?? source;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not read this file.";
        await setSourceStatus(source.id, "error", { error: message });
        return ok(sourceDto({ ...source, status: "error", error: message }), 201);
      }
    }

    // Respond now (status "uploading"); the client polls until the source
    // becomes "ready" or "error" while the Inngest function does the work.
    const queued = await enqueueIndexing(sourceAdded, saved);
    return ok(sourceDto(queued), 202);
  });
}
