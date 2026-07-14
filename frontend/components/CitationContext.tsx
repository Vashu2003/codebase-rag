"use client";

import { createContext, useContext } from "react";
import type { Citation } from "@/lib/api";

export type CitationContextValue = {
  citations: Citation[];
  /** selected citation index within THIS turn, or null */
  selected: number | null;
  /** select citation by 0-based index (no-op if out of range) */
  onSelect: (index: number) => void;
};

const CitationContext = createContext<CitationContextValue | null>(null);

export function CitationProvider(props: {
  value: CitationContextValue;
  children: React.ReactNode;
}) {
  return (
    <CitationContext.Provider value={props.value}>
      {props.children}
    </CitationContext.Provider>
  );
}

export function useCitations(): CitationContextValue {
  const ctx = useContext(CitationContext);
  if (!ctx) {
    // Rendered outside a turn (shouldn't happen) — degrade gracefully.
    return { citations: [], selected: null, onSelect: () => {} };
  }
  return ctx;
}
