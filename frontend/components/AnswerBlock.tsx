"use client";

import { useMemo, useState } from "react";
import type { Turn } from "@/lib/types";
import type { Citation } from "@/lib/api";
import { displaySymbol, formatScore, kindLabel, rangeLabel } from "@/lib/format";
import { CitationProvider } from "./CitationContext";
import { Markdown } from "./Markdown";

export function AnswerBlock(props: {
  turn: Turn;
  turnIndex: number;
  /** selected citation index if this turn owns the selection, else null */
  selectedCite: number | null;
  onSelect: (turnIndex: number, cite: number) => void;
}) {
  const { turn, turnIndex, selectedCite, onSelect } = props;
  const select = (cite: number) => onSelect(turnIndex, cite);
  const n = turn.citations.length;

  // real answers cite ~19, most at ~0 relevance = noise. Rank by score and show
  // the top few; a toggle reveals the rest. Rows keep their ORIGINAL citation
  // number/index so inline [n] and selection stay consistent.
  const [showAll, setShowAll] = useState(false);
  const SOURCE_LIMIT = 6;
  const ranked = useMemo(
    () =>
      turn.citations
        .map((citation, index) => ({ citation, index }))
        .sort((a, b) => b.citation.score - a.citation.score),
    [turn.citations],
  );
  const visible = showAll ? ranked : ranked.slice(0, SOURCE_LIMIT);
  const hiddenCount = ranked.length - visible.length;

  return (
    <article className="mb-8">
      {/* user question */}
      <div className="mb-5 flex items-start gap-3">
        <span className="mt-0.5 grid h-6 w-6 flex-none place-items-center rounded border border-line bg-panel3 font-mono text-[10px] text-mute">
          You
        </span>
        <p className="font-display text-[16px] font-semibold leading-snug tracking-tight text-inkbright">
          {turn.question}
        </p>
      </div>

      <CitationProvider
        value={{ citations: turn.citations, selected: selectedCite, onSelect: select }}
      >
        <div className="mb-2 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-cyan">
          <span>
            Answer{n > 0 ? ` · grounded in ${n} source${n === 1 ? "" : "s"}` : ""}
          </span>
          <span className="h-px flex-1 bg-gradient-to-r from-line to-transparent" />
        </div>

        <Markdown>{turn.answer}</Markdown>

        {turn.retrieval && <Telemetry stats={turn.retrieval} />}

        {n > 0 && (
          <div className="mt-4">
            <div className="mb-2.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-mute">
              Sources
              <span className="ml-1.5 tracking-normal text-mute/70">
                ·{" "}
                {showAll || hiddenCount === 0
                  ? `${n} total`
                  : `top ${visible.length} of ${n}`}
              </span>
            </div>
            <ul className="flex flex-col gap-2">
              {visible.map(({ citation, index }) => (
                <li key={index}>
                  <SourceCard
                    citation={citation}
                    number={index + 1}
                    active={selectedCite === index}
                    onSelect={() => select(index)}
                  />
                </li>
              ))}
            </ul>
            {ranked.length > SOURCE_LIMIT && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                aria-expanded={showAll}
                className="mt-2.5 rounded-md border border-line bg-panel2 px-3 py-1.5 font-mono text-[11.5px] text-azure transition-colors hover:border-azure hover:text-inkbright"
              >
                {showAll
                  ? "Show fewer sources"
                  : `Show all ${n} sources (+${hiddenCount})`}
              </button>
            )}
          </div>
        )}
      </CitationProvider>
    </article>
  );
}

function SourceCard(props: {
  citation: Citation;
  number: number;
  active: boolean;
  onSelect: () => void;
}) {
  const { citation: c, number, active, onSelect } = props;
  const isSeed = c.source === "seed";
  const score = Math.max(0, Math.min(1, c.score));

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={[
        "flex w-full items-stretch gap-3 rounded-md border bg-panel2 px-3 py-2.5 text-left transition-colors",
        "border-l-[3px] hover:border-[#2b3f63] hover:bg-panel3 active:translate-y-px",
        active
          ? isSeed
            ? "border-[#2b3f63] border-l-cyan bg-panel3"
            : "border-[#2b3f63] border-l-azure bg-panel3"
          : "border-line border-l-line",
      ].join(" ")}
    >
      <span
        className={[
          "mt-0.5 grid h-[22px] w-[22px] flex-none place-items-center rounded font-mono text-[11px] font-bold",
          isSeed
            ? "border border-cyan/35 bg-cyan/[0.14] text-cyan"
            : "border border-azure/30 bg-azure/[0.13] text-azure",
        ].join(" ")}
      >
        {number}
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2 font-mono text-[13px] font-medium text-inkbright">
          <span className="truncate">{displaySymbol(c)}</span>
          <span
            className={[
              "rounded-[3px] px-1.5 py-px font-mono text-[9px] font-semibold tracking-[0.1em]",
              isSeed ? "bg-cyan/[0.13] text-cyan" : "bg-azure/[0.12] text-azure",
            ].join(" ")}
          >
            {kindLabel(c).toUpperCase()}
          </span>
        </span>
        <span className="truncate font-mono text-[11px] text-mute">
          {c.file}:{rangeLabel(c)} · {c.source === "seed" ? "vector match" : "via call-graph"}
        </span>
        <span className="mt-0.5 h-[3px] overflow-hidden rounded-sm bg-line">
          <span
            className={`block h-full rounded-sm ${isSeed ? "bg-cyan" : "bg-azure"}`}
            style={{ width: `${Math.round(score * 100)}%` }}
          />
        </span>
      </span>

      <span
        className={`flex-none self-center font-mono text-[12px] font-medium ${
          formatScore(c.score) ? "text-ink" : "text-mute"
        }`}
      >
        {formatScore(c.score) ?? "·"}
      </span>
    </button>
  );
}

function Telemetry({ stats }: { stats: Turn["retrieval"] }) {
  if (!stats) return null;
  return (
    <div
      className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-linesoft py-2 font-mono text-[11px] text-mute"
      aria-label="retrieval telemetry"
    >
      <Dot>{stats.sent} chunks</Dot>
      <Dot>~{formatTokens(stats.est_tokens)} tokens</Dot>
      {stats.graph_used && <Dot>call-graph expansion</Dot>}
      {stats.reranked && <Dot className="text-[#6fb2a6]">reranked</Dot>}
    </div>
  );
}

function Dot({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="h-[3px] w-[3px] rounded-full bg-mute" />
      {children}
    </span>
  );
}

function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
