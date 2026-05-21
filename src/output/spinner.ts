// filepath: src/output/spinner.ts
// Minimal stderr-based spinner (replaces `ora` dependency).

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const INTERVAL_MS = 80;

export interface Spinner {
  text: string;
  stop(): void;
}

export function createSpinner(initialText: string): Spinner {
  const isTTY = process.stderr.isTTY === true;
  const state = { text: initialText, stopped: false };

  if (!isTTY) {
    // In non-TTY contexts (CI, pipes) just emit the initial line and skip animation.
    process.stderr.write(`${initialText}\n`);
    return {
      get text(): string {
        return state.text;
      },
      set text(value: string) {
        state.text = value;
      },
      stop(): void {
        state.stopped = true;
      },
    };
  }

  let frame = 0;
  const render = (): void => {
    if (state.stopped) return;
    process.stderr.write(`\r${FRAMES[frame]} ${state.text}`);
    frame = (frame + 1) % FRAMES.length;
  };
  render();
  const timer = setInterval(render, INTERVAL_MS);
  // Allow process to exit even if timer is active.
  timer.unref?.();

  return {
    get text(): string {
      return state.text;
    },
    set text(value: string) {
      state.text = value;
    },
    stop(): void {
      if (state.stopped) return;
      state.stopped = true;
      clearInterval(timer);
      // Clear the spinner line.
      process.stderr.write("\r\x1b[2K");
    },
  };
}
