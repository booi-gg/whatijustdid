interface ProjectFiltersProps {
  activeProject: string;
  projectCounts: ReadonlyMap<string, number>;
  projectNames: string[];
  onSelect: (project: string) => void;
}

export function ProjectFilters({
  activeProject,
  projectCounts,
  projectNames,
  onSelect,
}: ProjectFiltersProps) {
  return (
    <nav
      className="no-scrollbar flex gap-[7px] overflow-x-auto"
      aria-label="Filter changes by project"
    >
      {projectNames.map((project) => {
        const isActive = project === activeProject;
        return (
          <button
            className={`inline-flex min-h-[34px] shrink-0 cursor-pointer items-center gap-2 rounded-[5px] border px-2 py-[7px] pl-3 text-xs font-[680] transition-colors ${
              isActive
                ? "border-accent bg-accent text-accent-ink"
                : "border-line-strong bg-surface text-ink hover:border-[oklch(0.4_0.016_60)]"
            }`}
            type="button"
            aria-pressed={isActive}
            key={project}
            onClick={() => onSelect(project)}
          >
            {project}
            <span
              className={`min-w-5 rounded-[3px] px-[5px] py-0.5 text-center text-[10px]/[1.4] font-bold ${
                isActive
                  ? "bg-accent-ink/14 text-accent-ink"
                  : "bg-[oklch(0.2_0.013_60)] text-muted"
              }`}
            >
              {projectCounts.get(project) ?? 0}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
