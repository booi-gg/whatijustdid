# whatijustdid viewer

Vite, React, and Tailwind source for the package-owned changelog viewer.

```sh
pnpm --filter @whatijustdid/viewer dev
pnpm --filter @whatijustdid/viewer build
```

Development uses `public/data.js` as sample data. A production build writes
`whatijustdid.html`, `whatijustdid.css`, and `whatijustdid.js` to
`packages/whatijustdid/assets`; the CLI serves those files alongside the
repository's private generated `data.js`.
