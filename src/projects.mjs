/**
 * Map changed paths → project names using the config's path-prefix map.
 * A commit can touch several projects; each matched project is returned once.
 * No match → empty array (the viewer files these under "Repo").
 */
export function projectsForFiles(files, projectMap) {
  const hit = new Set();
  for (const file of files) {
    for (const [name, prefixes] of Object.entries(projectMap)) {
      if (prefixes.some((p) => file === p || file.startsWith(p.endsWith("/") ? p : p + "/"))) {
        hit.add(name);
      }
    }
  }
  return [...hit];
}
