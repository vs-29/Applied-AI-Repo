import { streamChat } from "@/lib/openai";
import { buildPrompt } from "@/lib/rag/prompt";
import { retrieve } from "@/lib/rag/retrieve";
import { STREAM_DELIM } from "@/lib/protocol";
import { fail, HttpError } from "@/lib/http";
import { requireNotebook, requireUserId } from "@/lib/authz";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { notebookId, question } = (await req.json().catch(() => ({}))) as {
    notebookId?: string;
    question?: string;
  };
  if (!notebookId || !question?.trim()) {
    return fail("notebookId and question are required.");
  }

  // Retrieval is filtered by notebookId, so confirming the user owns the
  // notebook is what keeps one user's chunks out of another's answers.
  try {
    const userId = await requireUserId();
    await requireNotebook(notebookId, userId);
  } catch (err) {
    if (err instanceof HttpError) return fail(err.message, err.status);
    throw err;
  }

  const citations = await retrieve(notebookId, question.trim());
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // 1) Emit citations up front so the UI can render inspectable sources.
      controller.enqueue(encoder.encode(JSON.stringify({ citations })));
      controller.enqueue(encoder.encode(STREAM_DELIM));

      // 2) No retrieved context → refuse to answer rather than hallucinate.
      if (citations.length === 0) {
        controller.enqueue(
          encoder.encode(
            "I couldn't find anything relevant in this notebook's sources to answer that. Try adding a source, or rephrasing the question.",
          ),
        );
        controller.close();
        return;
      }

      // 3) Stream the grounded answer.
      const { system, user } = buildPrompt(question.trim(), citations);
      try {
        for await (const delta of streamChat(system, user)) {
          controller.enqueue(encoder.encode(delta));
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Generation failed.";
        controller.enqueue(encoder.encode(`\n\n_Error: ${message}_`));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
