"use client";

import { useRef, useState } from "react";
import { SendIcon } from "./icons";

const EXAMPLES = [
  "What does solve_dependencies do?",
  "How is authentication handled?",
  "Trace a request through routing",
];

export function PromptBar(props: {
  repoLabel: string;
  busy: boolean;
  onSend: (question: string) => void;
}) {
  const { repoLabel, busy, onSend } = props;
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function submit() {
    const q = value.trim();
    if (!q || busy) return;
    onSend(q);
    setValue("");
  }

  return (
    <div className="flex-none border-t border-line bg-gradient-to-b from-bg/40 to-panel2 px-6 pb-4 pt-3 md:px-7">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <span className="self-center font-mono text-[10px] tracking-wide text-mute">
          Try
        </span>
        {EXAMPLES.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => {
              setValue(q);
              inputRef.current?.focus();
            }}
            className="rounded-full border border-line bg-panel3 px-2.5 py-[5px] text-[12px] text-ink transition-colors hover:border-azure hover:text-inkbright"
          >
            {q}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-end gap-2 rounded-md border border-line bg-bg py-1.5 pl-3.5 pr-1.5 transition-shadow focus-within:border-cyan focus-within:shadow-[0_0_0_3px_rgba(94,234,212,0.12)]"
      >
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder={`Ask about ${repoLabel}…`}
          aria-label="Ask a question about the codebase"
          className="max-h-32 flex-1 resize-none self-center bg-transparent py-1.5 text-[14px] text-inkbright outline-none placeholder:text-mute"
        />
        <button
          type="submit"
          disabled={busy || value.trim().length === 0}
          aria-label="Send question"
          className="grid h-[34px] w-[34px] flex-none place-items-center rounded bg-cyan text-[#07130f] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <SendIcon className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
