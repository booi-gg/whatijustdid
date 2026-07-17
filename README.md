# @funroll/changelog

Dependency-free Node CLI that turns commits into a repo-owned changelog:

```text
staged code
  -> pre-commit hook
  -> changelog/db/<unique-id>.json (staged into the same commit)
  -> post-commit/post-merge build
  -> changelog/changelog.data.js
  -> changelog.html opened with file://
```

`changelog/db` is the canonical database. Participating commits add separate
owned rows, so concurrent branches add different files instead of fighting
over one binary SQLite file. `changelog.data.js` is an ignored, rebuildable
browser cache.

## Setup

From this monorepo:

```sh
node packages/changelog/bin/changelog.mjs install
```

Run once per clone, and rerun after hook changes. Installation is idempotent,
preserves existing hook contents, and adds:

- `pre-commit`: generate and stage one DB row
- `post-commit`: rebuild local browser data
- `post-merge`: rebuild after pulling teammates' rows
- `post-checkout`: rebuild after switching branches
- `post-rewrite`: rebuild after rebasing or amending

Open `changelog/changelog.html` in any browser. No server is required.

Pulling or merging only rebuilds the viewer from rows that already exist in
`changelog/db`. It never backfills ordinary commits. A teammate who has not
installed the feature therefore contributes no changelog entry.

## Normal use

Stage and commit code normally:

```sh
git add <files>
git commit
```

The pre-commit hook creates and stages a row in the same commit. Put explicit
change descriptions in the commit body as `-` or `*` bullets when desired;
those bullets become the viewer's `(a)`, `(b)`, `(c)` items.

To correct an existing row, copy its filename (without `.json`) from
`changelog/db` and run:

```sh
node packages/changelog/bin/changelog.mjs edit <id-or-unique-prefix>
```

The command opens `$VISUAL`, then `$EDITOR`, then `vi`. Edit only `type`,
`projects`, and `changes`. Saving updates the browser cache and stages the row;
commit it normally afterward.

An existing row can be changed only when the current Git `user.email` matches
the row creator, source commit author, or source commit committer. The local
pre-commit hook rejects other edits, identity-field changes, and non-regular
row files. The row creator must also match its adding commit. Pull requests get
the same checks—including rows added and edited in one branch—from
`.github/workflows/changelog-ownership.yml`; make the
`Changelog ownership / verify` status check required and restrict direct pushes
to enforce it on the protected branch.

Ownership uses normalized Git email addresses. This is a strong accidental and
cooperative guard, not cryptographic identity: Git metadata can be spoofed. Use
authenticated review rules or a verified-signature policy when hostile-user
enforcement is required.

## Configuration

Shared config lives at `changelog/changelog.config.json`:

```json
{
  "provider": "raw",
  "model": null,
  "dir": "changelog",
  "limit": 200,
  "maxDiffBytes": 80000,
  "timeoutMs": 20000,
  "projects": {
    "web": ["apps/web"],
    "api": ["apps/api"],
    "shared": ["packages/shared"]
  }
}
```

Each developer can choose an AI without changing tracked config. Create the
gitignored `changelog/changelog.local.json`:

```json
{
  "provider": "claude",
  "model": "claude-sonnet-5"
}
```

Environment variables override both config files:

```sh
CHANGELOG_PROVIDER=codex CHANGELOG_MODEL=gpt-5.4-mini git commit
```

Providers:

| Provider | Runtime | Auth | Default model |
| --- | --- | --- | --- |
| `raw` | Commit subject/body after commit | None | None |
| `claude` | Anthropic Messages API | `ANTHROPIC_API_KEY` | `claude-sonnet-5` |
| `codex` / `openai` | OpenAI Responses API | `OPENAI_API_KEY` | `gpt-5.4-mini` |
| `llama` | Local Ollama API | None | `llama3.2` |

Optional endpoint overrides: `ANTHROPIC_BASE_URL`, `OPENAI_BASE_URL`, and
`OLLAMA_HOST`.

Cloud AI providers receive changed filenames plus the staged diff, capped by
`maxDiffBytes`. Keep `raw` or local `llama` selected when code must not leave
the machine. Provider failure or timeout falls back to the commit message; it
does not block the commit.

Human-authored `-`/`*` bullets in the final commit body take precedence over AI
text in the generated viewer. This keeps the explicit `(a)`, `(b)`, `(c)`
description workflow.

## Commands

```text
changelog install    Install/update hooks and build initial browser data
changelog record     Generate + stage a row for current staged changes
changelog build      Compile tracked DB rows into browser data
changelog backfill   Create rows for recent history
changelog sync       Backfill, then build
changelog edit ID    Edit + stage an owned row
changelog verify-ownership --base SHA --head SHA
                     Verify row ownership across a commit range
```

`git commit --no-verify` bypasses `pre-commit`, so it also bypasses automatic
row creation. `backfill` and `sync` are explicit import tools; hooks never run
them. Use `backfill` only when omitted history should intentionally become
visible.

## Package boundary

Everything reusable lives under `packages/changelog`; repo-specific UI, DB,
and config live under `changelog`. The package has no runtime dependencies and
is publishable when registry metadata is added.
