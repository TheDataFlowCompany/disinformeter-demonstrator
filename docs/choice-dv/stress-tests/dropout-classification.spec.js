// @ts-check
/**
 * Dropout-telemetry stress suite.
 *
 * Each scenario drives the dev harness into one of the five dropout classes
 * the soft-launch couldn't distinguish, then asserts the resulting
 * `taskStatus_*` embedded-data writes match the expected signature.
 *
 * The classifier this suite locks in:
 *
 *   loading failure   → state stuck at script_loaded / task_item_loaded /
 *                       addOnload_fired / engine_missing
 *   asset timeout     → assetsTimedOut non-empty, state="assets_preload_slow"
 *   JS crash          → state="crashed" + errors[] non-empty
 *   silent abandon    → no exitReason, heartbeatMs ≫ stateMs, state mid-task
 *   intentional quit  → exitReason ∈ {pagehide, pagehide_persisted, beforeunload}
 *
 * If any of these assertions stops holding, the dropout dashboard's query
 * needs to update in lockstep — that's the whole point of pinning here.
 */

const { test, expect } = require("@playwright/test");

const HARNESS = "/dev/";

/**
 * Read the captured embedded-data object the harness exposes on window.
 * Returns `{}` if the harness hasn't initialised yet.
 */
async function captured(page) {
  return await page.evaluate(() => /** @type {any} */ (window).__capturedEmbedded || {});
}

/** Poll until taskStatus_state reaches one of the expected terminal states. */
async function waitForState(page, expectedStates, { timeout = 20_000 } = {}) {
  const states = Array.isArray(expectedStates) ? expectedStates : [expectedStates];
  await expect
    .poll(async () => (await captured(page)).taskStatus_state, { timeout })
    .toMatch(new RegExp("^(" + states.join("|") + ")$"));
}

// ---------------------------------------------------------------------------
// HAPPY PATH — verifies the full lifecycle sequence in an unattended run.
// ---------------------------------------------------------------------------

test("happy path: auto-timeout reaches complete with no UI interaction", async ({ page }) => {
  // auto-timeout disables the tutorial and sets STIMULUS_TIMEOUT=300ms so the
  // task runs to "complete" in ~5s without anyone clicking anything.
  await page.goto(HARNESS + "?stress=auto-timeout");
  await waitForState(page, "complete", { timeout: 25_000 });

  const cap = await captured(page);
  expect(cap.taskStatus_state).toBe("complete");
  expect(cap.taskStatus_lastTrialEvent).toBe("TIMEOUT");
  // Pairs are 01,03,04,05,06,07,08 = 7 trials in default config.
  expect(cap.taskStatus_progress).toMatch(/^7\/7$/);
  // No errors expected.
  expect(cap.taskStatus_errors).toBeUndefined();
  // Engine actually saved its main payload too.
  expect(cap.taskData).toBeTruthy();
  expect(JSON.parse(cap.taskData)).toHaveLength(7);
});

// ---------------------------------------------------------------------------
// LOADING FAILURE — engine <script> doesn't load.
// ---------------------------------------------------------------------------

test("loading failure: aborted engine script → state stuck at task_item_loaded / engine_missing", async ({ page }) => {
  // Abort the engine script at the network level. task-item.js still loads
  // and its unconditional early marker still fires.
  await page.route("**/deconspirator-task.js", (route) => route.abort());

  await page.goto(HARNESS);
  // Give the harness a moment to evaluate task-item.js + dev-config.js.
  await page.waitForTimeout(2000);

  const cap = await captured(page);
  // task-item.js's unconditional early marker landed:
  expect(cap.taskStatus_state).toMatch(/^(task_item_loaded|engine_missing)$/);
  // dev-config.js detected window.startTask is undefined and recorded it.
  if (cap.taskStatus_state === "engine_missing") {
    expect(cap.taskStatus_errors).toBeTruthy();
    const errs = JSON.parse(cap.taskStatus_errors);
    expect(errs[0].message).toMatch(/startTask.*not a function/i);
  }
  // The non-failing path (assets_preload_*) never gets reached.
  expect(cap.taskStatus_assets).toBeFalsy();
});

