/**
 * Re-chunk and re-embed every source from its stored extraction into the
 * current chunks collection. Run once after a change to the collection layout,
 * chunking or embedding model (e.g. the move to hybrid search).
 *
 *   npm run reindex:all
 *
 * Nothing is re-downloaded; this only calls the embeddings API. Sources that
 * have no stored extraction are reported and skipped.
 */
import { config } from "../src/lib/config";
import { reindexSource } from "../src/lib/ingest";
import { getSource, listAllSources } from "../src/lib/store";

async function main() {
  const sources = (await listAllSources()).filter((s) => s.segments?.length);
  console.log(
    `Re-indexing ${sources.length} source(s) into "${config.qdrant.chunksCollection}"...`,
  );

  let ok = 0;
  const failed: string[] = [];
  for (const [i, s] of sources.entries()) {
    process.stdout.write(`[${i + 1}/${sources.length}] ${s.title.slice(0, 60)}... `);
    await reindexSource(s.id);
    const after = await getSource(s.id);
    if (after?.status === "ready") {
      ok++;
      console.log(`${after.chunkCount} chunks`);
    } else {
      failed.push(s.title);
      console.log(`FAILED: ${after?.error ?? "unknown error"}`);
    }
  }
  console.log(`\nDone: ${ok} re-indexed, ${failed.length} failed.`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
