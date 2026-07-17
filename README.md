# ctrial

`ctrial` is a zero-dependency Node CLI that records opted-in commits in a Git-owned
changelog and renders them in a standalone HTML viewer.

Each participating commit adds its own JSON row. Parallel branches therefore
add different files instead of competing over one SQLite database, and every
change stays readable in Git and reviewable in a pull request.

Rows are content-addressed and stored in two hash-shard directories, for
example `changelog/db/4a/7f/<id>.json`. Even very large histories avoid a
single directory with millions of files. Viewer builds query only the latest
`limit` row-adding commits, so hook time and generated browser data stay
bounded as the repository grows. Existing flat `changelog/db/*.json` rows are
still read automatically; no migration is required.

## Install

Install the package in the repository that should own the changelog:

```sh
npm install --save-dev ctrial
npx ctrial init
```

`init` is safe to rerun. It:

- creates `changelog/changelog.json`
- creates the dependency-free `changelog/changelog.html` viewer
- creates `changelog/db/.gitkeep`
- ignores only `changelog.data.js` and `changelog.local.json`
- adds its commands to Git hooks while preserving commands already there
- builds the initial viewer data

Commit the package lockfile and the new repository files. Every developer must
run `npm install` and `npx ctrial install` once per clone because Git hooks
are local. A package script makes that easy:

```json
{
  "scripts": {
    "changelog:install": "ctrial install",
    "changelog:build": "ctrial build"
  }
}
```

`ctrial install` is an alias of `ctrial init`. Missing assets are
restored, but existing config and viewer files are preserved. Run
`ctrial init --force` to refresh only the viewer from the bundled template.
Rerunning either command refreshes one marked `ctrial` block in each
hook instead of adding duplicates; everything outside that block stays intact.

## Normal use

Work normally after the hook is installed:

```sh
git add <files>
git commit
```

The pre-commit hook creates and stages one row in the same commit as the code.
The other hooks rebuild the local viewer after a commit, merge, checkout,
rebase, or amend.

Open this file directly in a browser:

```text
changelog/changelog.html
```

No web server, framework, runtime dependency, or network connection is needed.

Put explicit descriptions in the final commit body when desired:

```text
feat: add export

- Added JPEG export
- Fixed progress display
```

Those bullets become the viewer's `(a)`, `(b)` items and override an automatic
summary.

Pulling or merging only rebuilds the viewer from rows already tracked in
`changelog/db`. Ordinary commits from people who have not installed the package
stay invisible. Hooks never backfill them.

## Edit an entry

Copy the row filename without `.json` from anywhere under `changelog/db`, then
run:

```sh
npx ctrial edit <id-or-unique-prefix>
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

Shared config lives at `changelog/changelog.json`:

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

For a custom changelog directory, put the shared config at the repository root
as `changelog.json` and set `dir` there.

`limit` bounds both the recent commits considered by `backfill` and the number
of recent entries compiled into the local viewer. The tracked row store keeps
older history; raise the value when a larger viewer window is useful.

Each developer can choose a provider without modifying tracked config. Create
the ignored `changelog/changelog.local.json`:

```json
{
  "provider": "claude",
  "model": "claude-sonnet-5"
}
```

Environment variables override both files:

```sh
CHANGELOG_PROVIDER=codex CHANGELOG_MODEL=gpt-5.4-mini git commit
```

| Provider | Runtime | Authentication | Package default |
| --- | --- | --- | --- |
| `raw` | Commit message | None | No model |
| `claude` | Anthropic Messages API | `ANTHROPIC_API_KEY` | `claude-sonnet-5` |
| `codex` / `openai` | OpenAI Responses API | `OPENAI_API_KEY` | `gpt-5.4-mini` |
| `llama` | Local Ollama API | None | `llama3.2` |

Optional endpoint overrides are `ANTHROPIC_BASE_URL`, `OPENAI_BASE_URL`, and
`OLLAMA_HOST`.

Cloud providers receive changed filenames and the staged diff, capped by
`maxDiffBytes`. Use `raw` or local `llama` when code must stay on the machine.
Provider failure or timeout falls back to raw commit data and never blocks a
commit.

## Ownership in CI

Run the same range check in pull-request CI after installing dependencies:

```sh
npx --no-install ctrial verify-ownership \
  --base "$BASE_SHA" \
  --head "$HEAD_SHA"
```

Give the job full Git history and make its status required in branch
protection. The verifier checks every commit that added, edited, deleted, or
type-changed a row—not only the final diff.

## Commands

```text
ctrial init       Scaffold files, install hooks, and build viewer data
ctrial install    Alias of init; useful once per clone
ctrial record     Generate and stage a row for staged source changes
ctrial build      Compile recent db/**/*.json rows into changelog.data.js
ctrial backfill   Import + stage recent Git history explicitly
ctrial sync       Backfill, then build
ctrial edit ID    Edit and stage an owned row
ctrial verify-ownership --base SHA --head SHA
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
} from "ctrial";
```

## Package development

```sh
npm test
npm pack --dry-run
```

To test the exact tarball in another repository:

```sh
npm pack
npm install --save-dev ./ctrial-0.1.0.tgz
npx ctrial init
```