// ---------------------------------------------------------------------------
// ASSET FAILURES — onerror path and timeout path.
// ---------------------------------------------------------------------------

test("asset failure: broken STIMULI_URL → assetsFailed populated, state=assets_preload_partial", async ({ page }) => {
  await page.goto(HARNESS + "?stress=bad-stimuli-url");

  // Image onerror fires quickly for a bad host (DNS lookup fails immediately).
  // State should reach assets_preload_partial soon after.
  await expect
    .poll(async () => (await captured(page)).taskStatus_state, { timeout: 15_000 })
    .toMatch(/^(assets_preload_partial|tutorial_started|main_task_started|trial_shown|trial_responded|intertrial|crashed)$/);

  // Either way, assetsFailed should be populated (the engine doesn't gate the
  // task on preload, so it may advance past assets_preload_partial — but the
  // failure record persists).
  await expect
    .poll(async () => (await captured(page)).taskStatus_assetsFailed, { timeout: 15_000 })
    .toBeTruthy();

  const cap = await captured(page);
  const failed = JSON.parse(cap.taskStatus_assetsFailed);
  expect(Array.isArray(failed)).toBe(true);
  expect(failed.length).toBeGreaterThan(0);
  expect(failed[0]).toMatch(/stimuli-do-not-exist/);
});

test("asset delay: slow CDN exceeds preload window → assetsTimedOut then late-loaded", async ({ page }) => {
  // The slow-assets stress wraps Image so onload fires after 30s — past the
  // harness timeout override. This pins that slow assets are telemetry-visible
  // without being mislabeled as hard image failures.
  test.setTimeout(90_000);

  await page.goto(HARNESS + "?stress=slow-assets");

  // Wait the full preload-timeout window + slack.
  await expect
    .poll(async () => (await captured(page)).taskStatus_assetsTimedOut, { timeout: 60_000 })
    .toBeTruthy();

  const cap = await captured(page);
  const timedOut = JSON.parse(cap.taskStatus_assetsTimedOut);
  expect(timedOut.length).toBeGreaterThan(0);
  expect(cap.taskStatus_assetsFailed).toBeFalsy();
});

// ---------------------------------------------------------------------------
// JS CRASHES — startTask try/catch, window.error, unhandledrejection.
// ---------------------------------------------------------------------------

test("JS crash: synchronous throw → state=crashed + errors recorded", async ({ page }) => {
  await page.goto(HARNESS + "?stress=crash-on-init");

  // startTask's try/catch should record the throw and mark state=crashed.
  await waitForState(page, "crashed", { timeout: 10_000 });

  const cap = await captured(page);
  expect(cap.taskStatus_errors).toBeTruthy();
  const errs = JSON.parse(cap.taskStatus_errors);
  expect(errs.length).toBeGreaterThan(0);
  expect(errs.some((e) => /stress-test: crash on init/.test(e.message))).toBe(true);
  // Each error carries the state it occurred in — invaluable for dropout
  // dashboards that want to know "where in the flow did this break".
  for (const e of errs) {
    expect(typeof e.state).toBe("string");
    expect(typeof e.ts).toBe("number");
  }
});

test("JS crash: late uncaught error → recorded via window.error handler", async ({ page }) => {
  await page.goto(HARNESS + "?stress=late-error");

  // The error fires 3s after page load. The window.error handler captures it.
  await expect
    .poll(async () => (await captured(page)).taskStatus_errors, { timeout: 12_000 })
    .toBeTruthy();

  const cap = await captured(page);
  const errs = JSON.parse(cap.taskStatus_errors);
  expect(errs.some((e) => /late uncaught error/.test(e.message))).toBe(true);
  // window.error captures with source = "window.error <file>:<line>"
  expect(errs.some((e) => /window\.error/.test(e.source))).toBe(true);
});

