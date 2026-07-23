import { useCallback, useState } from "react";
import type { ViewerGroup } from "../model";
import {
  beginGeneratedCommit,
  completeGeneratedCommit,
  dismissGeneratedCommit,
  failGeneratedCommit,
  readActiveGeneratedHighlights,
  readGeneratedScrollTarget,
} from "./generatedCommitSession";

export function useGeneratedCommitSession(groups: ViewerGroup[]) {
  // Storage preserves the completion highlight if the preview tab is closed
  // or manually refreshed while the durable backend generation is running.
  const [generatedHighlights, setGeneratedHighlights] = useState(() =>
    readActiveGeneratedHighlights(groups),
  );
  // The target is cleared by the ready commit card after its final height is
  // present in the document.
  const [scrollTargetSha, setScrollTargetSha] = useState(() =>
    readGeneratedScrollTarget(),
  );

  const beginGeneration = useCallback((sha: string) => {
    const normalized = sha.toLowerCase();
    beginGeneratedCommit(normalized);
    setScrollTargetSha(normalized);
  }, []);

  const revealGeneratedCommit = useCallback((sha: string) => {
    const normalized = sha.toLowerCase();
    beginGeneratedCommit(normalized);
    setScrollTargetSha(normalized);
    setGeneratedHighlights((current) => {
      if (current.has(normalized)) return current;
      const next = new Set(current);
      next.add(normalized);
      return next;
    });
  }, []);

  const failGeneration = useCallback((sha: string) => {
    const normalized = sha.toLowerCase();
    failGeneratedCommit(normalized);
    setScrollTargetSha((current) => (current === normalized ? null : current));
    setGeneratedHighlights((current) => {
      if (!current.has(normalized)) return current;
      const next = new Set(current);
      next.delete(normalized);
      return next;
    });
  }, []);

  const completeScroll = useCallback((sha: string) => {
    const normalized = sha.toLowerCase();
    completeGeneratedCommit(normalized);
    setScrollTargetSha((current) => (current === normalized ? null : current));
    setGeneratedHighlights((current) => {
      if (current.has(normalized)) return current;
      const next = new Set(current);
      next.add(normalized);
      return next;
    });
  }, []);

  const dismissHighlight = useCallback((sha: string) => {
    dismissGeneratedCommit(sha);
    setGeneratedHighlights((current) => {
      if (!current.has(sha)) return current;
      const next = new Set(current);
      next.delete(sha);
      return next;
    });
  }, []);

  return {
    beginGeneration,
    completeScroll,
    dismissHighlight,
    failGeneration,
    generatedHighlights,
    revealGeneratedCommit,
    scrollTargetSha,
  };
}
