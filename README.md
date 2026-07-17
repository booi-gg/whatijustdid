# changetrail

`changetrail` is a zero-dependency Node CLI that records opted-in commits in a Git-owned
changelog and renders them with a bundled HTML viewer.

Each participating commit adds its own JSON row. Parallel branches therefore
add different files instead of competing over one SQLite database, and every
change stays readable in Git and reviewable in a pull request.

Rows are content-addressed and stored in two hash-shard directories, for
example `changetrail/db/4a/7f/<id>.json`. Even very large histories avoid a
single directory with millions of files. Viewer builds query only the latest
`limit` row-adding commits, so hook time and generated browser data stay
bounded as the repository grows. Existing flat `changetrail/db/*.json` rows are
still read automatically; no migration is required.

## Install

Install the package in the repository that should own the changelog:

```sh
npm install --save-dev changetrail
npx changetrail init
```

`init` is safe to rerun. It:

- creates `changetrail.json`
- creates `changetrail/db/.gitkeep`
- ignores the generated `data.js`, legacy viewer copies, and `changetrail.local.json`
- adds its commands to Git hooks while preserving commands already there
- builds the initial viewer data

Commit the package lockfile and the new repository files. Every developer must
run `npm install` and `npx changetrail install` once per clone because Git hooks
are local. A package script makes that easy:

```json
{
  "scripts": {
    "changelog:install": "changetrail install",
    "changelog:build": "changetrail build"
  }
}
```

`changetrail install` is an alias of `changetrail init`. The HTML/CSS template
stays in the installed package at `node_modules/changetrail/assets/changetrail.html`;
it is not copied into the consumer repository. Rerunning either command refreshes
one marked `changetrail` block in each hook instead of adding duplicates;
everything outside that block stays intact.

To detach Changetrail from the repository's local Git hooks, run:

```sh
npx changetrail unhook
```

`unhook` removes only Changetrail's marked blocks. It preserves unrelated hook
commands and leaves the package, configuration, tracked rows, and generated
viewer data in place. Run `npx changetrail install` to attach the hooks again.
Git hooks are clone-local and normally shared by linked worktrees, so unhooking
one worktree also unhooks the others in that clone.

## Normal use

Work normally after the hook is installed:

```sh
git add <files>
git commit
```

The pre-commit hook creates and stages one row in the same commit as the code.
The other hooks rebuild the local viewer data after a commit, merge, checkout,
rebase, or amend.

Open the bundled viewer with live reload:

```sh
npx changetrail preview
```

Pass `--port 4000` to choose a port or `--no-open` to start the preview without
opening a browser. The server is local and needs no framework or network
connection.

The merge-safe source data in `changetrail/db/**/*.json` stays tracked in Git.
`changetrail/data.js` is only a rebuildable browser cache and remains ignored.
Repositories that tracked a viewer created by an older release can remove that
copy once with `git rm changetrail/changetrail.html`.

Put explicit descriptions in the final commit body when desired:

```text
feat: add export

- Added JPEG export
- Fixed progress display
```

Those bullets become the viewer's `(a)`, `(b)` items and override an automatic
summary.

Pulling or merging only rebuilds viewer data from rows already tracked in
`changetrail/db`. Ordinary commits from people who have not installed the package
stay invisible. Hooks never backfill them.

## Edit an entry

Copy the row filename without `.json` from anywhere under `changetrail/db`, then
run:

```sh
npx changetrail edit <id-or-unique-prefix>
```

The command opens `$VISUAL`, then `$EDITOR`, then `vi`. Only `type`, `projects`,
and `changes` are editable. Saving rebuilds the viewer and stages the row; make
a normal commit afterward.

An entry can be changed only when the current Git `user.email` matches its
creator, source commit author, or source commit committer. The local pre-commit
gate also rejects identity-field changes and non-regular row files.

Git email ownership prevents accidental or cooperative unauthorized edits; it
is not cryptographic identity. Protect the main branch and require the CI check
when hostile-user enforcement matters.

## Configuration

Shared, tracked config lives at `changetrail.json` in the repository root.
`changetrail init` creates this file when it is missing and preserves it on
later runs, so teams can review configuration changes in Git.

