"use client";

import type { Citation } from "@/lib/api";
import type { RightTab } from "@/lib/types";
import { CloseIcon, CodeIcon, GraphIcon } from "./icons";
import { CodeView } from "./CodeView";
import { GraphView } from "./GraphView";

export function WorkPane(props: {
  citations: Citation[];
  selectedCite: number | null;
  rightTab: RightTab;
  sheetOpen: boolean;
  onTabChange: (tab: RightTab) => void;
  /** from a graph node: select citation + switch to Code */
  onOpenCitation: (index: number) => void;
  onCloseSheet: () => void;
}) {
  const {
    citations,
    selectedCite,
    rightTab,
    sheetOpen,
    onTabChange,
    onOpenCitation,
    onCloseSheet,
  } = props;

  const selected =
    selectedCite !== null ? (citations[selectedCite] ?? null) : null;

  return (
    <section
      className={`work-pane flex min-h-0 flex-col overflow-hidden bg-panel ${sheetOpen ? "open" : ""}`}
    >
      <div className="flex flex-none flex-wrap items-center gap-1.5 border-b border-line bg-panel2 px-3 py-2">
        <span className="sheet-grab mx-auto mb-0.5 h-1 w-9 rounded-sm bg-line" />

        <div
          role="tablist"
          aria-label="Work pane"
          className="flex gap-0.5 rounded-md border border-line bg-bg p-[3px]"
        >
          <TabButton
            active={rightTab === "code"}
            accent="cyan"
            onClick={() => onTabChange("code")}
          >
            <CodeIcon className="h-3.5 w-3.5" />
            Code
          </TabButton>
          <TabButton
            active={rightTab === "graph"}
            accent="azure"
            onClick={() => onTabChange("graph")}
          >
            <GraphIcon className="h-3.5 w-3.5" />
            Graph
          </TabButton>
        </div>

        <div className="flex-1" />
        <span className="hidden font-mono text-[10.5px] text-mute md:inline">
          {selected
            ? `[${(selectedCite ?? 0) + 1}] linked`
            : "linked to selected citation"}
        </span>
        <button
          type="button"
          onClick={onCloseSheet}
          aria-label="Close panel"
          className="sheet-close ml-auto grid h-[30px] w-[30px] place-items-center rounded border border-line bg-panel3 text-mute"
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {/* render ONLY the active panel — flex/hidden both set `display`, so
            toggling a `hidden` class next to `flex` is order-dependent and let
            both panels show at once. Conditional render is unambiguous. */}
        {rightTab === "code" ? (
          <div
            className="absolute inset-0 flex min-h-0 flex-col"
            role="tabpanel"
            aria-label="Code"
          >
            <CodeView citation={selected} />
          </div>
        ) : (
          <div
            className="absolute inset-0 flex min-h-0 flex-col"
            role="tabpanel"
            aria-label="Graph"
          >
            <GraphView
              citations={citations}
              selectedIndex={selectedCite}
              onOpen={onOpenCitation}
            />
          </div>
        )}
      </div>
    </section>
  );
}

function TabButton(props: {
  active: boolean;
  accent: "cyan" | "azure";
  onClick: () => void;
  children: React.ReactNode;
}) {
  const { active, accent, onClick, children } = props;
  const activeText = accent === "cyan" ? "text-cyan" : "text-azure";
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        "flex items-center gap-1.5 rounded px-3.5 py-1.5 text-[12.5px] font-medium transition-colors",
        active ? `bg-panel3 ${activeText}` : "text-mute hover:text-ink",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
