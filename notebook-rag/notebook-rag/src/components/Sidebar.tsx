"use client";

import { useState } from "react";
import { SourceItem } from "./SourceItem";
import { UserMenu } from "./UserMenu";
import { PlusIcon, TrashIcon } from "./icons";
import type { SourceDTO } from "@/lib/client";
import type { Notebook } from "@/lib/types";

export function Sidebar(props: {
  notebooks: Notebook[];
  activeId: string | null;
  sources: SourceDTO[];
  sourcesLoading: boolean;
  onSelectNotebook: (id: string) => void;
  onCreateNotebook: (name: string) => void;
  onRenameNotebook: (id: string, name: string) => void;
  onDeleteNotebook: (id: string) => void;
  onOpenAddSource: () => void;
  onReindexSource: (id: string) => void;
  onDeleteSource: (id: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [renaming, setRenaming] = useState(false);
  const active = props.notebooks.find((n) => n.id === props.activeId) || null;

  function commitCreate() {
    if (draft.trim()) props.onCreateNotebook(draft.trim());
    setDraft("");
    setCreating(false);
  }

  return (
    <aside className="flex h-full w-[300px] shrink-0 flex-col border-r border-hairline bg-surface">
      {/* Brand */}
      <div className="flex items-center gap-2 px-4 pb-2 pt-4">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-white">
          <span className="font-display text-sm font-bold">N</span>
        </span>
        <span className="font-display text-[15px] font-semibold tracking-tight">
          Notebook RAG
        </span>
      </div>

      {/* Notebook switcher */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-1.5">
          <select
            value={props.activeId ?? ""}
            onChange={(e) => props.onSelectNotebook(e.target.value)}
            className="field flex-1 !py-1.5 text-[13px] font-medium"
          >
            {props.notebooks.length === 0 && <option value="">No notebooks</option>}
            {props.notebooks.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
          <button
            className="btn-ghost !px-2 !py-1.5"
            title="New notebook"
            onClick={() => setCreating((v) => !v)}
          >
            <PlusIcon className="h-4 w-4" />
          </button>
        </div>

        {creating && (
          <div className="mt-2 flex gap-1.5">
            <input
              autoFocus
              className="field !py-1.5 text-[13px]"
              placeholder="Notebook name"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && commitCreate()}
            />
            <button className="btn-primary !px-3 !py-1.5" onClick={commitCreate}>
              Add
            </button>
          </div>
        )}

        {active && (
          <div className="mt-2 flex items-center justify-between">
            {renaming ? (
              <input
                autoFocus
                defaultValue={active.name}
                className="field !py-1 text-[13px]"
                onBlur={(e) => {
                  props.onRenameNotebook(active.id, e.target.value);
                  setRenaming(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
              />
            ) : (
              <>
                <button
                  className="text-[11px] font-medium text-muted hover:text-primary"
                  onClick={() => setRenaming(true)}
                >
                  Rename
                </button>
                <button
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-muted hover:text-status-error"
                  onClick={() => {
                    if (confirm(`Delete "${active.name}" and all its sources?`))
                      props.onDeleteNotebook(active.id);
                  }}
                >
                  <TrashIcon className="h-3.5 w-3.5" /> Delete
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="mx-3 my-1 border-t border-hairline" />

      {/* Add source */}
      <div className="px-3 py-2">
        <button
          className="btn-primary w-full"
          onClick={props.onOpenAddSource}
          disabled={!props.activeId}
        >
          <PlusIcon className="h-4 w-4" /> Add source
        </button>
      </div>

      {/* Sources */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        <p className="eyebrow px-2 py-2">Sources</p>
        {props.sourcesLoading ? (
          <div className="space-y-2 px-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-paper" />
            ))}
          </div>
        ) : props.sources.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs leading-5 text-faint">
            No sources yet. Add a PDF, web page, YouTube video, transcript, or
            text to start asking questions.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {props.sources.map((s) => (
              <SourceItem
                key={s.id}
                source={s}
                onReindex={props.onReindexSource}
                onDelete={props.onDeleteSource}
              />
            ))}
          </ul>
        )}
      </div>

      <UserMenu />
    </aside>
  );
}
