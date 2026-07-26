"use client";

import { useState } from "react";
import { CloseIcon } from "./icons";
import { SOURCE_TYPE_LABEL } from "@/lib/format";
import type { SourceType } from "@/lib/types";

const TYPES: { type: SourceType; hint: string }[] = [
  { type: "pdf", hint: "Upload a .pdf" },
  { type: "youtube", hint: "Paste a video link" },
  { type: "url", hint: "Any web page" },
  { type: "text", hint: "Paste raw text" },
  { type: "vtt", hint: ".vtt or transcript" },
];

export function AddSourceModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (form: FormData) => Promise<void>;
}) {
  const [type, setType] = useState<SourceType | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function reset() {
    setType(null);
    setFile(null);
    setUrl("");
    setText("");
    setTitle("");
    setError(null);
    setSubmitting(false);
  }

  function close() {
    reset();
    onClose();
  }

  const valid =
    (type === "pdf" && !!file) ||
    (type === "vtt" && (!!file || text.trim().length > 0)) ||
    (type === "text" && text.trim().length > 0) ||
    ((type === "url" || type === "youtube") && url.trim().length > 0);

  async function submit() {
    if (!type || !valid) return;
    setSubmitting(true);
    setError(null);
    const form = new FormData();
    form.set("type", type);
    if (file) form.set("file", file);
    if (url) form.set("url", url.trim());
    if (text) form.set("text", text);
    if (title) form.set("title", title.trim());
    try {
      await onAdd(form);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add source.");
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="w-full max-w-lg animate-fadeup rounded-2xl bg-surface p-5 shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Add source</h2>
          <button className="btn-ghost !p-1.5" onClick={close}>
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        {!type ? (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {TYPES.map((t) => (
              <button
                key={t.type}
                onClick={() => setType(t.type)}
                className="flex flex-col items-start gap-1 rounded-xl border border-hairline p-3 text-left transition hover:border-primary hover:bg-primary-soft"
              >
                <span className="font-display text-sm font-semibold text-ink">
                  {SOURCE_TYPE_LABEL[t.type]}
                </span>
                <span className="text-xs text-muted">{t.hint}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <button
              onClick={() => setType(null)}
              className="text-xs font-medium text-primary hover:underline"
            >
              ← Change type
            </button>

            {(type === "pdf" || type === "vtt") && (
              <label className="block">
                <span className="eyebrow mb-1 block">
                  {type === "pdf" ? "PDF file" : "Transcript file"}
                </span>
                <input
                  type="file"
                  accept={type === "pdf" ? ".pdf" : ".vtt,.srt,.txt"}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="field file:mr-3 file:rounded-md file:border-0 file:bg-primary-soft file:px-3 file:py-1 file:text-primary"
                />
              </label>
            )}

            {(type === "url" || type === "youtube") && (
              <label className="block">
                <span className="eyebrow mb-1 block">
                  {type === "youtube" ? "YouTube link" : "Page URL"}
                </span>
                <input
                  className="field"
                  placeholder={
                    type === "youtube"
                      ? "https://youtube.com/watch?v=…"
                      : "https://…"
                  }
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </label>
            )}

            {(type === "text" || type === "vtt") && (
              <>
                {type === "text" && (
                  <label className="block">
                    <span className="eyebrow mb-1 block">Title (optional)</span>
                    <input
                      className="field"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Meeting notes"
                    />
                  </label>
                )}
                <label className="block">
                  <span className="eyebrow mb-1 block">
                    {type === "vtt" ? "…or paste transcript" : "Text"}
                  </span>
                  <textarea
                    className="field min-h-[120px] resize-y"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={
                      type === "vtt"
                        ? "WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHello and welcome…"
                        : "Paste any text you want to ask questions about…"
                    }
                  />
                </label>
              </>
            )}

            {error && <p className="text-sm text-status-error">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-ghost" onClick={close}>
                Cancel
              </button>
              <button
                className="btn-primary"
                disabled={!valid || submitting}
                onClick={submit}
              >
                {submitting ? "Indexing…" : "Add & index"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
