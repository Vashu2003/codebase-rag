"use client";

import { useState } from "react";
import { ingest, query, type Citation } from "@/lib/api";

export default function Home() {
  const [repo, setRepo] = useState("");
  const [path, setPath] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState<Citation[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onIngest() {
    if (!repo || !path) return;
    setBusy(true);
    setStatus("Indexing… (first run downloads the embedding model)");
    try {
      const r = await ingest(path, repo);
      setStatus(`Indexed ${r.files_indexed} files, ${r.chunks_indexed} chunks.`);
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
            placeholder="repo name (e.g. fastapi)"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
          />
          <input
            className="flex-[2] rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 font-mono text-sm outline-none focus:border-neutral-600"
            placeholder="/absolute/path/to/repo"
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
