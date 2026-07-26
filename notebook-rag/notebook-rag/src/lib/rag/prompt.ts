import { locationLabel } from "../format";
import type { Citation } from "../types";

const SYSTEM = `You are a research assistant that answers questions using ONLY the numbered sources provided by the user.

Rules:
- Ground every claim in the sources. Do not use outside knowledge.
- Cite sources inline with bracketed numbers like [1] or [2][3], placed right after the sentence they support. The numbers must match the source numbers given.
- If the sources do not contain the answer, say so plainly instead of guessing. Do not fabricate citations.
- Be concise and well-structured. Use short paragraphs, and markdown lists where helpful.
- Never invent a source number that was not provided.`;

/** Build the system + user messages for a grounded answer. */
export function buildPrompt(
  question: string,
  citations: Citation[],
): { system: string; user: string } {
  const context = citations
    .map((c, i) => {
      const label = locationLabel(c.sourceType, c.location);
      const where = label ? `, ${label}` : "";
      return `[${i + 1}] (${c.sourceTitle}${where})\n${c.text}`;
    })
    .join("\n\n");

  const user = `Question: ${question}

Sources:
${context}

Answer the question using only these sources, with inline [n] citations.`;

  return { system: SYSTEM, user };
}
