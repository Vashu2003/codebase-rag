"use client";

import { useEffect, useRef, useState } from "react";
import type { Repo } from "@/lib/api";
import { BrandMark, CaretIcon, PlusIcon } from "./icons";

export function RepoBar(props: {
  repos: Repo[];
  activeRepo: string;
  onSwitch: (repo: string) => void;
  onNewRepo: () => void;
}) {
  const { repos, activeRepo, onSwitch, onNewRepo } = props;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = repos.find((r) => r.repo === activeRepo);
  const others = repos.filter((r) => r.repo !== activeRepo);

  return (
    <header className="relative z-20 flex h-14 flex-none items-center gap-3.5 border-b border-line bg-gradient-to-b from-panel/90 to-bg/85 px-4 backdrop-blur">
      <div className="flex flex-none items-center gap-2.5 whitespace-nowrap font-display font-semibold tracking-tight text-inkbright">
        <BrandMark className="h-[22px] w-[22px]" />
        <span className="hidden sm:inline">codebase-rag</span>
        <span className="ml-0.5 hidden rounded-full border border-line px-1.5 py-0.5 font-mono text-[10.5px] font-normal tracking-wide text-mute md:inline">
          retrieval-grounded
        </span>
      </div>

      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex items-center gap-2.5 rounded-md border border-line bg-panel2 px-2.5 py-1.5 text-[13px] text-ink transition-colors hover:border-[#2b3f63] hover:bg-panel3"
        >
          <span className="h-[7px] w-[7px] rounded-full bg-cyan shadow-[0_0_8px_#5EEAD4]" />
          <span className="max-w-[42vw] truncate font-mono font-medium text-inkbright sm:max-w-none">
            {activeRepo}
          </span>
          {active && (
            <span className="hidden font-mono text-[11px] text-mute sm:inline">
              {active.files} files
            </span>
          )}
          <CaretIcon className="h-3 w-3 text-mute" />
        </button>

        {open && (
          <div
            role="menu"
            className="absolute left-0 top-[calc(100%+8px)] z-40 min-w-[280px] rounded-md border border-line bg-panel p-1.5 shadow-[0_12px_40px_-12px_rgba(3,7,18,0.7)]"
          >
            <MenuLabel>Active repository</MenuLabel>
            {active && (
              <RepoRow repo={active} active onClick={() => setOpen(false)} />
            )}

            {others.length > 0 && <MenuLabel>Switch to</MenuLabel>}
            {others.map((r) => (
              <RepoRow
                key={r.repo}
                repo={r}
                onClick={() => {
                  onSwitch(r.repo);
                  setOpen(false);
                }}
              />
            ))}

            <div className="mx-1.5 my-1.5 h-px bg-linesoft" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onNewRepo();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-2 text-left font-mono text-[13px] text-azure hover:bg-azure/[0.08]"
            >
              <PlusIcon className="h-3.5 w-3.5" /> Index a repo from GitHub URL
            </button>
          </div>
        )}
      </div>

      <div className="flex-1" />

      <button
        type="button"
        onClick={onNewRepo}
        className="flex flex-none items-center gap-1.5 whitespace-nowrap rounded-md border border-line bg-panel2 px-2.5 py-1.5 text-[12.5px] text-ink transition-colors hover:border-[#2b3f63] hover:bg-panel3 hover:text-inkbright"
      >
        <PlusIcon className="h-3 w-3" />
        <span className="hidden sm:inline">New repo</span>
      </button>
    </header>
  );
}

function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <h6 className="mx-2 my-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-mute">
      {children}
    </h6>
  );
}

function RepoRow(props: { repo: Repo; active?: boolean; onClick: () => void }) {
  const { repo, active, onClick } = props;
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-2.5 rounded px-2 py-2 text-left text-[13px] hover:bg-panel3"
    >
      <span className={`truncate font-mono ${active ? "text-cyan" : "text-ink"}`}>
        {repo.repo}
      </span>
      <span className="flex-none font-mono text-[11px] text-mute">
        {repo.files} files{active ? " ✓" : ""}
      </span>
    </button>
  );
}
