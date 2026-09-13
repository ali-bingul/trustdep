// filepath: tests/version-notice.test.ts
import { describe, test, expect } from "vitest";
import { versionNotice } from "../src/core/check-package.js";

const available = ["1.0.0", "1.2.0", "2.0.0", "4.0.1"];

describe("versionNotice", () => {
  test("warns when a pinned version is not published", () => {
    expect(versionNotice("3.3.6", "4.0.1", available)).toBe(
      "version 3.3.6 is not published; analysed 4.0.1 instead"
    );
  });

  test("stays silent when the pinned version exists", () => {
    expect(versionNotice("1.2.0", "1.2.0", available)).toBeUndefined();
  });

  test("stays silent for ranges", () => {
    expect(versionNotice("^1.0.0", "1.2.0", available)).toBeUndefined();
    expect(versionNotice("~1.2.0", "1.2.0", available)).toBeUndefined();
    expect(versionNotice("1.x", "1.2.0", available)).toBeUndefined();
    expect(versionNotice(">=1.0.0 <2", "1.2.0", available)).toBeUndefined();
  });

  test("stays silent for dist-tags", () => {
    expect(versionNotice("latest", "2.0.0", available)).toBeUndefined();
    expect(versionNotice("beta", "2.0.0", available)).toBeUndefined();
  });

  test("stays silent when nothing was requested", () => {
    expect(versionNotice(undefined, "2.0.0", available)).toBeUndefined();
  });

  test("warns for an unpublished prerelease pin", () => {
    expect(versionNotice("2.0.0-rc.1", "2.0.0", available)).toBe(
      "version 2.0.0-rc.1 is not published; analysed 2.0.0 instead"
    );
  });

  test("recognises a published prerelease", () => {
    expect(versionNotice("2.0.0-rc.1", "2.0.0-rc.1", [...available, "2.0.0-rc.1"])).toBeUndefined();
  });
});
