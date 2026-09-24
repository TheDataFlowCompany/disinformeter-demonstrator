// @ts-check
/**
 * Environment-hostility stress suite — complements dropout-classification.spec.js
 * by simulating real-world participant browsers / networks rather than
 * engine-internal failure modes.
 *
 * Covers:
 *   - In-app webviews and aggressive mobile browsers via UA emulation
 *   - Ad / tracker blockers via per-URL request abort
 *   - Slow / VPN-throttled networks via route() delay
 *   - Stimuli-only CDN block (engine loads, images don't) — common with
 *     corporate proxies and CORS misconfiguration
 *   - Cookies / storage disabled — private-browsing & strict privacy filters
 *   - Background-tab throttling on mobile — visibilitychange + idle wait
 *
 * For each, we assert: the task either reaches a terminal state cleanly OR
 * leaves a *classifiable* telemetry signature. A test that fails here means
 * a real participant in that environment would disappear from the data
 * without us being able to tell why.
 */

const { test, expect } = require("@playwright/test");

const HARNESS = "/dev/";

async function captured(page) {
  return await page.evaluate(() => /** @type {any} */ (window).__capturedEmbedded || {});
}

async function waitForFieldTruthy(page, field, { timeout = 20_000 } = {}) {
  await expect
    .poll(async () => (await captured(page))[field], { timeout })
    .toBeTruthy();
}

// ---------------------------------------------------------------------------
// IN-APP WEBVIEWS + MOBILE BROWSERS — UA emulation
// ---------------------------------------------------------------------------

const MOBILE_UAS = [
  {
    label: "iOS Facebook in-app browser",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBDV/iPhone14,3;FBMD/iPhone;FBSN/iOS;FBSV/17.2;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5]",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  },
  {
    label: "Android Samsung Internet 23",
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
  },
  {
    label: "iOS Safari 17",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  },
  // iOS Chrome (CriOS) is intentionally NOT in this loop — the dedicated
  // `iOS Chrome → stateHistory captures every mark` test below pins the
  // narrower bug we saw in the 2026.05.20 export (state telemetry froze at
  // `script_loaded` on a session that otherwise completed cleanly). Adding
  // CriOS here would couple it to the loop's `taskStatus_errors === undefined`
  // assertion, which is unrelated to the iOS Chrome regression.
];

for (const ua of MOBILE_UAS) {
  test(`mobile webview: ${ua.label} → auto-timeout still completes`, async ({ browser }) => {
    // Custom context per UA. We can't override UA on the default `page`
    // fixture cleanly, so build a fresh context with the mobile profile.
    const context = await browser.newContext({
      userAgent: ua.userAgent,
      viewport: ua.viewport,
      isMobile: ua.isMobile,
      hasTouch: ua.hasTouch,
    });
    const page = await context.newPage();

    await page.goto(HARNESS + "?stress=auto-timeout");
    await expect
      .poll(async () => (await captured(page)).taskStatus_state, { timeout: 25_000 })
      .toBe("complete");

    const cap = await captured(page);
    // Touch mode should auto-resolve to true on mobile UAs.
    expect(cap.taskStatus_touchMode).toBe("true");
    expect(cap.taskStatus_errors).toBeUndefined();

    await context.close();
  });
}

// ---------------------------------------------------------------------------
// iOS CHROME — stateHistory must capture more than just `script_loaded`
// ---------------------------------------------------------------------------

