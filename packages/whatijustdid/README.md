# whatijustdid

whatijustdid turns committed code diffs into persistent AI summaries. It shows what each commit changed; it does not reuse commit messages as descriptions.

## Storage model

Git remains the commit ledger. whatijustdid keeps compact generation state and AI summaries in local SQLite. It does not create a `whatijustdid/` directory in the repository:

```text
repository                 Git-private metadata
└── whatijustdid.json       └── whatijustdid/
                               ├── summaries.sqlite
                               └── data.js (rebuildable viewer cache)
```

Raw diffs, commit messages, and full commit metadata are not copied into SQLite. They are read from Git when needed. The database lives under `git rev-parse --git-common-dir`, so it:

- never appears in `git status` or repository history;
- persists across checkouts and is shared by linked worktrees in the same clone;
- stays local to one clone, laptop, and OS account;
- uses SQLite WAL plus generation leases so concurrent worktrees do not make duplicate AI calls.

Hosted account/team sync is intentionally reserved for a later paid cloud service. whatijustdid will sync records through that service rather than commit databases or summaries to Git.

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
export whatijustdid_MODEL=gpt-5.4-flash   # or deepseek-v4-pro, claude-sonnet-4-20250514, etc.
```

## Install

```bash
npm install --save-dev whatijustdid
npx whatijustdid init
```

Initialization creates shared `whatijustdid.json`, initializes private SQLite, installs Git hooks, builds the private viewer cache, and opens the preview. The bundled viewer remains package-owned; it is not copied into the repository. Use `npx whatijustdid init --no-preview` when a script must initialize and exit.

After each successful commit, the `post-commit` hook summarizes the committed code diff and rebuilds the private viewer data. The hook prints whether generation succeeded or failed. Agent failures never block the Git commit; failed records appear in the viewer and remain resumable in SQLite.

### Skipping summary generation

Skip per-commit summary generation in one of two ways:

```bash
# Include [skip wijd] in the commit message
git commit -m "chore: bump deps [skip wijd]"

# Set the WHATIJUSTDID_SKIP environment variable
WHATIJUSTDID_SKIP=1 git commit -m "chore: bump deps"
```

To install or refresh only the local hooks:

```bash
npx whatijustdid hook
```

To remove only whatijustdid-owned hook blocks:

```bash
npx whatijustdid unhook
```

Existing hook logic is preserved. Git hooks are clone-local and normally shared by linked worktrees.

## AI commit messages

`whatijustdid commit` wraps `git commit`: it sends the staged diff to the configured agent, proposes a conventional-commit message, and asks before committing.

```bash
git add -p
npx whatijustdid commit
```

```
wijd: summarizing 2 staged files with codex…

  feat: added a commit command that drafts the message from the staged diff

wijd: commit with this message?
  ❯ commit
    regenerate
    cancel
```

Pick with ↑/↓ and Enter (or the shortcut letters `y`/`r`/`c`; Esc cancels):

- **commit** runs `git commit -m` with the proposed message; the normal `post-commit` hook then records the summary as usual.
- **regenerate** asks the agent for another message.
- **cancel** exits; nothing is committed.

When nothing is staged yet, the CLI offers to stage for you instead of failing:

```
wijd: nothing staged.
  ❯ stage everything (git add -A)
    cancel
```

Flags:

```bash
# Stage everything first (git add -A), then draft and commit
npx whatijustdid commit --all

# Accept the first generated message without prompting
npx whatijustdid commit --yes

# Forward extra flags to git commit after --
npx whatijustdid commit -- --no-verify
```

Because `commit` is a wrapper, it prints every git command it runs (`$ git add -A`, `$ git commit -m '…'`) so nothing happens invisibly. The staged diff is bounded by `maxDiffBytes`, and the message style follows the configured `verbosity`.

## Existing history and token control

whatijustdid never spends tokens across repository history without an explicit scope.

```bash
# Preview the default bounded scope; makes zero AI calls
npx whatijustdid backfill

