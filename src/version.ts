// filepath: src/version.ts
// `__VERSION__` is replaced at build time by tsup (see tsup.config.ts).
// During plain `tsx`/`vitest` runs the define is absent, so we fall back to
// "dev" to make that obvious in any output.
declare const __VERSION__: string;

export const VERSION: string = typeof __VERSION__ !== "undefined" ? __VERSION__ : "dev";

/** RFC 7231–compliant User-Agent string used for outbound HTTP requests. */
export const USER_AGENT = `trustdep/${VERSION} (+https://github.com/ali-bingul/trustdep)`;
