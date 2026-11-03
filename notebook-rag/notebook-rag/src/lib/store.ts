import { v4 as uuid } from "uuid";
import { config } from "./config";
import { ensureCollections, getQdrant } from "./qdrant";
import type { IndexStatus, Notebook, Source, SourceType } from "./types";

/**
 * Persistence for notebooks and sources. These are application entities, not
 * embeddings, so they live in a separate `entities` collection and are always
 * fetched by exact-match filter (never semantic search). A single dummy vector
 * keeps them in Qdrant so the demo needs only one datastore.
 */

const DUMMY_VECTOR = [0];

function entityCollection(): string {
  return config.qdrant.entitiesCollection;
}

async function put(id: string, payload: Record<string, unknown>): Promise<void> {
  await getQdrant().upsert(entityCollection(), {
    wait: true,
    points: [{ id, vector: DUMMY_VECTOR, payload }],
  });
}

async function scrollByKind<T>(
  kind: "notebook" | "source",
  extraFilter: Record<string, unknown>[] = [],
): Promise<T[]> {
  const res = await getQdrant().scroll(entityCollection(), {
    filter: { must: [{ key: "kind", match: { value: kind } }, ...extraFilter] },
    with_payload: true,
    limit: 1000,
  });
  return res.points.map((p) => p.payload as unknown as T);
}

async function getById<T>(id: string): Promise<T | null> {
  const res = await getQdrant().retrieve(entityCollection(), {
    ids: [id],
    with_payload: true,
  });
  return (res[0]?.payload as unknown as T) ?? null;
}

// ---------- Notebooks ----------

export async function createNotebook(
  name: string,
  ownerId: string,
): Promise<Notebook> {
  await ensureCollections();
  const now = Date.now();
  const notebook: Notebook = {
    id: uuid(),
    ownerId,
    name: name.trim() || "Untitled notebook",
    createdAt: now,
    updatedAt: now,
  };
  await put(notebook.id, { kind: "notebook", ...notebook });
  return notebook;
}

/** Notebooks owned by one user. */
export async function listNotebooks(ownerId: string): Promise<Notebook[]> {
  await ensureCollections();
  const items = await scrollByKind<Notebook & { kind: string }>("notebook", [
    { key: "ownerId", match: { value: ownerId } },
  ]);
  return items
    .map(({ kind: _kind, ...n }) => n as Notebook)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getNotebook(id: string): Promise<Notebook | null> {
  const rec = await getById<(Notebook & { kind: string }) | null>(id);
  if (!rec || rec.kind !== "notebook") return null;
  const { kind: _kind, ...n } = rec;
  return n as Notebook;
}

export async function renameNotebook(
  id: string,
  name: string,
): Promise<Notebook | null> {
  const existing = await getNotebook(id);
  if (!existing) return null;
  const updated: Notebook = {
    ...existing,
    name: name.trim() || existing.name,
    updatedAt: Date.now(),
  };
  await put(updated.id, { kind: "notebook", ...updated });
  return updated;
}

export async function deleteNotebook(id: string): Promise<void> {
  const sources = await listSources(id);
  await Promise.all(sources.map((s) => deleteSourceRecord(s.id)));
  await getQdrant().delete(entityCollection(), { wait: true, points: [id] });
}

// ---------- Sources ----------

export async function createSource(input: {
  ownerId: string;
  notebookId: string;
  type: SourceType;
  title: string;
  origin: string;
}): Promise<Source> {
  const now = Date.now();
  const source: Source = {
    id: uuid(),
    ownerId: input.ownerId,
    notebookId: input.notebookId,
    type: input.type,
    title: input.title,
    origin: input.origin,
    status: "uploading",
    chunkCount: 0,
    segments: [],
    createdAt: now,
    updatedAt: now,
  };
  await put(source.id, { kind: "source", ...source });
  return source;
}

export async function listSources(notebookId: string): Promise<Source[]> {
  const items = await scrollByKind<Source & { kind: string }>("source", [
    { key: "notebookId", match: { value: notebookId } },
  ]);
  return items
    .map(({ kind: _kind, ...s }) => s as Source)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** Every source across all users. For maintenance scripts only, never API routes. */
export async function listAllSources(): Promise<Source[]> {
  await ensureCollections();
  const items = await scrollByKind<Source & { kind: string }>("source");
  return items.map(({ kind: _kind, ...s }) => s as Source);
}

export async function getSource(id: string): Promise<Source | null> {
  const rec = await getById<(Source & { kind: string }) | null>(id);
  if (!rec || rec.kind !== "source") return null;
  const { kind: _kind, ...s } = rec;
  return s as Source;
}

export async function updateSource(
  id: string,
  patch: Partial<Source>,
): Promise<Source | null> {
  const existing = await getSource(id);
  if (!existing) return null;
  const updated: Source = { ...existing, ...patch, updatedAt: Date.now() };
  await put(updated.id, { kind: "source", ...updated });
  return updated;
}

export async function setSourceStatus(
  id: string,
  status: IndexStatus,
  extra: Partial<Source> = {},
): Promise<void> {
  await updateSource(id, { status, ...extra });
}

/** Remove the source record only (vectors handled by the caller). */
export async function deleteSourceRecord(id: string): Promise<void> {
  await getQdrant().delete(entityCollection(), { wait: true, points: [id] });
}
