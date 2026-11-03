import { config } from "../config";
import { embedQuery } from "../openai";
import { searchChunks } from "../qdrant";
import type { Citation } from "../types";

/**
 * Retrieve the most relevant chunks for a question, scoped to one notebook,
 * using hybrid (dense + keyword) search, then apply the relevance cutoff:
 *
 * 1. Off-topic gate: if even the closest chunk in the notebook has a dense
 *    (cosine) similarity below `minScore`, the question is about something the
 *    sources don't cover, and nothing is returned. The query route then
 *    answers "I couldn't find anything relevant" instead of letting the model
 *    improvise from weak context. Keyword matches can't open the gate on their
 *    own, since a stray shared word (a city, "password") is not relevance.
 * 2. Per-chunk filter: chunks whose dense similarity is below `minScore` are
 *    dropped. Chunks found only by keyword search (denseScore null) are kept,
 *    since for a question that passed the gate they are usually exact matches
 *    on an identifier, which is what keyword search is for.
 *
 * `minScore` defaults to RETRIEVAL_MIN_SCORE; the eval passes 0 to see raw
 * scores. The value is tuned with `npm run eval` (see the cutoff sweep).
 */
export async function retrieve(
  notebookId: string,
  question: string,
  topK = config.rag.topK,
  minScore = config.rag.minScore,
): Promise<Citation[]> {
  const vector = await embedQuery(question);
  const result = await searchChunks(notebookId, question, vector, topK);
  return applyCutoff(result, minScore);
}

/** The relevance cutoff described above; exported so the eval applies the identical rule. */
export function applyCutoff(
  result: { citations: Citation[]; bestDenseScore: number },
  minScore: number,
): Citation[] {
  if (result.bestDenseScore < minScore) return [];
  return result.citations.filter(
    (c) => c.denseScore === null || c.denseScore >= minScore,
  );
}
