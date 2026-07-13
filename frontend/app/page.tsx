"use client";

import { useState } from "react";
import { ingest, query, type Citation, type RetrievalStats } from "@/lib/api";

export default function Home() {
  const [repo, setRepo] = useState("");
  const [path, setPath] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState<Citation[]>([]);
  const [retrieval, setRetrieval] = useState<RetrievalStats | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onIngest() {
    if (!path) return;
    setBusy(true);
    setStatus("Indexing… (cloning if a URL; first run downloads the models)");
    try {
      const r = await ingest(path, repo);
      setRepo(r.repo); // derived from the URL when not given — ready to query
      setStatus(`Indexed “${r.repo}”: ${r.files_indexed} files, ${r.chunks_indexed} chunks.`);
    } catch (e) {
      setStatus(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function onAsk() {
    if (!repo || !question) return;
    setBusy(true);
    setAnswer("");
    setCitations([]);
    setError(null);
    try {
      const r = await query(repo, question);
      setAnswer(r.answer);
      setCitations(r.citations);
      setRetrieval(r.retrieval);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-10">
        <h1 className="text-2xl font-semibold tracking-tight">codebase-rag</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Ask a codebase questions in plain English. Answers cite{" "}
          <code className="font-mono text-neutral-300">file:line</code>.
        </p>
      </header>

      {/* Ingest */}
      <section className="mb-8 rounded-lg border border-neutral-800 p-4">
        <h2 className="mb-3 text-sm font-medium text-neutral-300">1 · Index a repo</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className="flex-1 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-600"
            placeholder="repo name (optional for URLs)"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
          />
          <input
            className="flex-[2] rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 font-mono text-sm outline-none focus:border-neutral-600"
            placeholder="https://github.com/owner/repo  ·  or /local/path"
            value={path}
            onChange={(e) => setPath(e.target.value)}
          />
          <button
            onClick={onIngest}
            disabled={busy}
            className="rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50"
          >
            Index
          </button>
        </div>
        {status && <p className="mt-3 text-xs text-neutral-400">{status}</p>}
      </section>

      {/* Ask */}
      <section className="mb-8 rounded-lg border border-neutral-800 p-4">
        <h2 className="mb-3 text-sm font-medium text-neutral-300">2 · Ask</h2>
        <textarea
          className="w-full resize-none rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-600"
          rows={3}
          placeholder="Where is authentication handled?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button
          onClick={onAsk}
          disabled={busy}
          className="mt-2 rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50"
        >
          {busy ? "Thinking…" : "Ask"}
        </button>
      </section>

      {/* Error */}
      {error && (
        <section className="rounded-lg border border-red-900/60 bg-red-950/30 p-4">
          <p className="text-sm text-red-300">{error}</p>
        </section>
      )}

      {/* Answer */}
      {answer && (
        <section className="rounded-lg border border-neutral-800 p-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-100">
            {answer}
          </p>
          {retrieval && (
            <p className="mt-3 text-xs text-neutral-500">
              retrieved {retrieval.sent} chunks · ~{retrieval.est_tokens} tokens
              {retrieval.graph_used ? " · expanded via call-graph" : ""}
              {retrieval.reranked ? " · reranked" : ""}
            </p>
          )}
          {citations.length > 0 && (
            <ul className="mt-4 space-y-1 border-t border-neutral-800 pt-3">
              {citations.map((c, i) => (
                <li key={i} className="font-mono text-xs text-neutral-400">
                  [{i + 1}] {c.file}:{c.start_line}-{c.end_line}
                  {c.symbol ? ` · ${c.symbol}` : ""}{" "}
                  <span className="text-neutral-600">({c.score.toFixed(3)})</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
