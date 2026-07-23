const SUMMARY_FIELD = /"summary"\s*:\s*"/gu;

/**
 * Project partial structured JSON into readable changelog summaries.
 * The final JSON is still parsed and validated separately before persistence.
 */
export function createDraftProjector(onDraft) {
  let output = "";
  let previous = [];

  return (delta) => {
    if (typeof delta !== "string" || !delta) return;
    output += delta;
    const changes = extractSummaryDrafts(output);
    if (sameStrings(changes, previous)) return;
    previous = changes;
    onDraft(changes);
  };
}

export function extractSummaryDrafts(output) {
  const summaries = [];
  SUMMARY_FIELD.lastIndex = 0;
  let match;
  while ((match = SUMMARY_FIELD.exec(output)) !== null) {
    const value = readJsonString(output, SUMMARY_FIELD.lastIndex);
    summaries.push(decodeJsonString(value.raw));
    if (!value.complete) break;
    SUMMARY_FIELD.lastIndex = value.end + 1;
  }
  return summaries;
}

function readJsonString(value, start) {
  let escaped = false;
  for (let index = start; index < value.length; index++) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') {
      return {
        complete: true,
        end: index,
        raw: value.slice(start, index),
      };
    }
  }
  return { complete: false, end: value.length, raw: value.slice(start) };
}

function decodeJsonString(value) {
  let decoded = "";
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (character !== "\\") {
      decoded += character;
      continue;
    }

    if (index + 1 >= value.length) break;
    const escape = value[++index];
    if (escape === "u") {
      const code = value.slice(index + 1, index + 5);
      if (!/^[0-9a-f]{4}$/iu.test(code)) break;
      decoded += String.fromCharCode(Number.parseInt(code, 16));
      index += 4;
      continue;
    }

    const escaped = {
      '"': '"',
      "\\": "\\",
      "/": "/",
      b: "\b",
      f: "\f",
      n: "\n",
      r: "\r",
      t: "\t",
    }[escape];
    if (escaped === undefined) break;
    decoded += escaped;
  }
  return decoded;
}

function sameStrings(left, right) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
