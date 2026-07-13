# codebase-rag

Ask any codebase questions in plain English — get answers grounded in the source, with `file:line` citations.

> _"Where is authentication handled?" · "What breaks if I change this endpoint?" · "Explain the dependency-injection system."_

Runs **fully free & offline**: local embeddings + a local LLM (Ollama), or Gemini's free API tier if you want higher answer quality without a GPU.

---

## How it works

```
question ──▶ [embed: bge-small] ──▶ Chroma vector search ──▶ top-k code chunks
                                                                   │
                          answer + file:line citations ◀── [ LLM ] ◀┘
                                                    (Ollama local · or Gemini free)
```

1. **Ingest** — walk a repo, chunk it *AST-aware* (functions/classes via tree-sitter, not blind line splits), embed each chunk, store in Chroma.
2. **Retrieve** — embed the question, cosine-search the repo's collection for the most relevant chunks.
3. **Generate** — feed those chunks to the LLM with a strict "cite every claim, don't guess" prompt.

## Stack

| Layer | Choice | Free? |
|---|---|---|
| API | FastAPI | ✅ |
| Chunking | tree-sitter (AST-aware) | ✅ |
| Embeddings | `bge-small-en-v1.5` (sentence-transformers, local) | ✅ |
| Vector DB | Chroma (embedded, on-disk) | ✅ |
| Answer LLM | Ollama `qwen2.5-coder:7b` **or** Gemini `2.0-flash` free tier | ✅ |
| Frontend | Next.js 15 + Tailwind | ✅ |

---

## Quickstart

### 1. Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # defaults to Ollama; edit to use Gemini
uvicorn app.main:app --reload --port 8000
```

**LLM options** (edit `.env`):
- **Ollama (local, fully offline)** — install [ollama.com](https://ollama.com), then `ollama pull qwen2.5-coder:7b`. Keep `LLM_PROVIDER=ollama`.
- **Gemini (free tier, better answers)** — get a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey), set `LLM_PROVIDER=gemini` and `GEMINI_API_KEY=...`.

### 2. Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev            # http://localhost:3000
```

### 3. Try it

1. **Index a repo** — give it a name + an absolute local path (e.g. clone FastAPI: `git clone https://github.com/fastapi/fastapi`).
2. **Ask** — _"Explain how dependency injection is resolved."_ Watch it answer with exact `file:line` cites.

---

## API

| Method | Route | Body | Returns |
|---|---|---|---|
| `POST` | `/ingest` | `{ path, repo }` | `{ files_indexed, chunks_indexed }` |
| `POST` | `/query` | `{ repo, question, top_k? }` | `{ answer, citations[] }` |
| `GET` | `/health` | — | `{ status, llm_provider }` |

---

## Roadmap

- [ ] **Graph-aware retrieval** — fuse call-graph proximity (callers/callees) with vector similarity for sharper context.
- [ ] Reranker (`bge-reranker-base`) to cut noise before the LLM.
- [ ] Streaming answers.
- [ ] Clickable citations that open the exact line.
- [ ] Ingest straight from a GitHub URL.

## License

MIT
