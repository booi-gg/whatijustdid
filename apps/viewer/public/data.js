// @ts-check

/** @typedef {import("../src/viewer/model").ViewerGroup} ViewerGroup */

const viewerWindow =
  /**
   * @type {Window & {
   *   __WHATIJUSTDID_PROJECT_NAME__: string;
   *   __WHATIJUSTDID_META__: { databaseSizeBytes: number };
   *   __WHATIJUSTDID_PROJECTS__: string[];
   *   __WHATIJUSTDID__: ViewerGroup[];
   * }}
   */ (/** @type {unknown} */ (window));

viewerWindow.__WHATIJUSTDID_PROJECT_NAME__ = "Miso Katsu";
viewerWindow.__WHATIJUSTDID_META__ = { databaseSizeBytes: 36_864 };
viewerWindow.__WHATIJUSTDID_PROJECTS__ = ["viewer", "cli"];
viewerWindow.__WHATIJUSTDID__ = [
  {
    kind: "commit",
    sha: "8f30c218f30c218f30c218f30c218f30c218f30c",
    ref: "8f30c21",
    author: "Local preview",
    date: new Date().toISOString(),
    status: "ready",
    projects: ["viewer"],
    link: "https://github.com/booi-gg/changelog",
    usage: { total: 1840 },
    stats: {
      additions: 118,
      deletions: 34,
      filesChanged: 5,
      linesChanged: 152,
    },
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
    sha: "34da09134da09134da09134da09134da09134da0",
    ref: "34da091",
    author: "Local preview",
    date: new Date(Date.now() - 86_400_000).toISOString(),
    status: "ready",
    projects: ["cli"],
    stats: { additions: 21, deletions: 8, filesChanged: 3, linesChanged: 29 },
    entries: [
      {
        letter: "",
        tags: ["fix"],
        description:
          "Kept the CLI preview and live reload flow compatible with the generated bundle.",
      },
    ],
  },
  {
    kind: "commit",
    sha: "7ab20de7ab20de7ab20de7ab20de7ab20de7ab20",
    ref: "7ab20de",
    author: "Local preview",
    date: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    status: "missing",
    projects: ["viewer"],
    stats: { additions: 54, deletions: 17, filesChanged: 4, linesChanged: 71 },
    generation: {
      agent: "codex",
      model: "gpt-5.4-mini",
      estimatedInputTokens: 1268,
      maxOutputTokens: 1200,
    },
    entries: [{ letter: "(!)", tags: ["other"], description: "N/A" }],
  },
];
