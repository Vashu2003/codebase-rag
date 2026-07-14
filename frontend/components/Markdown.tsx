"use client";

import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useCitations } from "./CitationContext";

/* ---------- minimal hast shapes (avoid pulling extra type deps) ---------- */
type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

const CITE_RE = /\[(\d+)\]/g;
const CITE_TEST = /\[\d+\]/;

/**
 * rehype plugin: turn inline `[n]` tokens in text into <cite data-citation="n">
 * elements (skipping code / pre), so we can render them as clickable chips.
 */
function rehypeCitations() {
  return (tree: HastNode) => walk(tree, false);
}

function walk(node: HastNode, insideCode: boolean) {
  if (!node.children) return;
  const next: HastNode[] = [];
  for (const child of node.children) {
    if (child.type === "text" && !insideCode && child.value && CITE_TEST.test(child.value)) {
      next.push(...splitCitations(child.value));
    } else {
      if (child.type === "element") {
        const inCode =
          insideCode || child.tagName === "code" || child.tagName === "pre";
        walk(child, inCode);
      }
      next.push(child);
    }
  }
  node.children = next;
}

function splitCitations(value: string): HastNode[] {
  const out: HastNode[] = [];
  let last = 0;
  CITE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CITE_RE.exec(value))) {
    if (m.index > last) {
      out.push({ type: "text", value: value.slice(last, m.index) });
    }
    out.push({
      type: "element",
      tagName: "cite",
      properties: { dataCitation: m[1] },
      children: [{ type: "text", value: m[1] }],
    });
    last = m.index + m[0].length;
  }
  if (last < value.length) {
    out.push({ type: "text", value: value.slice(last) });
  }
  return out;
}

/* ---------- clickable citation chip ---------- */
function CiteChip(props: { node?: unknown; children?: React.ReactNode }) {
  const { citations, selected, onSelect } = useCitations();
  const node = props.node as HastNode | undefined;
  const raw = node?.properties?.dataCitation;
  const n = typeof raw === "string" ? parseInt(raw, 10) : Number(raw);
  const index = Number.isFinite(n) ? n - 1 : -1;
  const citation = index >= 0 ? citations[index] : undefined;

  if (!citation) {
    // out-of-range reference — render as inert text so the answer still reads
    return <span className="cite-chip">{props.children}</span>;
  }

  const isSeed = citation.source === "seed";
  const isActive = selected === index;
  return (
    <button
      type="button"
      className={[
        "cite-chip",
        isSeed ? "seed" : "",
        isActive ? "active" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => onSelect(index)}
      aria-label={`Citation ${n}: ${citation.symbol ?? citation.file}`}
      aria-pressed={isActive}
    >
      {n}
    </button>
  );
}

const components: Components = {
  // `cite` is a valid intrinsic element; react-markdown renders our chip for it
  cite: CiteChip as unknown as Components["cite"],
};

function MarkdownImpl({ children }: { children: string }) {
  return (
    <div className="prose-answer">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeCitations]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

export const Markdown = memo(MarkdownImpl);
