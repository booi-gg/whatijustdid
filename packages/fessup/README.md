# fessup

fessup turns committed code diffs into persistent AI summaries. It shows what each commit changed; it does not reuse commit messages as descriptions.

## Storage model

Git remains the commit ledger. fessup keeps compact generation state and AI summaries in local SQLite. It does not create a `fessup/` directory in the repository:

```text
repository                 Git-private metadata
└── fessup.json       └── fessup/
                               ├── summaries.sqlite
                               └── data.js (rebuildable viewer cache)
```

Raw diffs, commit messages, and full commit metadata are not copied into SQLite. They are read from Git when needed. The database lives under `git rev-parse --git-common-dir`, so it:

- never appears in `git status` or repository history;
- persists across checkouts and is shared by linked worktrees in the same clone;
- stays local to one clone, laptop, and OS account;
- uses SQLite WAL plus generation leases so concurrent worktrees do not make duplicate AI calls.

Hosted account/team sync is intentionally reserved for a later paid cloud service. fessup will sync records through that service rather than commit databases or summaries to Git.

## Requirements

- Git
- Node.js 22.13 or newer
- credentials for one supported AI agent

Codex/OpenAI is the default. `raw` is not an agent and there is no commit-message fallback.

Choose an agent and export its API key:

```bash
# Codex / OpenAI (default)
export OPENAI_API_KEY=sk-...

# DeepSeek
export changereceipt_AGENT=deepseek
export DEEPSEEK_API_KEY=sk-...

# Claude
export changereceipt_AGENT=claude
export ANTHROPIC_API_KEY=sk-ant-...

# Local Ollama (no API key needed)
export changereceipt_AGENT=llama
```

To override the default model per agent:

```bash
export fessup_MODEL=gpt-5.4-flash   # or deepseek-v4-pro, claude-sonnet-4-20250514, etc.
```

## Install

```bash
npm install --save-dev fessup
npx fessup init
```

Initialization creates shared `fessup.json`, initializes private SQLite, installs Git hooks, builds the private viewer cache, and opens the preview. The bundled viewer remains package-owned; it is not copied into the repository. Use `npx fessup init --no-preview` when a script must initialize and exit.

After each successful commit, the `post-commit` hook summarizes the committed code diff and rebuilds the private viewer data. The hook prints whether generation succeeded or failed. Agent failures never block the Git commit; failed records appear in the viewer and remain resumable in SQLite.

### Skipping summary generation

Skip per-commit summary generation in one of two ways:

```bash
# Include [skip fessup] in the commit message
git commit -m "chore: bump deps [skip fessup]"

# Set the FESSUP_SKIP environment variable
FESSUP_SKIP=1 git commit -m "chore: bump deps"
```

To install or refresh only the local hooks:

```bash
npx fessup hook
```

To remove only fessup-owned hook blocks:

```bash
npx fessup unhook
```

Existing hook logic is preserved. Git hooks are clone-local and normally shared by linked worktrees.

## Existing history and token control

fessup never spends tokens across repository history without an explicit scope.

```bash
# Preview the default bounded scope; makes zero AI calls
npx fessup backfill

# Generate summaries for at most 25 recent commits
npx fessup backfill --limit 25

# Preview all reachable commits; makes zero AI calls without --yes
npx fessup backfill --all

# Explicitly approve full-history generation
npx fessup backfill --all --yes
```

Before generation, the CLI reports how many selected commits are missing summaries and a worst-case input-token estimate. Ready commits are skipped, so interrupted runs resume without regenerating completed work. Add `--force` only when intentionally replacing existing summaries.

`fessup sync` is reserved for hosted multi-device/team sync and currently uploads nothing.

## Viewer and editing

```bash
npx fessup preview
npx fessup preview --port 4173
npx fessup build
npx fessup edit <commit-sha-or-prefix>
```

`preview` serves the bundled viewer with live reload. `edit` changes the private SQLite summary and rebuilds no repository-owned database row.

## Configuration

The tracked `fessup.json` contains safe shared defaults:

```json
{
  "agent": "codex",
  "model": null,
  "verbosity": "normal",
  "viewerLimit": 200,
  "generationLimit": 50,
  "maxDiffBytes": 80000,
  "timeoutMs": 20000,
  "showTokens": false,
  "projects": {
    "web": ["apps/web"],
    "worker": ["apps/worker"]
  }
}
```

`model: null` lets the selected agent use its package default. `verbosity` controls summary detail: `"concise"` (600 tokens, 140 chars/change), `"normal"` (1200, 280), to `"detailed"` (2400, 560). `showTokens` (default `false`) — when `true`, the bundled viewer displays a per-commit token-count badge next to each summary entry showing the AI usage for that generation.

Put personal overrides in Git-private `.git/fessup/fessup.local.json`. Environment variables take precedence:

- `FESSUP_AGENT`
- `FESSUP_DB_PATH` for an advanced local database-path override

### Credentials

Each agent normally reads its provider's standard env var (`OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, `ANTHROPIC_API_KEY`). To avoid tracking which name goes with which agent, you can instead set one generic `FESSUP_AGENT_API_KEY` — it's used as the key for whichever agent is currently configured, and it takes precedence if both are set.

Any of these can also live in a `.env` file at the repository root instead of your shell profile; it's loaded automatically and is gitignored by default, so it's never committed. A real exported shell variable still wins over the `.env` value.

```dotenv
# .env (gitignored)
FESSUP_AGENT_API_KEY=sk-...
```

Agent-specific variables:

- Codex/OpenAI: `OPENAI_API_KEY` (or `FESSUP_AGENT_API_KEY`), optional `OPENAI_BASE_URL`
- DeepSeek: `DEEPSEEK_API_KEY` (or `FESSUP_AGENT_API_KEY`), optional `DEEPSEEK_BASE_URL`
- Claude: `ANTHROPIC_API_KEY` (or `FESSUP_AGENT_API_KEY`), optional `ANTHROPIC_BASE_URL`
- Llama/Ollama: no key needed, optional `OLLAMA_HOST`

### Supported agents

Set `"agent"` in `fessup.json` (or `FESSUP_AGENT`) to one of the values below. `"model": null` uses the listed default; set `"model"` (or `FESSUP_MODEL`) to override it.

| Agent | `agent` value | Credential | Default model | Example override |
| --- | --- | --- | --- | --- |
| Codex / OpenAI | `codex` (alias: `openai`) | `OPENAI_API_KEY` or `FESSUP_AGENT_API_KEY` | `gpt-5.4-mini` | `"model": "gpt-5.4"` |
| DeepSeek | `deepseek` | `DEEPSEEK_API_KEY` or `FESSUP_AGENT_API_KEY` | `deepseek-v4-flash` | `"model": "deepseek-v4"` |
| Claude | `claude` | `ANTHROPIC_API_KEY` or `FESSUP_AGENT_API_KEY` | `claude-sonnet-5` | `"model": "claude-opus-4-8"` |
| Llama / Ollama | `llama` | none (runs against local `OLLAMA_HOST`) | `llama3.2` | `"model": "llama3.3"` |

Example `fessup.json` pinned to DeepSeek's larger model:

```json
{
  "agent": "deepseek",
  "model": "deepseek-v4"
}
```
