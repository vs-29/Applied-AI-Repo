/**
 * Create the Qdrant collections and payload indexes ahead of time.
 * Usage:  npm run init:qdrant   (collections are also created lazily on first API call)
 */
import { ensureCollections } from "../src/lib/qdrant";
import { config } from "../src/lib/config";

async function main() {
  await ensureCollections();
  console.log(
    `Ready: "${config.qdrant.chunksCollection}" (dim ${config.qdrant.vectorSize}) and "${config.qdrant.entitiesCollection}".`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