```json
{
  "provider": "openai",
  "model": "gpt-5.4-mini",
  "dir": "changetrail",
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

| Setting | Description | Default |
| --- | --- | --- |
| `provider` | Generates change summaries. Supported values are `raw`, `claude`, `codex`/`openai`, and `llama`. | `openai` |
| `model` | Overrides the selected provider's model. Use `null` to accept the provider default. | `gpt-5.4-mini` |
| `dir` | Repository-relative directory for the row database, generated data, and local config. | `changetrail` |
| `limit` | Maximum recent row-adding commits considered by `backfill` and entries compiled into the viewer. | `200` |
| `maxDiffBytes` | Maximum diff bytes supplied to a summary provider for each change. | `80000` |
| `timeoutMs` | Provider request timeout in milliseconds before falling back to raw commit data. | `20000` |
| `projects` | Maps viewer project names to repository path prefixes; a change can match more than one project. | `{}` |

With the default `dir`, tracked rows live under `changetrail/db` and generated
viewer data is written to `changetrail/data.js`. Set `dir` to a different
repository-relative path to move those files. The viewer template always comes
from the installed package. Files that match no `projects` prefix appear under
`Repo` in the viewer.

`limit` bounds both the recent commits considered by `backfill` and the number
of recent entries compiled into the local viewer. The tracked row store keeps
older history; raise the value when a larger viewer window is useful.

Each developer can override shared values without modifying tracked config.
Create the ignored `changetrail/changetrail.local.json`:

```json
{
  "provider": "claude",
  "model": "claude-sonnet-5"
}
```

Environment variables override both files. `CHANGELOG_PROVIDER` selects the
provider, `CHANGELOG_MODEL` selects its model, and `CHANGELOG_DIR` overrides the
asset directory. Changing only the provider uses that provider's package-default
model:

```sh
CHANGELOG_PROVIDER=codex CHANGELOG_MODEL=gpt-5.4-mini git commit
```

| Provider | Runtime | Authentication | Package default |
| --- | --- | --- | --- |
| `raw` | Commit message | None | No model |
| `claude` | Anthropic Messages API | `ANTHROPIC_API_KEY` | `claude-sonnet-5` |
| `codex` / `openai` | OpenAI Responses API | `OPENAI_API_KEY` | `gpt-5.4-mini` |
| `llama` | Local Ollama API | None | `llama3.2` |

The OpenAI provider works with Responses API models that support structured
outputs. Useful choices include:

| Model | Best fit |
| --- | --- |
| `gpt-5.4-mini` | Default; strong quality, speed, and cost balance for frequent changelog summaries. |
| `gpt-5.4-nano` | Lowest-cost option for simple, high-volume summaries. |
| `gpt-5-mini` | Established low-cost option for well-defined prompts. |
| `gpt-5.4` | Higher-quality option for larger or more complex diffs. |
| `gpt-5.3-codex` | Coding-specialized option for repositories with complex implementation changes. |

Model availability depends on the OpenAI API account and region. ChatGPT or
Codex subscriptions do not provide API access; these models use
`OPENAI_API_KEY` billing.

Optional endpoint overrides are `ANTHROPIC_BASE_URL`, `OPENAI_BASE_URL`, and
`OLLAMA_HOST`.

Cloud providers receive changed filenames and the staged diff, capped by
`maxDiffBytes`. Use `raw` or local `llama` when code must stay on the machine.
Provider failure or timeout falls back to raw commit data and never blocks a
commit.

## Ownership in CI

Run the same range check in pull-request CI after installing dependencies:

```sh
npx --no-install changetrail verify-ownership \
  --base "$BASE_SHA" \
  --head "$HEAD_SHA"
```

Give the job full Git history and make its status required in branch
protection. The verifier checks every commit that added, edited, deleted, or
type-changed a row—not only the final diff.

## Commands

```text
changetrail init       Scaffold files, install hooks, and build viewer data
changetrail install    Alias of init; useful once per clone
changetrail unhook     Remove Changetrail from local Git hooks
changetrail record     Generate and stage a row for staged source changes
changetrail build      Compile recent db/**/*.json rows into data.js
changetrail backfill   Import + stage recent Git history explicitly
changetrail sync       Backfill, then build
changetrail edit ID    Edit and stage an owned row
changetrail preview    Open the viewer with live reload
changetrail verify-ownership --base SHA --head SHA
                   Verify ownership across a commit range
```

`git commit --no-verify` bypasses `pre-commit`, so it also opts that commit out
of the changelog. Use `backfill` or `sync` only when omitted history should be
imported intentionally.

## Programmatic API

The package is ESM and requires Node 20 or newer:

```js
import {
  build,
  initializeProject,
  loadConfig,
  recordStagedChange,
} from "changetrail";
```

## Package development

```sh
npm test
npm pack --dry-run
```

To test the exact tarball in another repository:

```sh
npm pack
npm install --save-dev ./changetrail-0.1.0.tgz
npx changetrail init
```
