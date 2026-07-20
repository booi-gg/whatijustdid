import { useCallback, useState } from "react";
import type { ViewerGroup } from "../model";
import {
  dismissGeneratedCommit,
  readActiveGeneratedHighlights,
  readGeneratedScrollTarget,
} from "./generatedCommitSession";

export function useGeneratedCommitSession(groups: ViewerGroup[]) {
  // Only the initial mount reads storage. Persisting this ready-only snapshot
  // would erase a highlight during the intermediate generating reload.
  const [generatedHighlights, setGeneratedHighlights] = useState(() =>
    readActiveGeneratedHighlights(groups),
  );
  // The target survives the generating reload and is cleared by the ready
  // commit card, after its final height is present in the document.
  const [scrollTargetSha] = useState(() => readGeneratedScrollTarget());

  const dismissHighlight = useCallback((sha: string) => {
    dismissGeneratedCommit(sha);
    setGeneratedHighlights((current) => {
      if (!current.has(sha)) return current;
      const next = new Set(current);
      next.delete(sha);
      return next;
    });
  }, []);

  return { dismissHighlight, generatedHighlights, scrollTargetSha };
}
