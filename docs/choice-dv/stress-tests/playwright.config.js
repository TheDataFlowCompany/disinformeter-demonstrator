// @ts-check
/**
 * Playwright config for the Deconspirator dropout-telemetry stress suite.
 *
 * Run from monorepo root:
 *   npm run stress:deconspirator           # headless
 *   npm run stress:deconspirator:headed    # headed (watch each scenario)
 *
 * The config launches a static file server in the deconspirator/ directory so
 * specs can hit `/dev/?stress=<mode>` without touching the Next.js dev server.
 * Port 8765 is chosen to avoid collision with `npm run dev:tdfc` (3000) and
 * dev:healthflow (3001).
 *
 * Browser node_modules deliberately don't live under public/ — Playwright is
 * a monorepo-root devDependency. From here it's resolved via Node's module
 * walk-up.
 */

const { defineConfig, devices } = require("@playwright/test");
const path = require("path");

const DECONSPIRATOR_ROOT = path.resolve(__dirname, "..");
const PORT = parseInt(process.env.DECON_STRESS_PORT || "8765", 10);

module.exports = defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.js$/,
  // Keep traces / screenshots / videos out of the static-asset tree. Anything
  // under sites/tdfc/public/ would otherwise be served at thedataflowcompany.com
  // and bundled into the Next.js build. Park artefacts at the monorepo root.
  outputDir: path.resolve(__dirname, "../../../../../../.playwright-stress-artifacts"),
  // Stress scenarios include 22s asset-timeout waits; default per-test timeout
  // must accommodate. The fast scenarios still finish in under 10s.
  timeout: 60_000,
  expect: { timeout: 30_000 },
  // Stress tests are deliberately destructive (throw uncaught errors, abort
  // requests) — running them in parallel against one server is fine because
  // each test gets its own browser context, but interleaved stdout makes
  // failures hard to read. Serialise to keep logs intelligible.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: `http://localhost:${PORT}`,
    // Surface engine + telemetry console output in test logs so a failure is
    // immediately diagnosable without re-running headed.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: `python3 -m http.server ${PORT}`,
    cwd: DECONSPIRATOR_ROOT,
    port: PORT,
    timeout: 10_000,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
  },
});
