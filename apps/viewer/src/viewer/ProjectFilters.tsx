interface ProjectFiltersProps {
  activeProject: string;
  missingChangelogCount: number;
  projectCounts: ReadonlyMap<string, number>;
  projectNames: string[];
  showMissingOnly: boolean;
  onMissingSelect: () => void;
  onSelect: (project: string) => void;
}

export function ProjectFilters({
  activeProject,
  missingChangelogCount,
  projectCounts,
  projectNames,
  showMissingOnly,
  onMissingSelect,
  onSelect,
}: ProjectFiltersProps) {
  const [allProject, ...specificProjects] = projectNames;

  return (
    <nav
      className="no-scrollbar flex gap-[7px] overflow-x-auto"
      aria-label="Filter commits"
    >
      {allProject ? (
        <FilterButton
          count={projectCounts.get(allProject) ?? 0}
          isActive={!showMissingOnly && allProject === activeProject}
          label={allProject}
          onClick={() => onSelect(allProject)}
        />
      ) : null}
      <FilterButton
        count={missingChangelogCount}
        isActive={showMissingOnly}
        label="Not generated"
        onClick={onMissingSelect}
      />
      {specificProjects.length > 0 ? (
        <span
          className="mx-1 my-1 h-[26px] w-px shrink-0 bg-line-strong"
          aria-hidden="true"
        />
      ) : null}
      {specificProjects.map((project) => (
        <FilterButton
          count={projectCounts.get(project) ?? 0}
          isActive={!showMissingOnly && project === activeProject}
          key={project}
          label={project}
          onClick={() => onSelect(project)}
        />
      ))}
    </nav>
  );
}

interface FilterButtonProps {
  count: number;
  isActive: boolean;
  label: string;
  onClick: () => void;
}

function FilterButton({ count, isActive, label, onClick }: FilterButtonProps) {
  return (
    <button
      className={`inline-flex min-h-[34px] shrink-0 cursor-pointer items-center gap-2 rounded-[5px] border px-2 py-[7px] pl-3 text-xs font-[680] transition-colors ${
        isActive
          ? "border-accent bg-accent text-accent-ink"
          : "border-line-strong bg-surface text-ink hover:border-[oklch(0.4_0.016_60)]"
      }`}
      type="button"
      aria-pressed={isActive}
      onClick={onClick}
    >
      {label}
      <span
        className={`min-w-5 rounded-[3px] px-[5px] py-0.5 text-center text-[10px]/[1.4] font-bold ${
          isActive
            ? "bg-accent-ink/14 text-accent-ink"
            : "bg-[oklch(0.2_0.013_60)] text-muted"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
