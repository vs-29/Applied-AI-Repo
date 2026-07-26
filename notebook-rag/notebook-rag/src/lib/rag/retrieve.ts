import { config } from "../config";
import { embedQuery } from "../openai";
import { searchChunks } from "../qdrant";
import type { Citation } from "../types";

/**
 * Retrieve the most relevant chunks for a question, scoped to one notebook.
 * Returns them as citations (chunk + similarity score).
 */
export async function retrieve(
  notebookId: string,
  question: string,
  topK = config.rag.topK,
): Promise<Citation[]> {
  const vector = await embedQuery(question);
  return searchChunks(notebookId, vector, topK);
}