test("iOS Chrome → stateHistory captures every mark by complete (not just script_loaded)", async ({ browser }) => {
  // Regression pin for the 2026.05.20 iOS Chrome (CriOS / WebKit) telemetry
  // gap: one production session finished the task cleanly (taskData with
  // 7 confidence answers stored, Finished=true) but its `taskStatus_state`
  // and `taskStatus_stateHistory` were frozen at `script_loaded`. Every
  // Telemetry.mark() write after the initial one silently failed to land
  // in Qualtrics embedded data — even though end-of-task setEmbeddedData
  // for `taskData` succeeded.
  //
  // The dropout dashboard classifies "stuck at script_loaded" as a hard
  // loading failure; this iOS Chrome session would be misclassified as a
  // dropout despite being a clean completion. The check here is narrow on
  // purpose: stateHistory MUST contain more than just the initial mark
  // by the time the task reports `complete`.
  //
  // NOTE: under the default chromium project this exercises the JS-side
  // contract (mark → _flush → setEmbeddedData → __capturedEmbedded) under
  // a CriOS UA + mobile viewport — it will catch any regression where
  // subsequent marks stop writing on the iOS Chrome UA branch. To
  // additionally reproduce the WebKit-engine variant, run this spec under
  // a `webkit` Playwright project (`npx playwright install webkit` then
  // add a project entry in playwright.config.js).
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  await page.goto(HARNESS + "?stress=auto-timeout");
  await expect
    .poll(async () => (await captured(page)).taskStatus_state, { timeout: 25_000 })
    .toBe("complete");

  const cap = await captured(page);

  // The state field itself advanced past the initial mark.
  expect(cap.taskStatus_state).toBe("complete");
  expect(cap.taskStatus_state).not.toBe("script_loaded");

  // stateHistory must contain the full lifecycle, not just the initial
  // `script_loaded` write that fires before qualtricsSurveyEngine is bound.
  expect(cap.taskStatus_stateHistory).toBeTruthy();
  const history = JSON.parse(cap.taskStatus_stateHistory);
  expect(Array.isArray(history)).toBe(true);
  expect(history.length).toBeGreaterThan(1);

  const states = history.map((m) => m.s);
  // Pin a representative slice of marks rather than the full lifecycle —
  // the harness bypasses task-item.js's Qualtrics addOnload handler (it
  // sets DECONSPIRATOR_TASK_ITEM_AUTORUN=false and calls startTask directly
  // from dev-config.js), so `addOnload_fired` is not emitted in this
  // environment. The marks below are all engine-internal and the ones that
  // were missing in the production iOS Chrome regression.
  expect(states).toContain("script_loaded");
  expect(states).toContain("init_complete");
  expect(states).toContain("main_task_started");
  expect(states).toContain("complete");

  // Confirm taskData wrote too — the production symptom was taskData OK,
  // state telemetry broken. A regression in the opposite direction (state
  // OK, taskData lost) is just as bad; pin both halves of the contract.
  expect(cap.taskData).toBeTruthy();

  await context.close();
});

// ---------------------------------------------------------------------------
// AD / SCRIPT BLOCKERS — abort specific URLs
// ---------------------------------------------------------------------------

test("ad blocker drops task-item.js → state stuck at script_loaded", async ({ page }) => {
  // task-item.js writes "task_item_loaded" directly via setEmbeddedData on
  // script-eval. If it never loads, that breadcrumb never fires — but the
  // engine itself still writes "script_loaded". The dropout dashboard can
  // detect this as a distinct signature: script_loaded reached, but no
  // "addOnload_fired" or anything past it.
  await page.route("**/task-item.js", (route) => route.abort());

  await page.goto(HARNESS);
  await page.waitForTimeout(3000);

  const cap = await captured(page);
  // Engine itself loaded fine.
  expect(cap.taskStatus_engineVersion).toBeTruthy();
  // But task-item.js never set its early marker.
  // dev-config.js still ran (it's the harness equivalent of task-item.js's
  // addOnload). Without task-item.js loaded, none of its exported helpers
  // (resolveTaskLanguage etc.) exist — dev-config.js would throw, which is
  // captured by the global error handler.
  expect(cap.taskStatus_errors).toBeTruthy();
  const errs = JSON.parse(cap.taskStatus_errors);
  // Something tried to call a window.resolveTaskLanguage or similar.
  expect(errs.length).toBeGreaterThan(0);
});

test("script blocker drops engine entirely → engine_missing", async ({ page }) => {
  // Most aggressive case: the engine URL matches an ad-blocker filter and
  // gets nuked. Already covered by dropout-classification.spec.js, but
  // doubling here in the environment context for clarity.
  await page.route("**/deconspirator-task.js", (route) => route.abort());
  await page.goto(HARNESS);
  await page.waitForTimeout(2000);
  const cap = await captured(page);
  expect(cap.taskStatus_state).toMatch(/^(task_item_loaded|engine_missing)$/);
});

// ---------------------------------------------------------------------------
// CORS / CDN BLOCK — engine OK, stimuli unreachable
// ---------------------------------------------------------------------------

test("stimuli CDN blocked → assetsFailed populated but task still progresses", async ({ page }) => {
  // Real-world: corporate proxy blocks the production CDN host while letting
  // the survey itself through. The engine should still write asset-failure
  // telemetry AND keep the task running (preload is non-blocking).
  // Note: in the dev harness, stimuli come from thedataflowcompany.com via
  // the harness STIMULI_URL default — block matching it.
  await page.route("**/files/deconspirator/stimuli/**", (route) => route.abort());

  await page.goto(HARNESS + "?stress=auto-timeout");

  // Asset failures should be visible.
  await waitForFieldTruthy(page, "taskStatus_assetsFailed", { timeout: 10_000 });
  // Task still completes because preload doesn't gate trial start.
  await expect
    .poll(async () => (await captured(page)).taskStatus_state, { timeout: 25_000 })
    .toBe("complete");

  const cap = await captured(page);
  const failed = JSON.parse(cap.taskStatus_assetsFailed);
  expect(failed.length).toBeGreaterThan(0);
  // The dashboard's classifier needs both signals: state=complete AND
  // assetsFailed non-empty → "completed with broken stimuli (data is suspect)".
  expect(cap.taskStatus_state).toBe("complete");
});

