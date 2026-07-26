import { NextResponse } from "next/server";
import type { Source } from "./types";

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function fail(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/** Wrap a handler so unexpected errors return clean JSON instead of a stack. */
export async function guard(
  fn: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unexpected server error.";
    return fail(message, 500);
  }
}

/** Strip heavy fields (segments/content) before sending a source to the UI list. */
export function sourceDto(source: Source) {
  const { segments: _segments, content: _content, ...dto } = source;
  return dto;
}
