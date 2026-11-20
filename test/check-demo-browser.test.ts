import { describe, it, expect } from "vitest";
// @ts-expect-error .mjs script module
import { launchDemoBrowser } from "../scripts/check-demo-browser.mjs";

describe("scripts/check-demo-browser.mjs Chromium Launch Guard", () => {
  it("launches Playwright Chromium directly without falling back to system chrome channel", async () => {
    const calls: unknown[] = [];
    const fakeBrowser = { close: async () => {} };
    const result = await launchDemoBrowser(async (opts: unknown) => {
      calls.push(opts);
      return fakeBrowser;
    });

    expect(result).toBe(fakeBrowser);
    expect(calls).toEqual([{ headless: true, args: ["--no-sandbox"] }]);
  });

  it("fails non-zero (throws actionable install error) when Playwright Chromium binary is missing", async () => {
    const calls: unknown[] = [];
    const missingErr = new Error(
      "browserType.launch: Executable doesn't exist at /tmp/pw/chrome\nPlease run the following command to download new browsers:\nnpx playwright install"
    );

    await expect(
      launchDemoBrowser(async (opts: unknown) => {
        calls.push(opts);
        throw missingErr;
      })
    ).rejects.toThrow(/npx playwright install chromium/);

    // Must not attempt a second launch with { channel: "chrome" }
    expect(calls).toHaveLength(1);
  });

  it("rethrows non-missing-binary launch failures without masking them", async () => {
    const unexpectedErr = new Error("Failed to spawn browser process");
    await expect(
      launchDemoBrowser(async () => {
        throw unexpectedErr;
      })
    ).rejects.toBe(unexpectedErr);
  });
});
