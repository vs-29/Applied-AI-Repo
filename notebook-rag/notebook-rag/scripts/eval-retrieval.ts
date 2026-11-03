/**
 * Retrieval evaluation over a fixed corpus (eval/corpus) and question set
 * (eval/questions.json).
 *
 *   npm run eval -- --validate-only   check the test set, no API calls
 *   npm run eval -- --label baseline  ingest (first run only) + score retrieval
 *   npm run eval -- --reset           re-ingest the corpus (after changing
 *                                     chunking, embeddings or the collection)
 *
 * It runs the app's real pipeline (ingestSource + retrieve), in a dedicated
 * notebook owned by "eval:local" that no signed-in user can see.
 *
 * A question counts as a hit at rank r if the r-th retrieved chunk comes from
 * the expected source AND contains the expected answer phrase. Off-topic
 * questions have no answer; for them we record the best similarity score, to
 * help choose a relevance cutoff.
 */
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chunkSegments } from "../src/lib/chunk";
import { config } from "../src/lib/config";
import { ingestSource, type IngestInput } from "../src/lib/ingest";
import { extractText } from "../src/lib/ingest/text";
import { extractVtt } from "../src/lib/ingest/vtt";
import { embedQuery } from "../src/lib/openai";
import { deleteChunksByNotebook, ensureCollections, searchChunks } from "../src/lib/qdrant";
import { applyCutoff } from "../src/lib/rag/retrieve";
import {
  createNotebook,
  createSource,
  deleteNotebook,
  listNotebooks,
  listSources,
} from "../src/lib/store";
import type { Citation, ExtractedSource, SourceType } from "../src/lib/types";

const EVAL_OWNER = "eval:local";
const EVAL_NOTEBOOK = "Retrieval eval";
const ROOT = join(__dirname, "..", "eval");
const CORPUS_DIR = join(ROOT, "corpus");
const DEPTH = 10; // how many results to fetch per question (for MRR@10)

interface Question {
  id: string;
  kind: "exact" | "paraphrase" | "offtopic";
  question: string;
  source?: string;
  answer?: string;
}

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function loadCorpus(): { file: string; type: SourceType; raw: string }[] {
  return readdirSync(CORPUS_DIR)
    .filter((f) => /\.(txt|vtt)$/i.test(f))
    .sort()
    .map((file) => ({
      file,
      type: file.toLowerCase().endsWith(".vtt") ? "vtt" : "text",
      raw: readFileSync(join(CORPUS_DIR, file), "utf8"),
    }));
}

function extractLocal(doc: { file: string; type: SourceType; raw: string }): ExtractedSource {
  return doc.type === "vtt" ? extractVtt(doc.raw, doc.file) : extractText(doc.raw, doc.file);
}

/** Fail fast if any question can't possibly be answered by one chunk. */
function validate(questions: Question[], corpus: ReturnType<typeof loadCorpus>): void {
  const problems: string[] = [];
  const ids = new Set<string>();
  const chunksByFile = new Map(
    corpus.map((d) => [d.file, chunkSegments(extractLocal(d).segments).map((c) => norm(c.text))]),
  );

  for (const q of questions) {
    if (ids.has(q.id)) problems.push(`${q.id}: duplicate id`);
    ids.add(q.id);
    if (q.kind === "offtopic") continue;
    if (!q.source || !q.answer) {
      problems.push(`${q.id}: needs both "source" and "answer"`);
      continue;
    }
    const chunks = chunksByFile.get(q.source);
    if (!chunks) {
      problems.push(`${q.id}: source "${q.source}" is not in eval/corpus`);
      continue;
    }
    const doc = corpus.find((d) => d.file === q.source)!;
    if (!norm(doc.raw).includes(norm(q.answer))) {
      problems.push(`${q.id}: answer phrase not found verbatim in ${q.source}`);
    } else if (!chunks.some((c) => c.includes(norm(q.answer!)))) {
      problems.push(`${q.id}: answer phrase is split across a chunk boundary`);
    }
  }

  const counts = questions.reduce<Record<string, number>>(
    (acc, q) => ({ ...acc, [q.kind]: (acc[q.kind] ?? 0) + 1 }),
    {},
  );
  const totalChunks = [...chunksByFile.values()].reduce((n, c) => n + c.length, 0);
  console.log(
    `Test set: ${questions.length} questions (${Object.entries(counts)
      .map(([k, v]) => `${v} ${k}`)
      .join(", ")}), ${corpus.length} documents, ${totalChunks} chunks ` +
      `(chunk size ${config.rag.chunkSize}, overlap ${config.rag.chunkOverlap}).`,
  );
  if (problems.length) {
    console.error(`\nTest set has ${problems.length} problem(s):\n  ` + problems.join("\n  "));
    process.exit(1);
  }
  console.log("Test set is valid.\n");
}