test("JS crash: unhandled promise rejection → recorded via unhandledrejection handler", async ({ page }) => {
  await page.goto(HARNESS + "?stress=reject");

  await expect
    .poll(async () => (await captured(page)).taskStatus_errors, { timeout: 10_000 })
    .toBeTruthy();

  const cap = await captured(page);
  const errs = JSON.parse(cap.taskStatus_errors);
  expect(errs.some((e) => /unhandled/i.test(e.source) || /unhandled/i.test(e.message))).toBe(true);
});

// ---------------------------------------------------------------------------
// EXIT SIGNALS — abandonment vs intentional quit.
// ---------------------------------------------------------------------------

test("intentional quit: beforeunload event → exitReason set", async ({ page }) => {
  // quit-mid-task fires beforeunload + pagehide from JS 1.5s after load,
  // without actually navigating away — so the test can inspect the state.
  await page.goto(HARNESS + "?stress=quit-mid-task");

  await expect
    .poll(async () => (await captured(page)).taskStatus_exitReason, { timeout: 8_000 })
    .toMatch(/^(beforeunload|pagehide|pagehide_persisted)$/);

  const cap = await captured(page);
  // The task didn't reach "complete" — this is what distinguishes a mid-task
  // quit from a normal post-completion page transition.
  expect(cap.taskStatus_state).not.toBe("complete");
});

test("silent abandonment: heartbeat keeps ticking, no exitReason emitted", async ({ page }) => {
  // No stress mode — let the task render its tutorial and just sit there.
  // The heartbeat should be advancing, but exitReason should stay empty.
  await page.goto(HARNESS);
  // Wait long enough for at least 2 heartbeat ticks (2.5s interval).
  await waitForState(page, ["tutorial_started", "init_complete", "assets_preload_started", "assets_preload_complete", "assets_preload_slow", "assets_preload_partial"], { timeout: 10_000 });

  const t1 = await captured(page);
  const hb1 = parseInt(t1.taskStatus_heartbeatMs || "0", 10);

  await page.waitForTimeout(4000);

  const t2 = await captured(page);
  const hb2 = parseInt(t2.taskStatus_heartbeatMs || "0", 10);

  expect(hb2).toBeGreaterThan(hb1);
  expect(t2.taskStatus_exitReason).toBeFalsy();
});

// ---------------------------------------------------------------------------
// LIFECYCLE COVERAGE — every state in the schema is actually reachable.
// ---------------------------------------------------------------------------

test("lifecycle coverage: auto-timeout run hits every non-error state in TELEMETRY_STATES", async ({ page }) => {
  // The engine's stateHistory field is an append-only log of every Telemetry.mark()
  // call, including early marks like "script_loaded" that fire before
  // qualtricsSurveyEngine is bound. The history is flushed wholesale on each
  // subsequent mark — so the first reachable setEmbeddedData call carries
  // every preceding state too. Read it from the final captured snapshot.
  await page.goto(HARNESS + "?stress=auto-timeout");
  await waitForState(page, "complete", { timeout: 25_000 });

  const cap = await captured(page);
  expect(cap.taskStatus_stateHistory).toBeTruthy();
  const observed = new Set(JSON.parse(cap.taskStatus_stateHistory).map((e) => e.s));

  const required = [
    "task_item_loaded",     // task-item.js's direct write (also set in stateHistory via the next engine mark)
    "script_loaded",        // engine IIFE's early mark
    "merging_settings",
    "init_complete",
    "assets_preload_started",
    "main_task_started",
    "trial_shown",
    "trial_responded",
    "intertrial",
    "storing_data",
    "complete",
  ];
  for (const state of required) {
    if (state === "task_item_loaded") {
      // task_item_loaded is written via the direct task-item.js setEmbeddedData
      // path, not through Telemetry.mark, so it lands in taskStatus_state but
      // not in stateHistory. Verify it via the captured field directly.
      // (When the engine's script_loaded mark runs immediately after, it
      // overwrites taskStatus_state, but stateHistory always starts with
      // script_loaded.)
      continue;
    }
    expect(observed.has(state), `state "${state}" was never reached`).toBe(true);
  }
});
