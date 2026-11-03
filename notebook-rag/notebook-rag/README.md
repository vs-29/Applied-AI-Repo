# Notebook RAG

A NotebookLM-style research assistant. Create notebooks, add sources of five
different kinds, and ask questions that are answered **only** from those
sources — with citations you can click to inspect the exact page, timestamp, or
passage the answer came from.

Built with Next.js (App Router, TypeScript), OpenAI (embeddings + generation),
and Qdrant Cloud (vectors). One codebase runs the UI, the API, and the full RAG
pipeline, and it deploys to Vercel as-is.

---

## What it does

- **Notebooks** — create, rename, delete, and switch between isolated
  workspaces. A query against one notebook can never retrieve another's data.
- **Five source types**, each with a tailored extractor:
  - **PDF** — text extracted page by page, so citations point to a page number.
  - **Website URL** — readable text pulled with a section-aware scraper.
  - **YouTube** — transcript fetched with per-cue timestamps; citations deep-link
    into the embedded player at the right second.
  - **VTT / transcript** — WebVTT and SRT timings parsed into timestamped cues.
  - **Text** — pasted notes split into paragraphs.
- **RAG pipeline** — extract → chunk (overlapping, whitespace-aligned) → embed →
  store in Qdrant → retrieve top-k by cosine similarity → generate a grounded
  answer.
- **Inspectable citations** — the model cites sources inline as `[1] [2]`. Each
  chip opens the **Source Viewer**, which renders the original and highlights the
  cited passage (or seeks the video to the cited timestamp).
- **Grounding guardrail** — if retrieval returns nothing relevant, the app says
  so instead of inventing an answer.
- **Live status** — every source shows an indexing state (a pulsing amber dot
  while embedding, green when ready), and answers stream token by token.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Next.js (Vercel)                        │
│                                                            │
│  Browser (React, client components)                        │
│    Sidebar · Add-Source modal · Chat · Source Viewer       │
│                       │  fetch / stream                     │
│                       ▼                                     │
│  Route handlers (Node runtime)                             │
│    /api/notebooks         notebook CRUD                     │
│    /api/notebooks/[id]/sources   add + list sources         │
│    /api/sources/[id]      delete / reindex / content        │
│    /api/query             retrieve + stream answer          │
│                       │                                     │
│    lib/ingest  ─ extract → chunk → embed                    │
│    lib/rag     ─ retrieve → prompt → stream                 │
└───────┬───────────────────────────────┬───────────────────┘
        │ embeddings + chat             │ vectors + metadata
        ▼                               ▼
   OpenAI API                      Qdrant Cloud
   text-embedding-3-small          notebook_chunks  (1536-d vectors)
   gpt-4o-mini (stream)            notebook_entities (notebooks + sources)
```

### Retrieval flow (a single question)

1. The question is embedded with the same model used for chunks.
2. Qdrant runs a cosine search over `notebook_chunks`, **filtered by
   `notebookId`** — this is what enforces notebook isolation.
3. The top-k chunks become numbered context in the prompt, each labelled with its
   source title and location (page / timestamp / section).
4. `gpt-4o-mini` streams an answer constrained to that context, citing `[n]`.
5. The server sends the citations first, then streams answer tokens; the client
   renders clickable chips that map each `[n]` back to its chunk and open the
   Source Viewer at the right spot.

---

## Tech stack

| Concern            | Choice                        | Why |
|--------------------|-------------------------------|-----|
| App + API          | Next.js 14 (App Router, TS)   | One deployable unit; streaming route handlers; first-class on Vercel. |
| Embeddings         | OpenAI `text-embedding-3-small` | 1536-d, cheap, strong retrieval quality. |
| Generation         | OpenAI `gpt-4o-mini`          | Fast, inexpensive, reliable at instruction-following for grounded answers. |
| Vector store       | Qdrant Cloud                  | Generous free tier, great TS client, payload filtering for isolation. |
| PDF                | `pdf-parse`                   | Per-page text via a custom page renderer. |
| Web scraping       | `cheerio`                     | Lightweight, serverless-friendly HTML parsing. |
| YouTube            | `youtube-transcript`          | Timestamped captions without an API key. |

---

## Getting started

### Prerequisites

- Node.js 18.18+ (20+ recommended)
- An **OpenAI API key** — <https://platform.openai.com/api-keys>
- A **Qdrant Cloud** cluster (free) — <https://cloud.qdrant.io> → create a
  cluster → copy its URL and API key

### Setup

```bash
git clone <your-repo-url> notebook-rag
cd notebook-rag
npm install

