"use client";

import { useEffect, useRef, useState } from "react";
import { AnswerText } from "./AnswerText";
import { SourceGlyph, SendIcon } from "./icons";
import { locationLabel } from "@/lib/format";
import type { ChatMessage } from "@/lib/client";
import type { Citation } from "@/lib/types";

export function ChatPanel({
  notebookName,
  messages,
  busy,
  hasReadySources,
  onAsk,
  onCite,
}: {
  notebookName: string;
  messages: ChatMessage[];
  busy: boolean;
  hasReadySources: boolean;
  onAsk: (q: string) => void;
  onCite: (citation: Citation) => void;
}) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  function send() {
    const q = draft.trim();
    if (!q || busy) return;
    onAsk(q);
    setDraft("");
  }

  return (
    <div className="flex h-full flex-1 flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-hairline px-6 py-3">
        <div>
          <p className="eyebrow">Notebook</p>
          <h1 className="font-display text-base font-semibold">{notebookName}</h1>
        </div>
      </header>

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
        {messages.length === 0 ? (
          <EmptyConversation hasReadySources={hasReadySources} />
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-8">
            {messages.map((m) => (
              <div key={m.id} className="animate-fadeup">
                <p className="mb-2 font-display text-[15px] font-semibold text-ink">
                  {m.question}
                </p>
                {m.answer ? (
                  <AnswerText
                    text={m.answer}
                    citations={m.citations}
                    onCite={(i) => m.citations[i] && onCite(m.citations[i])}
                  />
                ) : (
                  <ThinkingDots />
                )}
                {m.citations.length > 0 && (
                  <CitationRow citations={m.citations} onCite={onCite} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Query bar */}
      <div className="border-t border-hairline px-6 py-4">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <textarea
            className="field max-h-40 min-h-[46px] resize-none py-3"
            rows={1}
            placeholder={
              hasReadySources
                ? "Ask a question about your sources…"
                : "Add and index a source to start asking…"
            }
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button
            className="btn-primary h-[46px] px-4"
            onClick={send}
            disabled={busy || !draft.trim()}
            title="Send"
          >
            <SendIcon className="h-4 w-4" />
          </button>
        </div>
        <p className="mx-auto mt-2 max-w-2xl text-center text-[11px] text-faint">
          Answers are grounded only in this notebook&apos;s sources. Click a
          citation to inspect it.
        </p>
      </div>
    </div>
  );
}

function CitationRow({
  citations,
  onCite,
}: {
  citations: Citation[];
  onCite: (c: Citation) => void;
}) {
  // De-duplicate by source so the row reads as "sources used".
  const seen = new Set<string>();
  const unique = citations.filter((c) => {
    if (seen.has(c.sourceId)) return false;
    seen.add(c.sourceId);
    return true;
  });
  return (
    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-hairline pt-3">
      {unique.map((c) => {
        const label = locationLabel(c.sourceType, c.location);
        return (
          <button
            key={c.id}
            onClick={() => onCite(c)}
            className="flex items-center gap-1.5 rounded-lg border border-hairline bg-surface px-2 py-1 text-left transition hover:border-primary hover:bg-primary-soft"
          >
            <SourceGlyph type={c.sourceType} />
            <span className="max-w-[180px] truncate text-[12px] font-medium text-ink">
              {c.sourceTitle}
            </span>
            {label && (
              <span className="font-mono text-[10px] text-muted">{label}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 py-1 text-muted">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
}

function EmptyConversation({ hasReadySources }: { hasReadySources: boolean }) {
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft font-display text-xl font-bold text-primary">
        ?
      </div>
      <h2 className="font-display text-lg font-semibold">
        {hasReadySources ? "Ask your sources" : "Add a source to begin"}
      </h2>
      <p className="mt-1 text-sm leading-6 text-muted">
        {hasReadySources
          ? "Every answer is grounded in the sources on the left, with citations you can click to verify against the original."
          : "Upload a PDF, paste a link or transcript, then ask questions and get answers grounded in what you added."}
      </p>
    </div>
  );
}
