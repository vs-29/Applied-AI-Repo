import { STREAM_DELIM } from "./protocol";
import type { Citation, Notebook, Source } from "./types";

export type SourceDTO = Omit<Source, "segments" | "content" | "ownerId">;

export interface ChatMessage {
  id: string;
  question: string;
  answer: string;
  citations: Citation[];
  streaming: boolean;
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `Request failed (${res.status}).`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listNotebooks: () => jsonFetch<Notebook[]>("/api/notebooks"),
  createNotebook: (name: string) =>
    jsonFetch<Notebook>("/api/notebooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  renameNotebook: (id: string, name: string) =>
    jsonFetch<Notebook>(`/api/notebooks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  deleteNotebook: (id: string) =>
    jsonFetch<{ deleted: boolean }>(`/api/notebooks/${id}`, { method: "DELETE" }),

  listSources: (notebookId: string) =>
    jsonFetch<SourceDTO[]>(`/api/notebooks/${notebookId}/sources`),
  addSource: (notebookId: string, form: FormData) =>
    jsonFetch<SourceDTO>(`/api/notebooks/${notebookId}/sources`, {
      method: "POST",
      body: form,
    }),
  deleteSource: (id: string) =>
    jsonFetch<{ deleted: boolean }>(`/api/sources/${id}`, { method: "DELETE" }),
  reindexSource: (id: string) =>
    jsonFetch<SourceDTO>(`/api/sources/${id}/reindex`, { method: "POST" }),

  sourceContent: (id: string) =>
    jsonFetch<{
      id: string;
      type: Source["type"];
      title: string;
      origin: string;
      segments: Source["segments"];
      content: string;
    }>(`/api/sources/${id}/content`),
};

/** Stream an answer, delivering citations first, then answer tokens. */
export async function streamQuery(
  notebookId: string,
  question: string,
  handlers: {
    onCitations: (citations: Citation[]) => void;
    onToken: (fullAnswer: string) => void;
    onError: (message: string) => void;
  },
): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notebookId, question }),
    });
  } catch {
    handlers.onError("Network error. Is the server running?");
    return;
  }
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}));
    handlers.onError((body as { error?: string }).error || "Query failed.");
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let metaDone = false;
  let answer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (!metaDone) {
        buffer += text;
        const idx = buffer.indexOf(STREAM_DELIM);
        if (idx >= 0) {
          try {
            const meta = JSON.parse(buffer.slice(0, idx)) as {
              citations: Citation[];
            };
            handlers.onCitations(meta.citations);
          } catch {
            handlers.onCitations([]);
          }
          answer = buffer.slice(idx + STREAM_DELIM.length);
          metaDone = true;
          handlers.onToken(answer);
        }
      } else {
        answer += text;
        handlers.onToken(answer);
      }
    }
  } catch {
    handlers.onError("The answer stream was interrupted.");
  }
}
