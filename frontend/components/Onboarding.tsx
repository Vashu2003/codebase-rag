"use client";

import { useEffect, useRef, useState } from "react";
import { BrandMark, CloseIcon, GithubIcon } from "./icons";

const EXAMPLES = [
  { label: "fastapi/fastapi", url: "https://github.com/fastapi/fastapi" },
  { label: "psf/requests", url: "https://github.com/psf/requests" },
  { label: "pallets/flask", url: "https://github.com/pallets/flask" },
];

/** owner/repo → full GitHub URL; pass through anything that's already a URL. */
function toSource(input: string): string {
  const v = input.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  if (/^https?:\/\//i.test(v)) return v;
  const slug = v.replace(/^github\.com\//i, "");
  return `https://github.com/${slug}`;
}

export function Onboarding(props: {
  indexing: boolean;
  indexingLabel: string | null;
  error: string | null;
  canClose: boolean;
  onClose: () => void;
  onIndex: (source: string) => void;
}) {
  const { indexing, indexingLabel, error, canClose, onClose, onIndex } = props;
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!canClose) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [canClose, onClose]);

  function submit() {
    if (indexing) return;
    const v = value.trim();
    if (!v) return;
    onIndex(toSource(v));
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Index a repository"
      className="fixed inset-0 z-[60] overflow-auto bg-bg"
      style={{
        backgroundImage:
          "radial-gradient(circle at 1px 1px, rgba(92,168,248,0.075) 1px, transparent 0)",
        backgroundSize: "22px 22px",
      }}
    >
      {canClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 grid h-8 w-8 place-items-center rounded border border-line bg-panel2 text-mute hover:border-[#2b3f63] hover:text-ink"
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      )}

      <div className="mx-auto grid min-h-full max-w-[1160px] items-center gap-10 px-6 py-12 md:grid-cols-[1.05fr_0.95fr] md:gap-14 md:px-10">
        {/* left: value prop + form */}
        <div className="max-w-[600px]">
          <div className="mb-8 flex items-center gap-2.5 font-display font-semibold tracking-tight text-inkbright">
            <BrandMark className="h-[22px] w-[22px]" />
            codebase-rag
          </div>

          <p className="mb-3.5 font-mono text-[11px] uppercase tracking-[0.14em] text-mute">
            First run · <b className="font-semibold text-cyan">no repo indexed</b>
          </p>
          <h1 className="mb-4 font-display text-[clamp(30px,4vw,44px)] font-bold leading-[1.08] tracking-[-0.025em] text-inkbright">
            Chat with any codebase,
            <br />
            and see the <span className="text-cyan">code behind</span> every answer.
          </h1>
          <p className="mb-7 max-w-[52ch] text-[15px] leading-relaxed text-mute">
            Point codebase-rag at a repository. It indexes every file, retrieves the
            exact chunks that answer your question, and shows you the source and the
            call-graph it reasoned over — nothing hidden.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="flex items-stretch overflow-hidden rounded-md border border-line bg-panel2 transition-shadow focus-within:border-cyan focus-within:shadow-[0_0_0_3px_rgba(94,234,212,0.12)]"
          >
            <span className="flex items-center pl-3.5 pr-1 font-mono text-[13.5px] text-mute">
              github.com/
            </span>
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={indexing}
              placeholder="owner/repo  ·  or paste a full URL"
              aria-label="GitHub repository"
              className="min-w-0 flex-1 bg-transparent px-1.5 py-3.5 font-mono text-[13.5px] text-inkbright outline-none placeholder:text-[#4a5b7a] disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={indexing || value.trim().length === 0}
              className="whitespace-nowrap bg-cyan px-5 font-display text-[14px] font-semibold text-[#07130f] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {indexing ? "Indexing…" : "Index repo →"}
            </button>
          </form>

          <div className="my-4 flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-[11px] text-mute">or try an example</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                disabled={indexing}
                onClick={() => onIndex(ex.url)}
                className="flex items-center gap-2 rounded-md border border-line bg-panel2 px-3 py-2 font-mono text-[13px] text-ink transition-colors hover:border-azure hover:text-inkbright disabled:opacity-50"
              >
                <GithubIcon className="h-3.5 w-3.5 text-mute" />
                {ex.label}
              </button>
            ))}
          </div>

          <div aria-live="polite" className="min-h-[22px]">
            {indexing && (
              <p className="font-mono text-[12px] text-cyan">
                {indexingLabel ??
                  "Cloning, chunking and embedding — first run also downloads the models."}
              </p>
            )}
            {!indexing && error && (
              <p className="font-mono text-[12px] text-[#f6a5a5]">{error}</p>
            )}
          </div>

          <div className="mt-6 grid gap-3.5 border-t border-linesoft pt-6 sm:grid-cols-3">
            <Step n="1 · Index" accent={false}>
              Clone, chunk and embed every file — in seconds.
            </Step>
            <Step n="2 · Retrieve" accent={false}>
              Vector search, then call-graph expansion, then rerank.
            </Step>
            <Step n="3 · Answer" accent>
              A grounded answer with clickable source citations.
            </Step>
          </div>
        </div>

        {/* right: decorative preview */}
        <div className="hidden md:block">
          <PreviewCard />
        </div>
      </div>
    </div>
  );
}

