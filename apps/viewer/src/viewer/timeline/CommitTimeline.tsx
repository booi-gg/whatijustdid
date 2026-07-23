import type { ViewerGroup } from "../model";
import { formatDay } from "../presentation";
import type { ViewerDay } from "../selectViewerPage";
import { CommitCard } from "./CommitCard";

interface CommitTimelineProps {
  days: ViewerDay[];
  generatedHighlights: Set<string>;
  onGenerationFailed: (sha: string) => void;
  onGenerationStarted: (sha: string) => void;
  onGeneratedScrollCompleted: (sha: string) => void;
  onGeneratedHighlightDismissed: (sha: string) => void;
  onGroupGenerated: (group: ViewerGroup) => void;
  onGroupUpdated: (group: ViewerGroup) => void;
  scrollTargetSha: string | null;
}

export function CommitTimeline({
  days,
  generatedHighlights,
  onGenerationFailed,
  onGenerationStarted,
  onGeneratedScrollCompleted,
  onGeneratedHighlightDismissed,
  onGroupGenerated,
  onGroupUpdated,
  scrollTargetSha,
}: CommitTimelineProps) {
  return days.map(([date, groups]) => (
    <DaySection
      date={date}
      generatedHighlights={generatedHighlights}
      groups={groups}
      key={date}
      onGenerationFailed={onGenerationFailed}
      onGenerationStarted={onGenerationStarted}
      onGeneratedScrollCompleted={onGeneratedScrollCompleted}
      onGeneratedHighlightDismissed={onGeneratedHighlightDismissed}
      onGroupGenerated={onGroupGenerated}
      onGroupUpdated={onGroupUpdated}
      scrollTargetSha={scrollTargetSha}
    />
  ));
}

interface DaySectionProps {
  date: string;
  generatedHighlights: Set<string>;
  groups: ViewerGroup[];
  onGenerationFailed: (sha: string) => void;
  onGenerationStarted: (sha: string) => void;
  onGeneratedScrollCompleted: (sha: string) => void;
  onGeneratedHighlightDismissed: (sha: string) => void;
  onGroupGenerated: (group: ViewerGroup) => void;
  onGroupUpdated: (group: ViewerGroup) => void;
  scrollTargetSha: string | null;
}

function DaySection({
  date,
  generatedHighlights,
  groups,
  onGenerationFailed,
  onGenerationStarted,
  onGeneratedScrollCompleted,
  onGeneratedHighlightDismissed,
  onGroupGenerated,
  onGroupUpdated,
  scrollTargetSha,
}: DaySectionProps) {
  return (
    <section className="relative min-w-0 [--content-inset:58px] [--thread-x:16px] pb-12 pl-[var(--content-inset)] last:pb-0 before:absolute before:top-[9px] before:bottom-[-12px] before:left-[calc(var(--thread-x)-1px)] before:w-px before:bg-line-strong before:content-[''] last:before:bottom-0 max-[700px]:[--content-inset:34px] max-[700px]:[--thread-x:7px]">
      <h2 className="relative mb-6 text-[13px]/[18px] font-bold tracking-[-0.015em] text-muted before:absolute before:top-0 before:left-[calc(var(--thread-x)-var(--content-inset)-9px)] before:size-[18px] before:rounded-full before:border-[3px] before:border-muted before:bg-paper before:shadow-[0_0_0_4px_var(--color-paper)] before:content-[''] max-[700px]:text-xs">
        <time dateTime={date}>{formatDay(date)}</time>
      </h2>
      <div className="grid min-w-0 gap-7">
        {groups.map((group, index) => (
          <CommitCard
            group={group}
            isGeneratedHighlight={
              typeof group.sha === "string" &&
              generatedHighlights.has(group.sha.toLowerCase())
            }
            key={
              group.sha ??
              `${group.date ?? date}-${group.ref ?? "change"}-${index}`
            }
            onGenerationFailed={onGenerationFailed}
            onGenerationStarted={onGenerationStarted}
            onGeneratedScrollCompleted={onGeneratedScrollCompleted}
            onGeneratedHighlightDismissed={onGeneratedHighlightDismissed}
            onGroupGenerated={onGroupGenerated}
            onGroupUpdated={onGroupUpdated}
            shouldScrollIntoView={
              typeof group.sha === "string" &&
              group.sha.toLowerCase() === scrollTargetSha
            }
          />
        ))}
      </div>
    </section>
  );
}