/** Find or (re)build the eval notebook; returns its id and file -> sourceId map. */
async function prepareNotebook(corpus: ReturnType<typeof loadCorpus>, reset: boolean) {
  await ensureCollections();
  let notebook = (await listNotebooks(EVAL_OWNER)).find((n) => n.name === EVAL_NOTEBOOK);

  if (notebook) {
    const sources = await listSources(notebook.id);
    const ready = new Set(sources.filter((s) => s.status === "ready").map((s) => s.origin));
    const complete = corpus.every((d) => ready.has(d.file)) && sources.length === corpus.length;
    if (reset || !complete) {
      console.log(reset ? "Resetting eval notebook..." : "Eval notebook is incomplete, rebuilding...");
      await deleteChunksByNotebook(notebook.id);
      await deleteNotebook(notebook.id);
      notebook = undefined;
    } else {
      console.log("Reusing the already-indexed eval notebook (pass --reset to rebuild).");
      return { notebookId: notebook.id, sourceIds: new Map(sources.map((s) => [s.origin, s.id])) };
    }
  }

  const created = await createNotebook(EVAL_NOTEBOOK, EVAL_OWNER);
  const sourceIds = new Map<string, string>();
  for (const doc of corpus) {
    process.stdout.write(`Indexing ${doc.file}... `);
    const source = await createSource({
      ownerId: EVAL_OWNER,
      notebookId: created.id,
      type: doc.type,
      title: doc.file,
      origin: doc.file,
    });
    const input: IngestInput =
      doc.type === "vtt"
        ? { type: "vtt", text: doc.raw, filename: doc.file }
        : { type: "text", text: doc.raw, title: doc.file };
    await ingestSource(source.id, input);
    const after = (await listSources(created.id)).find((s) => s.id === source.id);
    if (after?.status !== "ready") {
      throw new Error(`Indexing ${doc.file} failed: ${after?.error ?? "unknown error"}`);
    }
    console.log(`${after.chunkCount} chunks`);
    sourceIds.set(doc.file, source.id);
  }
  console.log();
  return { notebookId: created.id, sourceIds };
}

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(0)}%` : "-");

async function main() {
  const questions = JSON.parse(readFileSync(join(ROOT, "questions.json"), "utf8")) as Question[];
  const corpus = loadCorpus();
  validate(questions, corpus);
  if (flag("validate-only")) return;

  const label = option("label") ?? "run";
  const topK = config.rag.topK;
  const minScore = config.rag.minScore;
  const { notebookId, sourceIds } = await prepareNotebook(corpus, flag("reset"));

  // One search per question (no cutoff); the cutoff rule from retrieve.ts is
  // then applied to these raw results, both at the configured value and in
  // the sweep below. This is the same code path as retrieve(), minus caching.
  const raw = new Map<string, Awaited<ReturnType<typeof searchChunks>>>();
  for (const q of questions) {
    raw.set(q.id, await searchChunks(notebookId, q.question, await embedQuery(q.question), DEPTH));
  }

  /** 1-based rank of the expected chunk in a result list, or null. */
  const rankIn = (q: Question, list: Citation[]): number | null => {
    const want = sourceIds.get(q.source!);
    const idx = list.findIndex(
      (c) => c.sourceId === want && norm(c.text).includes(norm(q.answer!)),
    );
    return idx >= 0 ? idx + 1 : null;
  };

  const rows: {
    id: string;
    kind: Question["kind"];
    question: string;
    /** Rank after the configured cutoff (null = missed or refused). */
    rank: number | null;
    /** True if the cutoff returned nothing (the app would refuse to answer). */
    refused: boolean;
    /** Best dense cosine similarity in the notebook: what the off-topic gate checks. */
    bestDense: number;
    /** How many of the returned chunks matched at least one query keyword. */
    keywordHits: number;
  }[] = questions.map((q) => {
    const r = raw.get(q.id)!;
    const kept = applyCutoff(r, minScore);
    return {
      id: q.id,
      kind: q.kind,
      question: q.question,
      rank: q.kind === "offtopic" ? null : rankIn(q, kept),
      refused: kept.length === 0,
      bestDense: r.bestDenseScore,
      keywordHits: r.citations.filter((c) => c.keywordScore !== null).length,
    };
  });

  // ---- Per-question table ----
  console.log(`Relevance cutoff: ${minScore} (RETRIEVAL_MIN_SCORE)\n`);
  console.log("id   kind        result   best cosine  kw-matches  question");
  for (const r of rows) {
    const result =
      r.kind === "offtopic"
        ? r.refused ? "refused" : "ANSWERED"
        : r.refused ? "REFUSED" : r.rank ? `rank ${r.rank}` : "MISS";
    console.log(
      `${r.id}  ${r.kind.padEnd(10)}  ${result.padEnd(8)}  ${r.bestDense.toFixed(3).padStart(11)}  ${String(r.keywordHits).padStart(10)}  ${r.question}`,
    );
  }

  // ---- Summary by kind ----
  const answerable = rows.filter((r) => r.kind !== "offtopic");
  const summarize = (subset: typeof rows) => {
    const n = subset.length;
    const hitAt = (k: number) => subset.filter((r) => r.rank !== null && r.rank <= k).length;
    const mrr = subset.reduce((s, r) => s + (r.rank ? 1 / r.rank : 0), 0) / (n || 1);
    return { n, hit1: hitAt(1), hit3: hitAt(3), hitK: hitAt(topK), mrr };
  };
  const groups = {
    exact: summarize(rows.filter((r) => r.kind === "exact")),
    paraphrase: summarize(rows.filter((r) => r.kind === "paraphrase")),
    all: summarize(answerable),
  };

  console.log(`\n            hit@1  hit@3  hit@${topK}  MRR@${DEPTH}`);
  for (const [name, g] of Object.entries(groups)) {
    console.log(
      `${name.padEnd(10)}  ${pct(g.hit1, g.n).padStart(5)}  ${pct(g.hit3, g.n).padStart(5)}  ${pct(g.hitK, g.n).padStart(5)}  ${g.mrr.toFixed(3).padStart(6)}`,
    );
  }

  // ---- Cutoff sweep: how each candidate value would behave ----
  const offtopic = questions.filter((q) => q.kind === "offtopic");
  const answerableQs = questions.filter((q) => q.kind !== "offtopic");
  const sweep = [0, 0.1, 0.12, 0.14, 0.15, 0.16, 0.17, 0.18, 0.2, 0.22, 0.25].map((t) => {
    const refusedOff = offtopic.filter((q) => applyCutoff(raw.get(q.id)!, t).length === 0).length;
    const falseRefusals = answerableQs.filter((q) => applyCutoff(raw.get(q.id)!, t).length === 0).length;
    const foundInK = answerableQs.filter((q) => {
      const rank = rankIn(q, applyCutoff(raw.get(q.id)!, t));
      return rank !== null && rank <= topK;
    }).length;
    return { cutoff: t, refusedOff, falseRefusals, foundInK };
  });
  console.log(
    `\nCutoff sweep (${offtopic.length} off-topic, ${answerableQs.length} answerable questions)`,
  );
  console.log("cutoff  off-topic refused  answerable refused  correct chunk in top " + topK);
  for (const s of sweep) {
    const mark = s.cutoff === minScore ? "  <- current" : "";
    console.log(
      `${s.cutoff.toFixed(2).padStart(6)}  ${`${s.refusedOff}/${offtopic.length}`.padStart(17)}  ${`${s.falseRefusals}/${answerableQs.length}`.padStart(18)}  ${`${s.foundInK}/${answerableQs.length}`.padStart(22)}${mark}`,
    );
  }
  const offBest = rows.filter((r) => r.kind === "offtopic").map((r) => r.bestDense);
  const ansBest = rows.filter((r) => r.kind !== "offtopic").map((r) => r.bestDense);
  console.log(
    `\nBest cosine per question: off-topic max ${Math.max(...offBest).toFixed(3)}, ` +
      `answerable min ${Math.min(...ansBest).toFixed(3)}.`,
  );

  // ---- Save ----
  const outDir = join(ROOT, "results");
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `${label}.json`);
  writeFileSync(
    outFile,
    JSON.stringify(
      {
        label,
        date: new Date().toISOString(),
        settings: {
          embedModel: config.openai.embedModel,
          chunkSize: config.rag.chunkSize,
          chunkOverlap: config.rag.chunkOverlap,
          topK,
          minScore,
          collection: config.qdrant.chunksCollection,
        },
        summary: groups,
        cutoffSweep: sweep,
        rows,
      },
      null,
      2,
    ),
  );
  console.log(`\nSaved ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