# Generate summaries for at most 25 recent commits
npx whatijustdid backfill --limit 25

# Preview all reachable commits; makes zero AI calls without --yes
npx whatijustdid backfill --all

# Explicitly approve full-history generation
npx whatijustdid backfill --all --yes
```

Before generation, the CLI reports how many selected commits are missing summaries and a worst-case input-token estimate. Ready commits are skipped, so interrupted runs resume without regenerating completed work. Add `--force` only when intentionally replacing existing summaries.

`whatijustdid sync` is reserved for hosted multi-device/team sync and currently uploads nothing.

## Viewer and editing

```bash
npx whatijustdid preview
npx whatijustdid preview --port 4173
npx whatijustdid build
npx whatijustdid edit <commit-sha-or-prefix>
npx whatijustdid clear --yes
```

`preview` serves the bundled viewer with live reload. `edit` changes a private SQLite summary. `clear --yes` permanently removes every local summary and rebuilds the viewer; it does not change Git history or the shared configuration.

## Configuration

The tracked `whatijustdid.json` contains safe shared defaults:

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

Put personal overrides in Git-private `.git/whatijustdid/whatijustdid.local.json`. Environment variables take precedence:

- `WHATIJUSTDID_AGENT`
- `WHATIJUSTDID_DB_PATH` for an advanced local database-path override

### Credentials

Each agent normally reads its provider's standard env var (`OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, `ANTHROPIC_API_KEY`). To avoid tracking which name goes with which agent, you can instead set one generic `WHATIJUSTDID_AGENT_API_KEY` — it's used as the key for whichever agent is currently configured, and it takes precedence if both are set.

Any of these can also live in a `.env` file at the repository root instead of your shell profile; it's loaded automatically and is gitignored by default, so it's never committed. A real exported shell variable still wins over the `.env` value.

```dotenv
# .env (gitignored)
WHATIJUSTDID_AGENT_API_KEY=sk-...
```

Agent-specific variables:

- Codex/OpenAI: `OPENAI_API_KEY` (or `WHATIJUSTDID_AGENT_API_KEY`), optional `OPENAI_BASE_URL`
- DeepSeek: `DEEPSEEK_API_KEY` (or `WHATIJUSTDID_AGENT_API_KEY`), optional `DEEPSEEK_BASE_URL`
- Claude: `ANTHROPIC_API_KEY` (or `WHATIJUSTDID_AGENT_API_KEY`), optional `ANTHROPIC_BASE_URL`
- Llama/Ollama: no key needed, optional `OLLAMA_HOST`

### Supported agents

Set `"agent"` in `whatijustdid.json` (or `WHATIJUSTDID_AGENT`) to one of the values below. `"model": null` uses the listed default; set `"model"` (or `WHATIJUSTDID_MODEL`) to override it.

| Agent | `agent` value | Credential | Default model | Example override |
| --- | --- | --- | --- | --- |
| Codex / OpenAI | `codex` (alias: `openai`) | `OPENAI_API_KEY` or `WHATIJUSTDID_AGENT_API_KEY` | `gpt-5.4-mini` | `"model": "gpt-5.4"` |
| DeepSeek | `deepseek` | `DEEPSEEK_API_KEY` or `WHATIJUSTDID_AGENT_API_KEY` | `deepseek-v4-flash` | `"model": "deepseek-v4"` |
| Claude | `claude` | `ANTHROPIC_API_KEY` or `WHATIJUSTDID_AGENT_API_KEY` | `claude-sonnet-5` | `"model": "claude-opus-4-8"` |
| Llama / Ollama | `llama` | none (runs against local `OLLAMA_HOST`) | `llama3.2` | `"model": "llama3.3"` |

Example `whatijustdid.json` pinned to DeepSeek's larger model:

```json
{
  "agent": "deepseek",
  "model": "deepseek-v4"
}
```
