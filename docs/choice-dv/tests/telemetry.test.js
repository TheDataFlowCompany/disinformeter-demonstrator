"use strict";
// Pins for the Telemetry public surface. Telemetry is the only signal we get
// when a participant doesn't reach storeTaskData() — the dropout dashboard
// relies on these field names + value semantics. If something here fails,
// either fix the engine or update the dashboard query in lockstep.

const test = require("node:test");
const assert = require("node:assert/strict");

// Minimal globals so the engine require'd from Node doesn't blow up. We don't
// need a DOM — Telemetry's install() guards on `typeof window` etc.
global.window = global.window || {};
global.Qualtrics = global.Qualtrics || { SurveyEngine: {} };

const engine = require("../js/deconspirator-task.js");

test("Telemetry public surface", () => {
  assert.ok(engine.Telemetry, "Telemetry is exported");
  for (const fn of ["install", "shutdown", "mark", "recordError",
                    "setAssetTotals", "recordAssetLoaded", "recordAssetFailed",
                    "recordAssetTimedOut",
                    "setTouchMode", "setLanguage", "getStatus"]) {
    assert.equal(typeof engine.Telemetry[fn], "function", fn + " is a function");
  }
});

test("TELEMETRY_STATES covers every classification bucket", () => {
  const states = engine.TELEMETRY_STATES;
  assert.ok(Array.isArray(states));
  // Each bucket the dropout dashboard needs at least one state for:
  const buckets = {
    "loading":     ["script_loaded", "task_item_loaded", "addOnload_fired"],
    "init":        ["merging_settings", "init_complete"],
    "assets":      ["assets_preload_started", "assets_preload_complete", "assets_preload_slow", "assets_preload_partial"],
    "tutorial":    ["tutorial_started", "tutorial_complete"],
    "main":        ["main_task_started", "trial_shown", "trial_responded", "intertrial"],
    "post_choice": ["post_choice_shown", "post_choice_submitted"],
    "terminal":    ["storing_data", "complete", "crashed"],
  };
  for (const [bucket, members] of Object.entries(buckets)) {
    for (const m of members) {
      assert.ok(states.includes(m), bucket + " bucket needs " + m);
    }
  }
});

test("Telemetry.mark updates state + getStatus() reflects it", () => {
  engine.Telemetry.mark("init_complete");
  const s = engine.Telemetry.getStatus();
  assert.equal(s.state, "init_complete");
  assert.equal(typeof s.stateMs, "number");
});

test("Telemetry.mark appends to stateHistory", () => {
  // Capture history length before — Telemetry is module-singleton state, so
  // we count deltas rather than asserting absolute size.
  const before = engine.Telemetry.getStatus().stateHistory.length;
  engine.Telemetry.mark("tutorial_started");
  engine.Telemetry.mark("tutorial_complete");
  const after = engine.Telemetry.getStatus().stateHistory;
  assert.equal(after.length - before, 2);
  assert.equal(after[after.length - 2].s, "tutorial_started");
  assert.equal(after[after.length - 1].s, "tutorial_complete");
  assert.equal(typeof after[after.length - 1].ms, "number");
});

test("Telemetry.mark accepts trial detail", () => {
  engine.Telemetry.mark("trial_shown", { trialIndex: 3, nTrials: 7 });
  const s = engine.Telemetry.getStatus();
  assert.equal(s.trialIndex, 3);
  assert.equal(s.nTrials, 7);

  engine.Telemetry.mark("trial_responded", { trialIndex: 3, nTrials: 7, event: "CLICK" });
  assert.equal(engine.Telemetry.getStatus().lastTrialEvent, "CLICK");
});

test("Telemetry.recordError captures message + stack + state", () => {
  // Reset by re-marking; recordError pushes onto the (rolling) errors list.
  engine.Telemetry.mark("trial_shown", { trialIndex: 1, nTrials: 7 });
  const before = engine.Telemetry.getStatus().errors.length;
  engine.Telemetry.recordError(new Error("boom"), "test");
  const after = engine.Telemetry.getStatus().errors;
  assert.equal(after.length, before + 1);
  const last = after[after.length - 1];
  assert.equal(last.source, "test");
  assert.equal(last.message, "boom");
  assert.equal(last.state, "trial_shown", "error captures state at time of throw");
  assert.ok(last.stack && last.stack.length > 0);
});

test("Telemetry.recordAssetFailed populates assetsFailed", () => {
  engine.Telemetry.setAssetTotals(3);
  engine.Telemetry.recordAssetLoaded("https://example.invalid/img-ok.jpg");
  engine.Telemetry.recordAssetFailed("https://example.invalid/img-01.jpg");
  const s = engine.Telemetry.getStatus();
  assert.equal(s.assetsTotal, 3);
  assert.equal(s.assetsLoaded, 1);
  assert.deepEqual(s.assetsFailed, ["https://example.invalid/img-01.jpg"]);
});

test("Telemetry separates slow assets from hard failures", () => {
  engine.Telemetry.setAssetTotals(2);
  engine.Telemetry.recordAssetTimedOut("https://example.invalid/slow.jpg");
  engine.Telemetry.recordAssetLoaded("https://example.invalid/slow.jpg", true);
  const s = engine.Telemetry.getStatus();
  assert.equal(s.assetsLoaded, 1);
  assert.deepEqual(s.assetsTimedOut, ["https://example.invalid/slow.jpg"]);
  assert.deepEqual(s.assetsLateLoaded, ["https://example.invalid/slow.jpg"]);
  assert.deepEqual(s.assetsFailed, []);
});

test("Telemetry.recordError never throws on malformed input", () => {
  assert.doesNotThrow(() => engine.Telemetry.recordError(null));
  assert.doesNotThrow(() => engine.Telemetry.recordError(undefined));
  assert.doesNotThrow(() => engine.Telemetry.recordError("not an error object"));
  assert.doesNotThrow(() => engine.Telemetry.recordError({ message: "no stack" }));
});

test("Telemetry.PREFIX_DEFAULT matches getEngineMeta().telemetryFieldPrefix", () => {
  assert.equal(engine.Telemetry.PREFIX_DEFAULT, "taskStatus");
  const meta = engine.getEngineMeta(engine.defaultSettings);
  assert.equal(meta.telemetryFieldPrefix, engine.Telemetry.PREFIX_DEFAULT);
});
