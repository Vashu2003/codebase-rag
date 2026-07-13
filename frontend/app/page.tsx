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
      setRepo(r.repo);
      setStatus(`Indexed “${r.repo}” — ${r.files_indexed} files, ${r.chunks_indexed} chunks.`);
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
    setRetrieval(null);
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

  const card =
    "rounded-[10px] border border-line bg-panel/90 backdrop-blur-[2px]";
  const step =
    "mb-3 font-display text-[11px] font-semibold uppercase tracking-[0.12em] text-mute";
  const field =
    "rounded-md border border-line bg-panel2 px-3 py-2 font-mono text-[12.5px] text-ink outline-none transition-colors focus:border-cyan/60";
  const btn =
    "shrink-0 rounded-md bg-cyan px-5 font-display text-[13px] font-semibold text-[#062018] transition-opacity hover:opacity-90 disabled:opacity-50";

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8">
        <h1 className="font-display text-[27px] font-bold tracking-tight text-white">
          codebase-rag
        </h1>
        <p className="mt-1.5 text-[13.5px] text-mute">
          Ask a codebase questions in plain English. Answers cite{" "}
          <code className="font-mono text-[12.5px] text-cyan">file:line</code>.
        </p>
      </header>

      {/* 01 — Index */}
      <section className={`${card} mb-4 p-4`}>
        <h2 className={step}>
          <span className="text-cyan">01</span> — Index a repo
        </h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className={`${field} flex-1`}
            placeholder="repo name (optional for URLs)"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
          />
          <input
            className={`${field} flex-[2]`}
            placeholder="https://github.com/owner/repo  ·  or /local/path"
            value={path}
            onChange={(e) => setPath(e.target.value)}
          />
          <button className={btn} onClick={onIngest} disabled={busy}>
            Index
          </button>
        </div>
        {status && <p className="mt-3 font-mono text-[11.5px] text-mute">{status}</p>}
      </section>

      {/* 02 — Ask */}
      <section className={`${card} mb-4 p-4`}>
        <h2 className={step}>
          <span className="text-cyan">02</span> — Ask
        </h2>
        <textarea
          className={`${field} w-full resize-none`}
          rows={3}
          placeholder="What does the solve_dependencies function do?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button className={`${btn} mt-2 py-2`} onClick={onAsk} disabled={busy}>
          {busy ? "Thinking…" : "Ask"}
        </button>
      </section>

      {error && (
        <section className="mb-4 rounded-[10px] border border-red-500/40 bg-red-950/30 p-4">
          <p className="text-[13px] text-red-300">{error}</p>
        </section>
      )}

      {answer && (
        <section className={`${card} p-5`}>
          <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink">
            {answer}
          </p>

          {retrieval && (
            <div className="mt-5 flex flex-wrap items-center gap-2 font-mono text-[11px] text-mute">
              <span>
                retrieved <span className="text-cyan">{retrieval.sent}</span> chunks
              </span>
              <span>·</span>
              <span>~{retrieval.est_tokens.toLocaleString()} tokens</span>
              {retrieval.graph_used && <Pill>call-graph</Pill>}
              {retrieval.reranked && <Pill>reranked</Pill>}
            </div>
          )}

          {citations.length > 0 && (
            <ol className="relative mt-4 before:absolute before:bottom-2 before:left-[6px] before:top-2 before:w-px before:bg-gradient-to-b before:from-cyan before:to-edge before:content-['']">
              {citations.map((c, i) => (
                <li
                  key={i}
                  className="relative flex items-center gap-2.5 py-[5px] pl-6 font-mono text-[11.5px]"
                >
                  <span
                    className={`absolute left-[2px] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full ${
                      c.source === "seed"
                        ? "bg-cyan shadow-[0_0_8px_#5EEAD4]"
                        : "border-2 border-cyan bg-bg"
                    }`}
                  />
                  <span className="text-mute">[{i + 1}]</span>
                  <span className="text-ink">
                    {c.file}:{c.start_line}
                    {c.end_line !== c.start_line ? `–${c.end_line}` : ""}
                  </span>
                  {c.symbol && <span className="text-azure">{c.symbol}</span>}
                  {c.edge && <span className="text-azure/80">← {c.edge}</span>}
                  <span className="ml-auto text-cyan">{c.score.toFixed(3)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </main>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-line px-2.5 py-0.5 text-[10.5px] text-cyan">
      {children}
    </span>
  );
}
