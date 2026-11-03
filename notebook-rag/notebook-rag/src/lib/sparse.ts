/**
 * BM25-style sparse ("keyword") vectors for hybrid search.
 *
 * Each token becomes one dimension, identified by a 32-bit hash of the token.
 * Documents store a saturated term frequency per token (the BM25 "tf" part);
 * the collection is created with Qdrant's `idf` modifier, so Qdrant multiplies
 * by inverse document frequency at query time. Together that's BM25 scoring,
 * with Qdrant keeping the corpus statistics up to date as chunks come and go.
 *
 * Tokenization keeps identifiers intact: "KST-1187," yields "kst-1187" plus its
 * parts "kst" and "1187", so both the exact code and its pieces can match.
 * That's the case dense embeddings handle worst (product codes, error numbers,
 * flags like --legacy-auth, file names like state-v2.json).
 */

export interface SparseVector {
  indices: number[];
  values: number[];
}

// BM25 parameters. AVG_LEN approximates tokens per chunk at the default chunk
// size (~1100 chars); it only shapes length normalization, so a rough value is fine.
const K1 = 1.2;
const B = 0.75;
const AVG_LEN = 180;

const STOPWORDS = new Set(
  (
    "a an and are as at be but by can do does did for from has have how i if in is it its " +
    "me my no not of on or our so than that the their them then there these they this to " +
    "was we were what when where which who why will with you your about into also any " +
    "been being both each just more most other over same should some such too very would"
  ).split(" "),
);

/** Lowercased tokens, with compound identifiers kept whole and also split. */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().split(/\s+/)) {
    // Trim surrounding punctuation but keep inner - . _ / (e.g. state-v2.json).
    const word = raw.replace(/^[^\p{L}\p{N}-]+|[^\p{L}\p{N}]+$/gu, "");
    if (!word) continue;
    const parts = word.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    if (parts.length > 1) out.push(word.replace(/^-+/, "")); // the whole identifier
    for (const p of parts) if (!STOPWORDS.has(p)) out.push(p);
  }
  return out;
}

/** FNV-1a 32-bit hash: a stable token -> dimension mapping with no vocabulary file. */
function hashToken(token: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function toVector(weights: Map<number, number>): SparseVector {
  const indices = [...weights.keys()].sort((a, b) => a - b);
  return { indices, values: indices.map((i) => weights.get(i)!) };
}

function countTokens(tokens: string[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const t of tokens) {
    const idx = hashToken(t);
    counts.set(idx, (counts.get(idx) ?? 0) + 1);
  }
  return counts;
}

/** Sparse vector for a stored chunk: BM25 saturated term frequency per token. */
export function sparseForDocument(text: string): SparseVector {
  const tokens = tokenize(text);
  const counts = countTokens(tokens);
  const norm = K1 * (1 - B + (B * tokens.length) / AVG_LEN);
  const weights = new Map<number, number>();
  for (const [idx, tf] of counts) weights.set(idx, (tf * (K1 + 1)) / (tf + norm));
  return toVector(weights);
}

/** Sparse vector for a query: each distinct token counts once. */
export function sparseForQuery(text: string): SparseVector {
  const weights = new Map<number, number>();
  for (const idx of countTokens(tokenize(text)).keys()) weights.set(idx, 1);
  return toVector(weights);
}
