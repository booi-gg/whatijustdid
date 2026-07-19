// @ts-check

/** @typedef {import("../src/viewer").ViewerGroup} ViewerGroup */

const viewerWindow =
  /**
   * @type {Window & {
   *   __WHATIJUSTDID_PROJECTS__: string[];
   *   __WHATIJUSTDID__: ViewerGroup[];
   * }}
   */ (/** @type {unknown} */ (window));

viewerWindow.__WHATIJUSTDID_PROJECTS__ = ["viewer", "cli"];
viewerWindow.__WHATIJUSTDID__ = [
  {
    kind: "commit",
    ref: "8f30c21",
    author: "Local preview",
    date: new Date().toISOString(),
    projects: ["viewer"],
    link: "https://github.com/booi-gg/changelog",
    usage: { total: 1840 },
    entries: [
      {
        letter: "(a)",
        tags: ["feat"],
        description:
          "Moved the repository ledger into a Vite-powered React application.",
      },
      {
        letter: "(b)",
        tags: ["style"],
        description:
          "Rebuilt the threaded timeline with Tailwind utilities and the original gold palette.",
      },
    ],
  },
  {
    kind: "commit",
    ref: "34da091",
    author: "Local preview",
    date: new Date(Date.now() - 86_400_000).toISOString(),
    projects: ["cli"],
    entries: [
      {
        letter: "",
        tags: ["fix"],
        description:
          "Kept the CLI preview and live reload flow compatible with the generated bundle.",
      },
    ],
  },
];
