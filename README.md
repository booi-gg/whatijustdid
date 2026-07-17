# Changetrail

Changetrail turns committed code diffs into persistent AI summaries. It shows what each commit changed; it does not reuse commit messages as descriptions.

## Storage model

Git remains the commit ledger. Changetrail keeps only compact generation state and AI summaries in a local SQLite database:

```text
repository files          Git common directory (private to this clone)
├── changetrail.json      └── changetrail/summaries.sqlite
└── changetrail/data.js      ├── commit SHA + generation status
    ignored viewer cache     └── type, projects, and AI summary
```

Raw diffs, commit messages, and full commit metadata are not copied into SQLite. They are read from Git when needed. The database lives under `git rev-parse --git-common-dir`, so it:

- never appears in `git status` or repository history;
- persists across checkouts and is shared by linked worktrees in the same clone;
- stays local to one clone, laptop, and OS account;
- uses SQLite WAL plus generation leases so concurrent worktrees do not make duplicate AI calls.

Hosted account/team sync is intentionally reserved for a later paid cloud service. Changetrail will sync records through that service rather than commit databases or summaries to Git.

## Requirements

- Git
- Node.js 22.13 or newer
- credentials for one supported AI agent

Codex/OpenAI is the default. `raw` is not an agent and there is no commit-message fallback.

```bash
export OPENAI_API_KEY=...
```

Claude and a local OpenAI-compatible Llama endpoint are also supported.

## Install

```bash
npm install --save-dev changetrail
npx changetrail init
```

Initialization creates shared `changetrail.json`, initializes private SQLite, updates the local ignore block, installs Git hooks, and builds the viewer cache. The bundled viewer remains package-owned; it is not copied into the repository.

After each successful commit, the `post-commit` hook summarizes the committed code diff and rebuilds `changetrail/data.js`. Agent failures never block the Git commit. A failed summary remains resumable in SQLite.

To install or refresh only the local hooks:

```bash
npx changetrail hook
```

To remove only Changetrail-owned hook blocks:

```bash
npx changetrail unhook
```

Existing hook logic is preserved. Git hooks are clone-local and normally shared by linked worktrees.

## Existing history and token control

Changetrail never spends tokens across repository history without an explicit scope.

```bash
# Preview the default bounded scope; makes zero AI calls
npx changetrail backfill

# Generate summaries for at most 25 recent commits
npx changetrail backfill --limit 25

# Preview all reachable commits; makes zero AI calls without --yes
npx changetrail backfill --all

# Explicitly approve full-history generation
npx changetrail backfill --all --yes
```

Before generation, the CLI reports how many selected commits are missing summaries and a worst-case input-token estimate. Ready commits are skipped, so interrupted runs resume without regenerating completed work. Add `--force` only when intentionally replacing existing summaries.

`changetrail sync` is reserved for hosted multi-device/team sync and currently uploads nothing.

## Viewer and editing

```bash
npx changetrail preview
npx changetrail preview --port 4173
npx changetrail build
npx changetrail edit <commit-sha-or-prefix>
```

`preview` serves the bundled viewer with live reload. `edit` changes the private SQLite summary and rebuilds no repository-owned database row.

## Configuration

The tracked `changetrail.json` contains safe shared defaults:

```json
{
  "agent": "codex",
  "model": null,
  "dir": "changetrail",
  "viewerLimit": 200,
  "generationLimit": 50,
  "maxDiffBytes": 80000,
  "timeoutMs": 20000,
  "projects": {
    "web": ["apps/web"],
    "worker": ["apps/worker"]
  }
}
```

`model: null` lets the selected agent use its package default. Codex/OpenAI currently resolves to `gpt-5.4-mini`; the resolved model is saved with the summary.

Put personal overrides in ignored `changetrail/changetrail.local.json`. Environment variables take precedence:

- `CHANGETRAIL_AGENT` (legacy: `CHANGELOG_AGENT` or `CHANGELOG_PROVIDER`)
- `CHANGETRAIL_MODEL` (legacy: `CHANGELOG_MODEL`)
- `CHANGETRAIL_DIR` (legacy: `CHANGELOG_DIR`)
- `CHANGETRAIL_DB_PATH` for an advanced local database-path override

Agent-specific variables:

- Codex/OpenAI: `OPENAI_API_KEY`, optional `OPENAI_BASE_URL`
- Claude: `ANTHROPIC_API_KEY`, optional `ANTHROPIC_BASE_URL`
- Llama: `LLAMA_BASE_URL`, optional `LLAMA_API_KEY`

## Migrating tracked JSON rows

`changetrail init` performs a one-time import from legacy `changetrail/db/**/*.json` rows. Valid AI summaries become local SQLite summaries. Empty or `provider: "raw"` rows become pending and never import commit-message text.

The migration deliberately does not stage or delete repository files. After verifying the imported summaries with `changetrail preview`, remove the old tracked artifacts in a normal repository change:

```bash
git rm -r changetrail/db changetrail/data.js
```

The ignore block prevents those local artifacts from being re-added.
