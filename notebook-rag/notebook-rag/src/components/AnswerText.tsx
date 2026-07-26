"use client";

import { Fragment, type ReactNode } from "react";
import { locationLabel } from "@/lib/format";
import type { Citation } from "@/lib/types";

/**
 * Render a streamed answer with minimal markdown (paragraphs, lists, bold,
 * inline code) and turn every [n] marker into a clickable citation chip that
 * opens the cited passage in the Source Viewer.
 */
export function AnswerText({
  text,
  citations,
  onCite,
}: {
  text: string;
  citations: Citation[];
  onCite: (index: number) => void;
}) {
  const blocks = groupBlocks(text);
  return (
    <div className="answer">
      {blocks.map((block, i) => {
        if (block.type === "ul")
          return (
            <ul key={i}>
              {block.items.map((it, j) => (
                <li key={j}>{inline(it, citations, onCite)}</li>
              ))}
            </ul>
          );
        if (block.type === "ol")
          return (
            <ol key={i}>
              {block.items.map((it, j) => (
                <li key={j}>{inline(it, citations, onCite)}</li>
              ))}
            </ol>
          );
        return <p key={i}>{inline(block.text, citations, onCite)}</p>;
      })}
    </div>
  );
}

type Block =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] };

function groupBlocks(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) {
      blocks.push({ type: "p", text: para.join(" ") });
      para = [];
    }
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushPara();
      continue;
    }
    const ul = trimmed.match(/^[-*]\s+(.*)$/);
    const ol = trimmed.match(/^\d+\.\s+(.*)$/);
    if (ul) {
      flushPara();
      const last = blocks[blocks.length - 1];
      if (last && last.type === "ul") last.items.push(ul[1]);
      else blocks.push({ type: "ul", items: [ul[1]] });
    } else if (ol) {
      flushPara();
      const last = blocks[blocks.length - 1];
      if (last && last.type === "ol") last.items.push(ol[1]);
      else blocks.push({ type: "ol", items: [ol[1]] });
    } else {
      para.push(trimmed);
    }
  }
  flushPara();
  return blocks;
}

function inline(
  text: string,
  citations: Citation[],
  onCite: (index: number) => void,
): ReactNode[] {
  // Split out [n] citation markers first.
  return text.split(/(\[\d+\])/g).map((part, i) => {
    const m = part.match(/^\[(\d+)\]$/);
    if (m) {
      const idx = Number(m[1]) - 1;
      const c = citations[idx];
      if (c) {
        const label = locationLabel(c.sourceType, c.location);
        return (
          <button
            key={i}
            className="cite-chip"
            title={`${c.sourceTitle}${label ? ` · ${label}` : ""}`}
            onClick={() => onCite(idx)}
          >
            {idx + 1}
          </button>
        );
      }
      return <Fragment key={i}>{part}</Fragment>;
    }
    return <Fragment key={i}>{formatText(part)}</Fragment>;
  });
}

/** Handle **bold** and `code` within a plain run of text. */
function formatText(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part))
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(part)) return <code key={i}>{part.slice(1, -1)}</code>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}