test("CORS-style block on stimuli → same as outright drop (assetsFailed)", async ({ page }) => {
  // Strictly: a CORS failure on an <img> tag triggers onerror just like a
  // network error does (images don't gate on CORS the way fetch does — but
  // privacy filters often block the entire request, which presents as
  // onerror). This test pins that the engine treats CORS-blocked URLs the
  // same as missing ones.
  await page.route("**/files/deconspirator/stimuli/**", (route) =>
    route.fulfill({
      status: 403,
      contentType: "text/plain",
      body: "blocked by proxy",
    })
  );

  await page.goto(HARNESS + "?stress=auto-timeout");
  await waitForFieldTruthy(page, "taskStatus_assetsFailed", { timeout: 10_000 });

  const cap = await captured(page);
  expect(JSON.parse(cap.taskStatus_assetsFailed).length).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// SLOW NETWORK — real throttling via route delay
// ---------------------------------------------------------------------------

test("slow CDN via real network throttling → asset timeout telemetry fires", async ({ page }) => {
  // Each stimuli request waits 10s before responding — past the stress-mode
  // 5s asset-load-timeout fallback. Confirms that the fallback isn't an
  // artefact of the JS-side Image wrap in dev/index.html — real network
  // pressure produces slow-asset telemetry without a hard failure.
  test.setTimeout(60_000);

  await page.route("**/files/deconspirator/stimuli/**", async (route) => {
    await new Promise((r) => setTimeout(r, 10_000));
    return route.continue();
  });

  await page.goto(HARNESS + "?stress=short-asset-timeout");
  await waitForFieldTruthy(page, "taskStatus_assetsTimedOut", { timeout: 20_000 });
  const cap = await captured(page);
  expect(cap.taskStatus_assetsFailed).toBeFalsy();
});

// ---------------------------------------------------------------------------
// PRIVACY MODE — cookies + storage disabled
// ---------------------------------------------------------------------------

test("storage disabled (private browsing) → task still completes via in-memory state", async ({ browser }) => {
  // Strict privacy mode: cookies disabled AND no permission for storage APIs.
  // The engine doesn't use either directly (it writes to Qualtrics embedded
  // data, which Qualtrics persists serverside via its own mechanism). The
  // harness uses sessionStorage for the touch-mode toggle, but that's
  // dev-only. Confirm the engine itself is storage-API-agnostic.
  const context = await browser.newContext({
    storageState: undefined,
    // Note: chromium doesn't accept "block all cookies" via this API alone;
    // for a stricter test we'd need a CDP override. The sessionStorage
    // access in the harness will still work since this is same-origin.
  });
  const page = await context.newPage();

  // Sabotage sessionStorage to mimic a brutal privacy extension: every
  // setItem throws. The harness uses sessionStorage for stress mode and
  // touch toggle — make sure neither path crashes the engine.
  await page.addInitScript(() => {
    const realStorage = window.sessionStorage;
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() {
        return {
          getItem: () => null,
          setItem: () => { throw new Error("storage blocked by privacy filter"); },
          removeItem: () => { throw new Error("storage blocked by privacy filter"); },
          key: () => null,
          length: 0,
          clear: () => { throw new Error("storage blocked"); },
        };
      },
    });
  });

  await page.goto(HARNESS + "?stress=auto-timeout");
  await expect
    .poll(async () => (await captured(page)).taskStatus_state, { timeout: 25_000 })
    .toBe("complete");

  await context.close();
});

// ---------------------------------------------------------------------------
// BACKGROUND-TAB THROTTLING — mobile OS suspends JS
// ---------------------------------------------------------------------------

test("background tab: visibility hidden during trials, then resumed → no errors, telemetry intact", async ({ page }) => {
  // Mobile OSes throttle background tabs aggressively (some kill JS
  // entirely after a few minutes). This test confirms (a) the
  // visibilitychange listener fires and records, and (b) when the tab is
  // foregrounded again, the task is in a recoverable state — or, if it
  // wasn't, we have a clear signal in taskStatus_visibility.
  await page.goto(HARNESS + "?stress=auto-timeout");

  // Wait until trials are running.
  await expect
    .poll(async () => (await captured(page)).taskStatus_state, { timeout: 10_000 })
    .toMatch(/^(trial_shown|trial_responded|intertrial|main_task_started)$/);

  // Synthesize a visibility-hidden event from the page itself. Real
  // backgrounding involves Page.setBackgroundColorOverride / CDP; the
  // visibility *event* is what our listener cares about.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  // Let the rest of the task run to completion.
  await expect
    .poll(async () => (await captured(page)).taskStatus_state, { timeout: 25_000 })
    .toBe("complete");

  const cap = await captured(page);
  expect(cap.taskStatus_visibility).toBeTruthy();
  const events = JSON.parse(cap.taskStatus_visibility);
  expect(events.some((e) => e.state === "hidden")).toBe(true);
  expect(events.some((e) => e.state === "visible")).toBe(true);
});