function Step(props: {
  n: string;
  accent: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="text-[12.5px] leading-snug text-mute">
      <b
        className={`mb-1.5 block font-mono text-[11px] font-semibold tracking-wide ${
          props.accent ? "text-cyan" : "text-azure"
        }`}
      >
        {props.n}
      </b>
      {props.children}
    </div>
  );
}

function PreviewCard() {
  return (
    <div className="overflow-hidden rounded-[10px] border border-line bg-panel shadow-[0_12px_40px_-12px_rgba(3,7,18,0.7)]">
      <div className="flex items-center gap-1.5 border-b border-linesoft bg-panel2 px-3.5 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-line" />
        <span className="h-2.5 w-2.5 rounded-full bg-line" />
        <span className="h-2.5 w-2.5 rounded-full bg-line" />
        <span className="ml-2 font-mono text-[11px] text-mute">
          codebase-rag · answer + source
        </span>
      </div>
      <div className="grid grid-cols-2">
        <div className="border-r border-linesoft p-4">
          <div className="mb-2.5 font-display text-[13px] font-semibold text-inkbright">
            solve_dependencies
          </div>
          {["100%", "86%", "70%", "92%", "64%"].map((w, i) => (
            <div
              key={i}
              className="mb-[7px] h-[7px] rounded-sm bg-linesoft"
              style={{ width: w, marginTop: i === 3 ? 12 : undefined }}
            />
          ))}
          <span className="mt-1 inline-flex h-[15px] w-[15px] items-center justify-center rounded-full border border-cyan/40 bg-cyan/[0.14] font-mono text-[9px] text-cyan">
            1
          </span>
        </div>
        <div className="grid place-items-center bg-panel2 p-2.5">
          <svg viewBox="0 0 160 160" width="150" height="150" fill="none" aria-hidden="true">
            <line x1="45" y1="45" x2="90" y2="88" stroke="#5CA8F8" strokeWidth="1.2" opacity=".5" />
            <line x1="90" y1="88" x2="128" y2="122" stroke="#5CA8F8" strokeWidth="1.2" opacity=".5" />
            <line x1="90" y1="88" x2="52" y2="128" stroke="#5CA8F8" strokeWidth="1.2" opacity=".3" strokeDasharray="4 4" />
            <circle cx="45" cy="45" r="11" fill="rgba(92,168,248,.14)" stroke="#5CA8F8" strokeWidth="1.3" />
            <circle cx="128" cy="122" r="9" fill="rgba(92,168,248,.14)" stroke="#5CA8F8" strokeWidth="1.3" />
            <circle cx="52" cy="128" r="7" fill="rgba(92,168,248,.12)" stroke="#5CA8F8" strokeWidth="1.2" />
            <circle cx="90" cy="88" r="16" fill="rgba(94,234,212,.18)" stroke="#5EEAD4" strokeWidth="1.6" />
          </svg>
        </div>
      </div>
    </div>
  );
}
