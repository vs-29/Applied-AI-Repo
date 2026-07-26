"use client";

import { useEffect, useRef, useState } from "react";
import { CloseIcon, ExternalIcon, SourceGlyph } from "./icons";
import { api } from "@/lib/client";
import { SOURCE_TYPE_LABEL, formatTimestamp } from "@/lib/format";
import type { ChunkLocation, Source, SourceType } from "@/lib/types";

interface ViewerData {
  id: string;
  type: SourceType;
  title: string;
  origin: string;
  segments: Source["segments"];
  content: string;
}

export function SourceViewer({
  sourceId,
  focus,
  onClose,
}: {
  sourceId: string;
  focus?: ChunkLocation;
  onClose: () => void;
}) {
  const [data, setData] = useState<ViewerData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    api
      .sourceContent(sourceId)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [sourceId]);

  return (
    <aside className="flex h-full w-[42%] min-w-[360px] max-w-[560px] shrink-0 animate-slidein flex-col border-l border-hairline bg-surface">
      <header className="flex items-center gap-2 border-b border-hairline px-4 py-3">
        {data && <SourceGlyph type={data.type} />}
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{data ? SOURCE_TYPE_LABEL[data.type] : "Source"}</p>
          <p className="truncate text-sm font-semibold" title={data?.title}>
            {data?.title ?? "Loading…"}
          </p>
        </div>
        {data && isExternal(data) && (
          <a
            href={data.origin}
            target="_blank"
            rel="noreferrer"
            className="btn-ghost !p-1.5"
            title="Open original"
          >
            <ExternalIcon className="h-4 w-4" />
          </a>
        )}
        <button className="btn-ghost !p-1.5" onClick={onClose} title="Close">
          <CloseIcon className="h-5 w-5" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        {error && <p className="p-4 text-sm text-status-error">{error}</p>}
        {!data && !error && (
          <div className="space-y-2 p-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-4 animate-pulse rounded bg-paper" />
            ))}
          </div>
        )}
        {data && (
          <>
            {data.type === "youtube" && (
              <YouTubeEmbed origin={data.origin} startSec={focus?.startSec} />
            )}
            <HighlightedContent content={data.content} focus={focus} />
          </>
        )}
      </div>
    </aside>
  );
}

function isExternal(d: ViewerData): boolean {
  return (
    (d.type === "url" || d.type === "youtube") && /^https?:\/\//.test(d.origin)
  );
}

function parseYouTubeId(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.hostname === "youtu.be") return url.pathname.slice(1, 12);
    if (url.searchParams.get("v")) return url.searchParams.get("v");
    const m = url.pathname.match(/\/(embed|shorts|v)\/([a-zA-Z0-9_-]{11})/);
    if (m) return m[2];
  } catch {
    /* ignore */
  }
  return /^[a-zA-Z0-9_-]{11}$/.test(input) ? input : null;
}

function YouTubeEmbed({
  origin,
  startSec,
}: {
  origin: string;
  startSec?: number;
}) {
  const id = parseYouTubeId(origin);
  if (!id) return null;
  const src = `https://www.youtube.com/embed/${id}?start=${Math.floor(
    startSec ?? 0,
  )}`;
  return (
    <div className="border-b border-hairline p-3">
      <div className="aspect-video w-full overflow-hidden rounded-lg bg-ink">
        <iframe
          className="h-full w-full"
          src={src}
          title="YouTube video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      {startSec !== undefined && (
        <p className="mt-2 font-mono text-[11px] text-muted">
          Cited at {formatTimestamp(startSec)}
        </p>
      )}
    </div>
  );
}

/** Render the extracted text, wrapping the cited character range in a mark. */
function HighlightedContent({
  content,
  focus,
}: {
  content: string;
  focus?: ChunkLocation;
}) {
  const markRef = useRef<HTMLElement>(null);

  useEffect(() => {
    markRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focus, content]);

  const hasRange =
    focus?.charStart !== undefined &&
    focus?.charEnd !== undefined &&
    focus.charEnd > focus.charStart &&
    focus.charStart < content.length;

  if (!hasRange) {
    return (
      <div className="whitespace-pre-wrap px-4 py-4 text-[13.5px] leading-6 text-ink/90">
        {content}
      </div>
    );
  }

  const start = Math.max(0, focus!.charStart!);
  const end = Math.min(content.length, focus!.charEnd!);
  return (
    <div className="whitespace-pre-wrap px-4 py-4 text-[13.5px] leading-6 text-ink/90">
      {content.slice(0, start)}
      <mark ref={markRef} className="hl">
        {content.slice(start, end)}
      </mark>
      {content.slice(end)}
    </div>
  );
}
