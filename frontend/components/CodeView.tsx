"use client";

import { useMemo, useState } from "react";
import type { Citation } from "@/lib/api";
import { fileBase, formatScore, kindLabel, rangeLabel } from "@/lib/format";
import { highlightToLines, languageForFile } from "@/lib/highlight";
import { CopyIcon } from "./icons";

export function CodeView(props: { citation: Citation | null }) {
  const { citation } = props;

  if (!citation) {
    return (
      <EmptyPane>
        Select a citation — its exact source appears here, syntax-highlighted with
        line numbers.
      </EmptyPane>
    );
  }

  return <CodeContent citation={citation} />;
}

function CodeContent({ citation: c }: { citation: Citation }) {
  const [copied, setCopied] = useState(false);
  const language = useMemo(() => languageForFile(c.file), [c.file]);
  const lines = useMemo(
    () => highlightToLines(c.snippet ?? "", language),
    [c.snippet, language],
  );
  const isSeed = c.source === "seed";
  const langLabel = language || "text";

  async function copy() {
    try {
      await navigator.clipboard.writeText(c.snippet ?? "");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1300);
    } catch {
      /* clipboard blocked — silently ignore */
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none items-center gap-2.5 border-b border-linesoft bg-panel2 px-3.5 py-2.5">
        <span className="truncate font-mono text-[12.5px] text-inkbright">
          {c.file}
        </span>
        <span className="flex-none font-mono text-[12.5px] text-mute">
          :{rangeLabel(c)}
        </span>
        <span
          className={[
            "flex-none rounded-[3px] px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-[0.1em]",
            isSeed ? "bg-cyan/[0.13] text-cyan" : "bg-azure/[0.12] text-azure",
          ].join(" ")}
        >
          {kindLabel(c).toUpperCase()}
        </span>
        <button
          type="button"
          onClick={copy}
          className={[
            "ml-auto flex flex-none items-center gap-1.5 rounded border px-2.5 py-1 font-mono text-[11.5px] transition-colors",
            copied
              ? "border-cyan/40 text-cyan"
              : "border-line bg-panel3 text-ink hover:border-[#2b3f63] hover:text-inkbright",
          ].join(" ")}
        >
          <CopyIcon className="h-3 w-3" />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div className="scroll-slim min-h-0 flex-1 overflow-auto bg-panel2">
        <div className="code-body">
          {lines.map((html, i) => (
            <div key={i} className="code-line">
              <span className="gutter">{c.start_line + i}</span>
              <span
                className="content"
                dangerouslySetInnerHTML={{ __html: html || " " }}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-none items-center gap-2 border-t border-linesoft bg-panel2 px-3.5 py-2 font-mono text-[11px] text-mute">
        <span
          className={`h-2 w-2 rounded-sm ${isSeed ? "bg-cyan" : "bg-azure"}`}
        />
        <span>
          {langLabel}
          {formatScore(c.score) ? ` · match ${formatScore(c.score)}` : ""} ·{" "}
          {isSeed ? "vector" : "call-graph"} · {fileBase(c.file)}
        </span>
      </div>
    </div>
  );
}

function EmptyPane({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-0 flex-1 place-items-center p-8">
      <p className="max-w-[38ch] text-center text-[13px] leading-relaxed text-mute">
        {children}
      </p>
    </div>
  );
}
