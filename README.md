# whatijustdid

whatijustdid turns committed code diffs into persistent AI summaries — plain-English receipts for AI-built software.

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

## Package

See [`packages/whatijustdid/README.md`](packages/whatijustdid/README.md) for installation, usage, and configuration.
