import { CHANGE_TYPES } from "./shared.mjs";

export const KNOWN_TYPES = CHANGE_TYPES.filter((type) => type !== "other");

/** Parse a conventional-commit subject: "feat(scope): summary" → { type, title }. */
export function parseSubject(subject) {
  const m = subject.match(/^(\w+)(?:\([^)]*\))?!?:\s*(.+)$/);
  if (m && KNOWN_TYPES.includes(m[1].toLowerCase())) {
    return { type: m[1].toLowerCase(), title: m[2].trim() };
  }
  return { type: "other", title: subject.trim() };
}

/** Bullet lines from a commit body: "- did a thing" → "did a thing". */
export function bulletLines(body) {
  return body
    .split("\n")
    .map((l) => l.match(/^\s*[-*]\s+(.+)$/))
    .filter(Boolean)
    .map((m) => m[1].trim());
}

/**
 * No-AI provider. The changelog IS the commit message.
 * subject → entry type + first change; body bullets → additional changes.
 */
export async function describe({ subject, body }) {
  const { type, title } = parseSubject(subject ?? "");
  const bullets = bulletLines(body ?? "");
  const changes = bullets.length
    ? bullets.map((summary) => ({ type, summary }))
    : title
      ? [{ type, summary: title }]
      : [];
  return { type, changes };
}
