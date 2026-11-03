/** Domain types shared across API routes, RAG pipeline, and the UI. */

export type SourceType = "pdf" | "text" | "url" | "youtube" | "vtt";

export type IndexStatus =
  | "uploading" // file received / job accepted, not yet processed
  | "indexing" // extracting, chunking, embedding (yellow dot)
  | "ready" // embeddings stored, queryable (green dot)
  | "error"; // ingestion failed

export interface Notebook {
  id: string;
  /** Auth user id ("<provider>:<accountId>") of the owner. */
  ownerId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface Source {
  id: string;
  /** Copied from the notebook so ownership is checked in one lookup. */
  ownerId: string;
  notebookId: string;
  type: SourceType;
  title: string;
  /** Original locator: URL for url/youtube, filename for uploads, "" for pasted text. */
  origin: string;
  status: IndexStatus;
  error?: string;
  chunkCount: number;
  /**
   * Extracted segments (pages / cues / paragraphs) with native location
   * metadata. Retained so the Source Viewer can render and highlight cited
   * passages, and so a source can be re-indexed without re-fetching. In a
   * production system this would live in object storage, not the entity record.
   */
  segments: ExtractedSegment[];
  /** Derived full text (assembleContent(segments)); populated on demand. */
  content?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Location metadata attached to every chunk. Which fields are populated
 * depends on the source type, and each drives a different viewer behaviour.
 */
export interface ChunkLocation {
  page?: number; // pdf: 1-based page number
  startSec?: number; // youtube/vtt: start timestamp in seconds
  endSec?: number; // youtube/vtt: end timestamp in seconds
  charStart?: number; // text/url: offset into the source content
  charEnd?: number;
  section?: string; // url: nearest heading, if detected
}

export interface Chunk {
  id: string;
  notebookId: string;
  sourceId: string;
  sourceType: SourceType;
  sourceTitle: string;
  origin: string;
  index: number; // ordinal position within the source
  text: string;
  location: ChunkLocation;
}

/** A retrieved chunk plus its retrieval scores, surfaced as a citation. */
export interface Citation extends Chunk {
  /** Hybrid rank-fusion score (only meaningful for ordering). */
  score: number;
  /** Cosine similarity from the dense search; null if found only by keywords. */
  denseScore: number | null;
  /** BM25 score from the keyword search; null if no query term matched. */
  keywordScore: number | null;
}

/** Result of extracting a source before chunking. */
export interface ExtractedSource {
  title: string;
  content: string;
  /** Pre-segmented units carrying native location metadata (pages, cues, etc.). */
  segments: ExtractedSegment[];
}

export interface ExtractedSegment {
  text: string;
  location: ChunkLocation;
}
