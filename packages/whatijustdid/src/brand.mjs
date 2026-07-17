import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(readFileSync(join(PACKAGE_DIR, "package.json"), "utf8"));

const name = Object.keys(manifest.bin)[0] ?? manifest.name;
if (!name) throw new Error("package.json must have a bin entry or name");

export const CLI_NAME = name;
export const ENV_PREFIX = name.toUpperCase();
export const TITLE_NAME = name.charAt(0).toUpperCase() + name.slice(1);
export const BINARY_PATH = join(PACKAGE_DIR, manifest.bin[name]);
export const VIEWER_FILENAME = `${name}.html`;
export const VIEWER_CSS_FILENAME = `${name}.css`;
export const VIEWER_FILE_PATH = fileURLToPath(new URL(`../assets/${VIEWER_FILENAME}`, import.meta.url));
export const VIEWER_CSS_FILE_PATH = fileURLToPath(new URL(`../assets/${VIEWER_CSS_FILENAME}`, import.meta.url));
export const HOOK_MARKER = `# >>> ${name} >>>`;
export const HOOK_END_MARKER = `# <<< ${name} <<<`;
export const SSE_PATH = `/__${name}_live`;
