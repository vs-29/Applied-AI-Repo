import { NextResponse } from "next/server";
import type { Source } from "./types";

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function fail(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/** An error that `guard()` turns into a JSON response with this status. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Wrap a handler so unexpected errors return clean JSON instead of a stack. */
export async function guard(
  fn: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpError) return fail(err.message, err.status);
    const message =
      err instanceof Error ? err.message : "Unexpected server error.";
    return fail(message, 500);
  }
}

/**
 * Background ingestion that hasn't updated its status in this long is assumed
 * dead (server restarted, or the platform killed the function at maxDuration).
 * Every stage of ingestion bumps updatedAt, and on Vercel a function can't run
 * past 60s, so 10 minutes leaves a wide margin.
 */
const STALE_MS = 10 * 60 * 1000;

/** True if the source claims to be in progress but its job has evidently died. */
export function isStalled(source: Source): boolean {
  return (
    (source.status === "uploading" || source.status === "indexing") &&
    Date.now() - source.updatedAt > STALE_MS
  );
}

/** Strip heavy/internal fields (segments, content, ownerId) before sending a source to the UI. */
export function sourceDto(source: Source) {
  if (isStalled(source)) {
    source = {
      ...source,
      status: "error",
      error: "Indexing was interrupted. Re-index or remove this source.",
    };
  }
  const { segments: _segments, content: _content, ownerId: _ownerId, ...dto } = source;
  return dto;
}
