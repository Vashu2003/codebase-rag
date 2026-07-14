"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ingest,
  listRepos,
  query,
  type Citation,
  type Repo,
} from "@/lib/api";
import type { RightTab, Selection, Turn } from "@/lib/types";
import { RepoBar } from "@/components/RepoBar";
import { Onboarding } from "@/components/Onboarding";
import { Conversation } from "@/components/Conversation";
import { PromptBar } from "@/components/PromptBar";
import { WorkPane } from "@/components/WorkPane";
import { BrandMark } from "@/components/icons";

/** Focal citation for a fresh answer: strongest seed, else strongest overall. */
function focalIndex(citations: Citation[]): number {
  if (citations.length === 0) return 0;
  let idx = -1;
  let best = -Infinity;
  citations.forEach((c, i) => {
    if (c.source === "seed" && c.score > best) {
      best = c.score;
      idx = i;
    }
  });
  if (idx >= 0) return idx;
  idx = 0;
  best = -Infinity;
  citations.forEach((c, i) => {
    if (c.score > best) {
      best = c.score;
      idx = i;
    }
  });
  return idx;
}

export default function Home() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [activeRepo, setActiveRepo] = useState("");
  const [booting, setBooting] = useState(true);

  const [turns, setTurns] = useState<Turn[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [rightTab, setRightTab] = useState<RightTab>("code");
  const [sheetOpen, setSheetOpen] = useState(false);

  const [busy, setBusy] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newRepoRequested, setNewRepoRequested] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [indexError, setIndexError] = useState<string | null>(null);

  // mirrors turns.length so handleAsk can index the appended turn without a
  // stale closure or an impure setState-inside-updater.
  const turnCountRef = useRef(0);
  useEffect(() => {
    turnCountRef.current = turns.length;
  }, [turns.length]);

  // mirrors activeRepo so an in-flight query can tell whether the user switched
  // repos before it resolved — a stale response must never land in the repo the
  // user is now looking at (would misattribute repoA's answer under repoB).
  const activeRepoRef = useRef(activeRepo);
  useEffect(() => {
    activeRepoRef.current = activeRepo;
  }, [activeRepo]);

  const refreshRepos = useCallback(async (): Promise<Repo[]> => {
    try {
      const list = await listRepos();
      setRepos(list);
      return list;
    } catch {
      setRepos([]);
      return [];
    }
  }, []);

  // initial load: adopt the first indexed repo, else show onboarding
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await refreshRepos();
      if (cancelled) return;
      if (list.length > 0) setActiveRepo(list[0].repo);
      setBooting(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshRepos]);

  const onboardingOpen = !activeRepo || newRepoRequested;

  const handleIndex = useCallback(
    async (source: string) => {
      setIndexing(true);
      setIndexError(null);
      try {
        const res = await ingest(source);
        await refreshRepos();
        setActiveRepo(res.repo);
        setTurns([]);
        setSelection(null);
        setError(null);
        setRightTab("code");
        setNewRepoRequested(false);
        setBusy(false);
        setPendingQuestion(null);
      } catch (e) {
        setIndexError((e as Error).message);
      } finally {
        setIndexing(false);
      }
    },
    [refreshRepos],
  );

  const handleSwitch = useCallback(
    (repo: string) => {
      if (repo === activeRepo) return;
      setActiveRepo(repo);
      setTurns([]);
      setSelection(null);
      setError(null);
      setSheetOpen(false);
      setRightTab("code");
      // any in-flight answer belongs to the old repo now; clear the thinking
      // state so the new repo starts clean (the stale response is dropped on
      // resolve by the activeRepoRef guard in handleAsk).
      setBusy(false);
      setPendingQuestion(null);
    },
    [activeRepo],
  );

  const handleAsk = useCallback(
    async (question: string) => {
      if (busy || !activeRepo) return;
      const askRepo = activeRepo; // pin the repo this answer belongs to
      setBusy(true);
      setPendingQuestion(question);
      setError(null);
      try {
        const res = await query(askRepo, question);
        if (activeRepoRef.current !== askRepo) return; // switched away — drop stale
        const nextIndex = turnCountRef.current; // index the appended turn will land at
        const turn: Turn = {
          id: Date.now(),
          question,
          answer: res.answer,
          citations: res.citations,
          retrieval: res.retrieval,
        };
        setTurns((prev) => [...prev, turn]);
        setSelection(
          res.citations.length > 0
            ? { turn: nextIndex, cite: focalIndex(res.citations) }
            : null,
        );
        setRightTab("code");
      } catch (e) {
        if (activeRepoRef.current !== askRepo) return; // error belongs to a repo we left
        setError((e as Error).message);
      } finally {
        // only clear the shared busy/thinking state if we're still on askRepo —
        // otherwise the switch (or a fresh query on the new repo) owns it now.
        if (activeRepoRef.current === askRepo) {
          setBusy(false);
          setPendingQuestion(null);
        }
      }
    },
    [busy, activeRepo],
  );

  // the turn whose retrieval drives the work pane
  const activeTurnIndex = selection
    ? selection.turn
    : turns.length - 1;
  const activeTurn =
    activeTurnIndex >= 0 ? (turns[activeTurnIndex] ?? null) : null;
  const activeCitations = activeTurn?.citations ?? [];
  const selectedCite =
    selection && selection.turn === activeTurnIndex ? selection.cite : null;

  const selectCitation = useCallback((turnIndex: number, cite: number) => {
    setSelection({ turn: turnIndex, cite });
    setSheetOpen(true);
  }, []);

  const openCitationFromGraph = useCallback(
    (cite: number) => {
      setSelection({ turn: activeTurnIndex, cite });
      setRightTab("code");
      setSheetOpen(true);
    },
    [activeTurnIndex],
  );

  if (booting) {
    return (
      <div className="grid h-screen place-items-center">
        <div className="flex items-center gap-2.5 font-display text-inkbright">
          <BrandMark className="h-6 w-6 animate-pulse" />
          <span className="font-mono text-[13px] text-mute">
            loading codebase-rag…
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      {onboardingOpen && (
        <Onboarding
          indexing={indexing}
          indexingLabel={
            indexing
              ? "Cloning, chunking and embedding — first run also downloads the models."
              : null
          }
          error={indexError}
          canClose={!!activeRepo}
          onClose={() => setNewRepoRequested(false)}
          onIndex={handleIndex}
        />
      )}

      <div className="flex h-screen flex-col">
        <RepoBar
          repos={repos}
          activeRepo={activeRepo || "no repo"}
          onSwitch={handleSwitch}
          onNewRepo={() => setNewRepoRequested(true)}
        />

        {/* grid-rows minmax(0,1fr) pins the single row to the container height
            (viewport − topbar) so a tall answer can't grow the row and stretch
            the columns — otherwise the work-pane inherits the content height and
            fit-to-view scales against a too-tall "pane". */}
        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] overflow-hidden min-[901px]:grid-cols-[minmax(400px,45%)_1fr]">
          <section className="flex min-h-0 flex-col overflow-hidden bg-gradient-to-b from-panel/30 to-transparent min-[901px]:border-r min-[901px]:border-line">
            {turns.length === 0 && !busy ? (
              <EmptyConversation repo={activeRepo} />
            ) : (
              <Conversation
                turns={turns}
                selection={selection}
                busy={busy}
                pendingQuestion={pendingQuestion}
                onSelect={selectCitation}
              />
            )}

            {error && (
              <div className="mx-6 mb-2 rounded-md border border-[#f6a5a5]/30 bg-[#f6a5a5]/[0.08] px-3.5 py-2.5 md:mx-7">
                <p className="text-[13px] text-[#f6a5a5]">{error}</p>
              </div>
            )}

            <PromptBar
              repoLabel={activeRepo || "the codebase"}
              busy={busy}
              onSend={handleAsk}
            />
          </section>

          <WorkPane
            citations={activeCitations}
            selectedCite={selectedCite}
            rightTab={rightTab}
            sheetOpen={sheetOpen}
            onTabChange={setRightTab}
            onOpenCitation={openCitationFromGraph}
            onCloseSheet={() => setSheetOpen(false)}
          />
        </div>
      </div>
    </>
  );
}

function EmptyConversation({ repo }: { repo: string }) {
  return (
    <div className="scroll-slim flex-1 overflow-y-auto px-6 pt-6 md:px-7">
      <div className="mx-auto mt-10 max-w-[52ch] text-center">
        <div className="mx-auto mb-5 grid h-11 w-11 place-items-center rounded-xl border border-line bg-panel2">
          <BrandMark className="h-6 w-6" />
        </div>
        <h2 className="mb-2 font-display text-[19px] font-bold tracking-tight text-inkbright">
          Ask <span className="font-mono text-cyan">{repo}</span> anything
        </h2>
        <p className="text-[13.5px] leading-relaxed text-mute">
          Every answer is grounded in real code. Click a{" "}
          <span className="text-azure">[n]</span> citation, a source, or a graph
          node to open the exact source and the call-graph behind it.
        </p>
      </div>
    </div>
  );
}
