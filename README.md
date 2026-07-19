# whatijustdid

whatijustdid turns committed code diffs into persistent AI summaries — plain-English receipts for AI-built software.

## Use the app

Export your AI credential first, then install and initialize whatijustdid inside a Git repository:

```bash
export WHATIJUSTDID_AGENT_API_KEY=sk-...
npm install --save-dev whatijustdid
npx whatijustdid init
```

`init` gives the project an AI-generated dish name (with a bundled fallback), saves it as `projectName` in `whatijustdid.json`, installs the commit hooks, and opens the HTML changelog. Commit normally, or reopen the viewer later with `npx whatijustdid preview`.

See the [package guide](packages/whatijustdid/README.md) for provider-specific environment variables, configuration, backfills, and AI-generated commit messages.

## Structure

```
packages/whatijustdid/   CLI and core library (npm package)
apps/web/                Marketing site (Next.js)
```

## Quick start

Requires Node.js >= 22.13 and pnpm 9.15.

```bash
pnpm install
pnpm run build
pnpm run test
```

## Scripts

| Command | Description |
| --- | --- |
| `pnpm run build` | Build all packages |
| `pnpm run dev` | Start all dev servers |
| `pnpm run test` | Run all tests |
| `pnpm run lint` | Lint all packages |
| `pnpm run format` | Format with Prettier |
