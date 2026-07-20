interface ViewerHeaderProps {
  databaseSize: string | null;
  projectName: string;
  summary: string;
}

export function ViewerHeader({
  databaseSize,
  projectName,
  summary,
}: ViewerHeaderProps) {
  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-7 border-b border-line-strong px-1 pb-[30px] max-[700px]:grid-cols-1 max-[700px]:gap-4">
      <div>
        <p className="mb-[18px] flex items-center gap-2.5 text-[10px]/[1.2] font-bold tracking-[0.09em] text-muted uppercase">
          <span className="inline-flex items-center gap-2 text-ink">
            <BrandMark />
            <span className="text-xs tracking-[-0.045em] lowercase">
              whatijustdid [new]
            </span>
          </span>
          <span className="inline-flex items-center gap-2.5 before:h-[13px] before:w-px before:bg-line-strong before:content-['']">
            Repository ledger
          </span>
        </p>
        <p className="mb-2 text-[10px]/[1.2] font-bold tracking-[0.12em] text-accent uppercase">
          Project
        </p>
        <h1 className="overflow-wrap-anywhere m-0 max-w-[650px] text-[clamp(38px,7vw,72px)]/[0.94] font-[720] tracking-[-0.075em]">
          {projectName}
        </h1>
      </div>
      <p
        className="mb-1 max-w-[230px] text-right text-[13px]/[1.55] text-muted max-[700px]:max-w-none max-[700px]:text-left"
        aria-live="polite"
      >
        {summary}
        {databaseSize ? (
          <span className="mt-1 block text-[11px] font-bold text-faint">
            Database size · <span className="text-muted">{databaseSize}</span>
          </span>
        ) : null}
      </p>
    </header>
  );
}

function BrandMark() {
  return (
    <svg
      className="size-7 shrink-0"
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect
        x="1"
        y="1"
        width="98"
        height="98"
        rx="23"
        stroke="#f6c835"
        strokeWidth="2"
      />
      <path
        d="M48.053 15.28c19.956 0 36.134 14.936 36.134 33.36S68.009 82 48.053 82C28.097 82 16 67.064 16 48.64s12.097-33.36 32.053-33.36Z"
        fill="#f6c835"
      />
      <path
        d="M30.664 43.803c0 3.916 3.179 4.73 7.095 4.73s7.096-.814 7.096-4.73-1.997-9.46-5.913-9.46-8.278 5.544-8.278 9.46Zm39.119 2.933c0 3.916-3.18 4.73-7.096 4.73s-7.095-.814-7.095-4.73 1.997-9.461 5.913-9.461 8.278 5.544 8.278 9.46Z"
        fill="#1b1505"
      />
      <path
        d="M37.996 59.271c8.938 3.455 16.013 7.294 23.462 1.152"
        stroke="#232320"
        strokeLinecap="round"
      />
    </svg>
  );
}
