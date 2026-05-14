// filepath: tests/parse-lock.test.ts
import { describe, it, expect } from "vitest";
import { parseLockFile, parseNpmLock, parseYarnLock, parsePnpmLock } from "../src/lock/parse-lock.js";

describe("parseNpmLock v3", () => {
  it("extracts packages from flat node_modules tree", () => {
    const content = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { name: "root" },
        "node_modules/lodash": { version: "4.17.21" },
        "node_modules/@scope/foo": { version: "1.2.3" },
        "node_modules/express/node_modules/qs": { version: "6.5.0" },
      },
    });
    const map = parseNpmLock(content);
    expect(map.get("lodash")).toBe("4.17.21");
    expect(map.get("@scope/foo")).toBe("1.2.3");
    expect(map.get("qs")).toBe("6.5.0");
  });
});

describe("parseNpmLock v1", () => {
  it("walks the recursive dependencies tree", () => {
    const content = JSON.stringify({
      lockfileVersion: 1,
      dependencies: {
        lodash: { version: "4.17.21" },
        express: {
          version: "4.18.0",
          dependencies: {
            qs: { version: "6.5.0" },
          },
        },
      },
    });
    const map = parseNpmLock(content);
    expect(map.get("lodash")).toBe("4.17.21");
    expect(map.get("express")).toBe("4.18.0");
    expect(map.get("qs")).toBe("6.5.0");
  });
});

describe("parseNpmLock v2 prefers packages over dependencies", () => {
  it("uses flat packages when present", () => {
    const content = JSON.stringify({
      lockfileVersion: 2,
      packages: { "node_modules/foo": { version: "2.0.0" } },
      dependencies: { foo: { version: "1.0.0" } },
    });
    expect(parseNpmLock(content).get("foo")).toBe("2.0.0");
  });
});

describe("parseYarnLock", () => {
  it("parses yarn 1 classic format", () => {
    const content = `# yarn lockfile v1


"lodash@^4.17.0":
  version "4.17.21"
  resolved "https://registry.yarnpkg.com/lodash/-/lodash-4.17.21.tgz#..."

"@scope/foo@~1.0.0", "@scope/foo@^1.0.0":
  version "1.0.5"
  resolved "..."
`;
    const map = parseYarnLock(content);
    expect(map.get("lodash")).toBe("4.17.21");
    expect(map.get("@scope/foo")).toBe("1.0.5");
  });
});

describe("parsePnpmLock", () => {
  it("parses both old and new pnpm key formats", () => {
    const content = `lockfileVersion: '6.0'

packages:

  /lodash/4.17.21:
    resolution: {integrity: sha512-foo}

  /@scope/foo/1.2.3:
    resolution: {integrity: sha512-bar}

  /react@18.2.0:
    resolution: {integrity: sha512-baz}

  /@types/node@20.0.0:
    resolution: {integrity: sha512-qux}
`;
    const map = parsePnpmLock(content);
    expect(map.get("lodash")).toBe("4.17.21");
    expect(map.get("@scope/foo")).toBe("1.2.3");
    expect(map.get("react")).toBe("18.2.0");
    expect(map.get("@types/node")).toBe("20.0.0");
  });
});

describe("parseLockFile dispatcher", () => {
  it("routes by file basename", () => {
    const npm = parseLockFile(
      "/path/package-lock.json",
      JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/x": { version: "1.0.0" } } })
    );
    expect(npm.get("x")).toBe("1.0.0");

    const yarn = parseLockFile(
      "/path/yarn.lock",
      `"x@^1.0.0":\n  version "1.0.0"\n`
    );
    expect(yarn.get("x")).toBe("1.0.0");

    const unknown = parseLockFile("/path/random.lock", "garbage");
    expect(unknown.size).toBe(0);
  });
});
