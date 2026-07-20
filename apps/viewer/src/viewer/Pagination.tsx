interface PaginationProps {
  currentPage: number;
  onPageChange: (page: number) => void;
  pageCount: number;
}

export function Pagination({
  currentPage,
  onPageChange,
  pageCount,
}: PaginationProps) {
  if (pageCount <= 1) return null;

  return (
    <nav
      className="mt-11 ml-[58px] flex items-center justify-between gap-4 border-t border-line pt-4 max-[700px]:ml-[34px]"
      aria-label="Commit pages"
    >
      <PageButton
        disabled={currentPage === 1}
        label="Previous"
        onClick={() => onPageChange(currentPage - 1)}
      />
      <span className="text-[10px]/[1.4] font-bold tracking-[0.08em] text-muted uppercase">
        Page <span className="text-ink">{currentPage}</span> / {pageCount}
      </span>
      <PageButton
        disabled={currentPage === pageCount}
        label="Next"
        onClick={() => onPageChange(currentPage + 1)}
      />
    </nav>
  );
}

interface PageButtonProps {
  disabled: boolean;
  label: string;
  onClick: () => void;
}

function PageButton({ disabled, label, onClick }: PageButtonProps) {
  return (
    <button
      className="min-h-8 cursor-pointer rounded-[4px] border border-line-strong bg-surface px-3 text-[11px] font-bold text-ink transition-colors hover:border-muted hover:bg-[oklch(0.2_0.013_60)] disabled:cursor-not-allowed disabled:opacity-35"
      type="button"
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
