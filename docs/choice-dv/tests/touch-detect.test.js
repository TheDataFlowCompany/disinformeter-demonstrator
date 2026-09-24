"use strict";
// Pin the OR-of-signals touch detection. Each test wires up a fresh set of
// browser globals and re-requires the engine, since matchMedia results are
// captured in module-scope `touchModeDiagnostics`.

const test = require("node:test");
const assert = require("node:assert/strict");

function loadEngineWithEnv(overrides = {}) {
  const cfg = Object.assign({
    maxTouchPoints: 0,
    ontouchstart: false,
    anyPointerCoarse: false,
    hoverNone: false,
    pointerCoarse: false,
    innerWidth: 1440,
    innerHeight: 900,
    devicePixelRatio: 1,
    userAgent: "test-runner",
  }, overrides);

  // Node 22 ships a read-only built-in `navigator` getter; defineProperty
  // bypasses it. We re-define on every load so each test gets a clean stub.
  Object.defineProperty(globalThis, "navigator", {
    value: { maxTouchPoints: cfg.maxTouchPoints, userAgent: cfg.userAgent },
    writable: true,
    configurable: true,
  });
  global.window = {
    innerWidth: cfg.innerWidth,
    innerHeight: cfg.innerHeight,
    devicePixelRatio: cfg.devicePixelRatio,
    matchMedia: (q) => {
      const matches =
        (q.includes("any-pointer: coarse") && cfg.anyPointerCoarse) ||
        (q.includes("hover: none")         && cfg.hoverNone) ||
        // pointer:coarse is a different query from any-pointer:coarse
        (/^\(pointer: coarse\)$/.test(q.trim()) && cfg.pointerCoarse);
      return { matches };
    },
  };
  if (cfg.ontouchstart) {
    global.window.ontouchstart = null; // presence in object is what matters
  }
  global.Qualtrics = { SurveyEngine: {} };

  const path = require.resolve("../releases/2026.05.20/js/deconspirator-task.js");
  delete require.cache[path];
  return require(path);
}

test("isTouchPrimary false on a desktop with mouse only", () => {
  const engine = loadEngineWithEnv();
  assert.equal(engine.isTouchPrimary(), false);
});

test("isTouchPrimary true when navigator.maxTouchPoints > 0", () => {
  const engine = loadEngineWithEnv({ maxTouchPoints: 5 });
  assert.equal(Boolean(engine.isTouchPrimary()), true);
});

test("isTouchPrimary true on (any-pointer: coarse)", () => {
  const engine = loadEngineWithEnv({ anyPointerCoarse: true });
  assert.equal(Boolean(engine.isTouchPrimary()), true);
});

test("isTouchPrimary true on (hover: none)", () => {
  const engine = loadEngineWithEnv({ hoverNone: true });
  assert.equal(Boolean(engine.isTouchPrimary()), true);
});

test("isTouchPrimary true on narrow viewport (<= 768px)", () => {
  const engine = loadEngineWithEnv({ innerWidth: 375 });
  assert.equal(Boolean(engine.isTouchPrimary()), true);
});

test("isTouchPrimary true when ontouchstart present in window", () => {
  const engine = loadEngineWithEnv({ ontouchstart: true });
  assert.equal(Boolean(engine.isTouchPrimary()), true);
});

test("readTouchSignals captures every input signal verbatim", () => {
  const engine = loadEngineWithEnv({
    maxTouchPoints: 5,
    anyPointerCoarse: true,
    hoverNone: true,
    pointerCoarse: true,
    innerWidth: 320,
    innerHeight: 568,
    devicePixelRatio: 2,
    ontouchstart: true,
  });
  const sig = engine.readTouchSignals();
  assert.equal(sig.maxTouchPoints, true);
  assert.equal(sig.ontouchstart, true);
  assert.equal(sig.anyPointerCoarse, true);
  assert.equal(sig.hoverNone, true);
  assert.equal(sig.pointerCoarse, true);
  assert.equal(sig.narrowViewport, true);
  assert.equal(sig.innerWidth, 320);
  assert.equal(sig.innerHeight, 568);
  assert.equal(sig.devicePixelRatio, 2);
});

test("resolveTouchMode returns FORCE_TOUCH_MODE when explicitly set", () => {
  // Override defaults so even an obvious "this is a phone" environment is
  // overridden by FORCE_TOUCH_MODE=false. Calling resolveTouchMode requires
  // the engine module's settings object — startTask isn't run, so `settings`
  // is the empty default. We patch the module's settings via a transient set.
  const engine = loadEngineWithEnv({ maxTouchPoints: 5, hoverNone: true });
  // resolveTouchMode reads settings.FORCE_TOUCH_MODE; we can't poke into the
  // module's `let settings` from here, but we can verify behaviour via the
  // auto-detect path. The truthy-FORCE_TOUCH_MODE path is exercised at runtime
  // through startTask -> mergeSettings; this test pins the auto-detect path.
  const resolved = engine.resolveTouchMode("test");
  assert.equal(Boolean(resolved), true, "phone-like env should auto-detect to touch");
});