cp .env.example .env      # then fill in the values (see below)
npm run init:qdrant       # optional — collections are also created on first use
npm run dev               # http://localhost:3000
```

### Environment variables

See `.env.example` for the full list. The essentials:

```bash
OPENAI_API_KEY=sk-...
QDRANT_URL=https://<cluster-id>.<region>.cloud.qdrant.io:6333
QDRANT_API_KEY=...
AUTH_SECRET=...            # random string, see .env.example
AUTH_GITHUB_ID=...         # GitHub OAuth app
AUTH_GITHUB_SECRET=...
```

For GitHub sign-in, create an OAuth app at <https://github.com/settings/developers>
with callback URL `http://localhost:3000/api/auth/callback/github` (and a second
app, or an updated URL, for your deployed domain). Google sign-in is optional:
set `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` (see `.env.example`) and the button
appears. GitHub and Google logins are separate accounts (no account linking).

Sensible defaults are applied for models, collection names, chunk size/overlap
(1100 / 180 chars), and retrieval depth (top-k = 6).

---

## Deploying to Vercel

1. Push the repo to GitHub.
2. Import it in Vercel (framework auto-detects as Next.js).
3. Add the environment variables from your `.env` in **Project → Settings →
   Environment Variables**.
4. Deploy. Collections are created automatically on the first request.

> The ingestion and query routes set `maxDuration = 60`. On Vercel's Hobby tier
> functions cap at 10s, which is fine for typical sources; large PDFs or long
> videos benefit from the Pro tier or the background-queue approach noted below.

---

## How it works, in a bit more detail

**Chunking** (`src/lib/chunk.ts`) uses fixed-size character windows with overlap
so embeddings stay uniform and no fact is lost at a boundary. Window edges snap
to whitespace so words are never cut. Each chunk inherits location metadata from
the segments it overlaps — this is the link that makes a citation inspectable.

**Ingestion** (`src/lib/ingest/`) runs extract → persist segments → chunk → embed
→ upsert, writing the source's status at each step. Re-indexing re-chunks and
re-embeds from the stored extraction without re-fetching the original.

**Answering** (`src/lib/rag/`, `src/app/api/query`) retrieves, builds a grounded
prompt, and streams the completion. The response body is
`citations-JSON ␞ answer-tokens…`, so the UI can show sources immediately and
then type out the answer.

---

## Engineering trade-offs (deliberate, for a demo)

- **Metadata lives in Qdrant.** Notebooks and sources are stored in a second
  Qdrant collection (`notebook_entities`) rather than a relational database, so
  the whole app needs only two services (OpenAI + Qdrant). The store is isolated
  behind `src/lib/store.ts` — in production you'd swap that module for Postgres
  and keep everything else unchanged.
- **Synchronous ingestion.** Embedding runs inside the add-source request. That's
  simple and reliable for a demo; at scale you'd hand off to a queue
  (QStash / Inngest) and let the client poll the status dot.
- **Original files aren't stored.** The Source Viewer renders the extracted text
  (highlighted) rather than the original binary, since no blob store is
  provisioned. Adding Vercel Blob or S3 would let the PDF viewer show the real
  page image.
- **Auth via GitHub or Google sign-in, JWT sessions.** Auth.js (`src/auth.ts`) issues a
  signed cookie; there's no user table. Every notebook and source records an
  `ownerId`, and every API route checks it (`src/lib/authz.ts`) before reading
  or writing. Retrieval stays filtered by `notebookId`, and a user can only
  query notebooks they own, so one user's chunks never reach another's answers.
  Middleware (`src/middleware.ts`) also blocks signed-out requests up front.

## Known limitations

- YouTube ingestion depends on a video having captions available.
- Scanned/image-only PDFs won't extract (no OCR).
- Web extraction is heuristic; unusual page structures may capture less text.

---

## Project structure

```
src/
  app/
    api/…              route handlers (notebooks, sources, query)
    layout.tsx         fonts + metadata
    page.tsx           main app (state, wiring)
    globals.css        design tokens in CSS
  components/          Sidebar, ChatPanel, AnswerText, SourceViewer, …
  lib/
    ingest/            pdf · url · youtube · vtt · text extractors + orchestrator
    rag/               retrieve + prompt
    chunk.ts           chunking + location derivation
    openai.ts          embeddings + streaming chat
    qdrant.ts          collections, upsert, filtered search
    store.ts           notebook/source persistence (Qdrant-backed)
scripts/
  init-qdrant.ts       one-off collection setup
```

## Scripts

```bash
npm run dev          # start the dev server
npm run build        # production build
npm run start        # run the production build
npm run typecheck    # tsc --noEmit
npm run init:qdrant  # create Qdrant collections + payload indexes
```
