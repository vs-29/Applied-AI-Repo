"use client";

import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ChatPanel } from "@/components/ChatPanel";
import { SourceViewer } from "@/components/SourceViewer";
import { AddSourceModal } from "@/components/AddSourceModal";
import { api, streamQuery, type ChatMessage, type SourceDTO } from "@/lib/client";
import type { ChunkLocation, Citation, Notebook } from "@/lib/types";

interface ViewerState {
  sourceId: string;
  focus?: ChunkLocation;
}

export default function Home() {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sources, setSources] = useState<SourceDTO[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const [booting, setBooting] = useState(true);

  // Load notebooks on mount; create a starter notebook if none exist.
  useEffect(() => {
    (async () => {
      try {
        let list = await api.listNotebooks();
        if (list.length === 0) {
          const created = await api.createNotebook("My first notebook");
          list = [created];
        }
        setNotebooks(list);
        setActiveId(list[0].id);
      } catch {
        /* surfaced elsewhere */
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  // Load sources whenever the active notebook changes.
  useEffect(() => {
    if (!activeId) return;
    setSourcesLoading(true);
    setMessages([]);
    setViewer(null);
    api
      .listSources(activeId)
      .then(setSources)
      .catch(() => setSources([]))
      .finally(() => setSourcesLoading(false));
  }, [activeId]);

  const patchSource = (s: SourceDTO) =>
    setSources((prev) => prev.map((x) => (x.id === s.id ? s : x)));

  const createNotebook = useCallback(async (name: string) => {
    const nb = await api.createNotebook(name);
    setNotebooks((prev) => [nb, ...prev]);
    setActiveId(nb.id);
  }, []);

  const renameNotebook = useCallback(async (id: string, name: string) => {
    const nb = await api.renameNotebook(id, name);
    setNotebooks((prev) => prev.map((x) => (x.id === id ? nb : x)));
  }, []);

  const deleteNotebook = useCallback(
    async (id: string) => {
      await api.deleteNotebook(id);
      const rest = notebooks.filter((n) => n.id !== id);
      if (rest.length === 0) {
        const created = await api.createNotebook("My first notebook");
        setNotebooks([created]);
        setActiveId(created.id);
      } else {
        setNotebooks(rest);
        if (activeId === id) setActiveId(rest[0].id);
      }
    },
    [notebooks, activeId],
  );

  const addSource = useCallback(
    async (form: FormData) => {
      if (!activeId) return;
      const tempId = crypto.randomUUID();
      const optimistic: SourceDTO = {
        id: tempId,
        notebookId: activeId,
        type: (form.get("type") as SourceDTO["type"]) ?? "text",
        title: fileLabel(form),
        origin: "",
        status: "indexing",
        chunkCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setSources((prev) => [...prev, optimistic]);
      try {
        const created = await api.addSource(activeId, form);
        setSources((prev) => prev.map((s) => (s.id === tempId ? created : s)));
      } catch (e) {
        setSources((prev) => prev.filter((s) => s.id !== tempId));
        throw e;
      }
    },
    [activeId],
  );

  const deleteSource = useCallback(
    async (id: string) => {
      setSources((prev) => prev.filter((s) => s.id !== id));
      setViewer((v) => (v?.sourceId === id ? null : v));
      try {
        await api.deleteSource(id);
      } catch {
        /* best-effort; already removed from UI */
      }
    },
    [],
  );

  const reindexSource = useCallback(async (id: string) => {
    setSources((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: "indexing" } : s)),
    );
    try {
      const updated = await api.reindexSource(id);
      patchSource(updated);
    } catch {
      setSources((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, status: "error", error: "Re-index failed." } : s,
        ),
      );
    }
  }, []);

  const ask = useCallback(
    async (question: string) => {
      if (!activeId || busy) return;
      const id = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        { id, question, answer: "", citations: [], streaming: true },
      ]);
      setBusy(true);
      const update = (patch: Partial<ChatMessage>) =>
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        );

      await streamQuery(activeId, question, {
        onCitations: (citations) => update({ citations }),
        onToken: (answer) => update({ answer }),
        onError: (msg) => update({ answer: `_${msg}_`, streaming: false }),
      });

      update({ streaming: false });
      setBusy(false);
    },
    [activeId, busy],
  );

  const openCitation = useCallback((c: Citation) => {
    setViewer({ sourceId: c.sourceId, focus: c.location });
  }, []);

  const activeNotebook = notebooks.find((n) => n.id === activeId) || null;
  const hasReadySources = sources.some((s) => s.status === "ready");

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        notebooks={notebooks}
        activeId={activeId}
        sources={sources}
        sourcesLoading={sourcesLoading}
        onSelectNotebook={setActiveId}
        onCreateNotebook={createNotebook}
        onRenameNotebook={renameNotebook}
        onDeleteNotebook={deleteNotebook}
        onOpenAddSource={() => setModalOpen(true)}
        onReindexSource={reindexSource}
        onDeleteSource={deleteSource}
      />

      {activeNotebook ? (
        <ChatPanel
          notebookName={activeNotebook.name}
          messages={messages}
          busy={busy}
          hasReadySources={hasReadySources}
          onAsk={ask}
          onCite={openCitation}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted">
          {booting ? "Loading…" : "Create a notebook to begin."}
        </div>
      )}

      {viewer && (
        <SourceViewer
          sourceId={viewer.sourceId}
          focus={viewer.focus}
          onClose={() => setViewer(null)}
        />
      )}

      <AddSourceModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onAdd={addSource}
      />
    </div>
  );
}

function fileLabel(form: FormData): string {
  const file = form.get("file");
  if (file instanceof File) return file.name;
  const url = form.get("url");
  if (typeof url === "string" && url) return url;
  const title = form.get("title");
  if (typeof title === "string" && title) return title;
  return "New source";
}
