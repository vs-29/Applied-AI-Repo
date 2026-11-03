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

/** Strip heavy/internal fields (segments, content, ownerId) before sending a source to the UI. */
export function sourceDto(source: Source) {
  const { segments: _segments, content: _content, ownerId: _ownerId, ...dto } = source;
  return dto;
}
