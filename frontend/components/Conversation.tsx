"use client";

import { useEffect, useRef } from "react";
import type { Selection, Turn } from "@/lib/types";
import { AnswerBlock } from "./AnswerBlock";

export function Conversation(props: {
  turns: Turn[];
  selection: Selection | null;
  busy: boolean;
  pendingQuestion: string | null;
  onSelect: (turnIndex: number, cite: number) => void;
}) {
  const { turns, selection, busy, pendingQuestion, onSelect } = props;
  const endRef = useRef<HTMLDivElement>(null);

  // keep the newest answer in view as turns / thinking state change
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, busy]);

  return (
    <div className="scroll-slim flex-1 overflow-y-auto px-6 pb-3 pt-6 md:px-7">
      {turns.map((turn, i) => (
        <AnswerBlock
          key={turn.id}
          turn={turn}
          turnIndex={i}
          selectedCite={selection?.turn === i ? selection.cite : null}
          onSelect={onSelect}
        />
      ))}

      {busy && <Thinking question={pendingQuestion} />}
      <div ref={endRef} />
    </div>
  );
}

function Thinking({ question }: { question: string | null }) {
  return (
    <article className="mb-8" aria-live="polite">
      {question && (
        <div className="mb-5 flex items-start gap-3">
          <span className="mt-0.5 grid h-6 w-6 flex-none place-items-center rounded border border-line bg-panel3 font-mono text-[10px] text-mute">
            You
          </span>
          <p className="font-display text-[16px] font-semibold leading-snug tracking-tight text-inkbright">
            {question}
          </p>
        </div>
      )}
      <div className="flex items-center gap-2.5 font-mono text-[11.5px] text-mute">
        <span className="flex gap-1" aria-hidden="true">
          <Dot delay="0ms" />
          <Dot delay="220ms" />
          <Dot delay="440ms" />
        </span>
        Retrieving chunks, expanding the call-graph, and reasoning…
      </div>
    </article>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="thinking-dot h-1.5 w-1.5 rounded-full bg-cyan"
      style={{ animationDelay: delay }}
    />
  );
}
