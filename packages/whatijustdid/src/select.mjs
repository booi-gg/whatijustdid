import { emitKeypressEvents } from "node:readline";
import pc from "picocolors";

/**
 * Arrow-key select prompt: ↑/↓ (or j/k) to move, Enter to choose. Letter
 * shortcuts in `keys` choose immediately. Esc, q, Ctrl+C, or closed input
 * resolve with the last option's value, so list the cancel option last.
 */
export function selectOption(question, options, streams = {}) {
  const input = streams.input ?? process.stdin;
  const output = streams.output ?? process.stdout;

  return new Promise((resolve) => {
    let index = 0;
    let lines = 0;

    const render = () => {
      if (lines) output.write(`\x1b[${lines}A`);
      const rows = [
        question,
        ...options.map((option, i) =>
          i === index
            ? pc.cyan(`  ❯ ${pc.bold(option.label)}`)
            : pc.dim(`    ${option.label}`),
        ),
      ];
      output.write(`${rows.map((row) => `\x1b[2K${row}`).join("\n")}\n`);
      lines = rows.length;
    };

    const done = (option) => {
      input.off("keypress", onKeypress);
      input.off("end", onEnd);
      if (input.isTTY) input.setRawMode(false);
      input.pause();
      // Collapse the menu into a single answered line.
      if (lines) output.write(`\x1b[${lines}A`);
      output.write(`\x1b[0J${question} ${pc.cyan(option.label)}\n`);
      output.write("\x1b[?25h");
      resolve(option.value);
    };

    const onEnd = () => done(options.at(-1));

    const onKeypress = (str, key = {}) => {
      if (key.name === "up" || key.name === "k") {
        index = (index + options.length - 1) % options.length;
      } else if (key.name === "down" || key.name === "j" || key.name === "tab") {
        index = (index + 1) % options.length;
      } else if (key.name === "return" || key.name === "enter") {
        return done(options[index]);
      } else if (
        key.name === "escape" ||
        key.name === "q" ||
        (key.ctrl && key.name === "c")
      ) {
        return done(options.at(-1));
      } else {
        const hot = options.find((option) =>
          option.keys?.includes(str?.toLowerCase()),
        );
        if (hot) return done(hot);
      }
      render();
    };

    emitKeypressEvents(input);
    if (input.isTTY) input.setRawMode(true);
    input.resume();
    output.write("\x1b[?25l");
    input.on("keypress", onKeypress);
    input.on("end", onEnd);
    render();
  });
}
