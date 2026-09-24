"use strict";
// Pin the wire-format that data/check_data_quality.py depends on. Pure-helper
// tests only — no DOM, no Qualtrics. If any assertion here fails, also update
// either check_data_quality.py or task_features_description.md.

const test = require("node:test");
const assert = require("node:assert/strict");

// Stub the minimal globals the engine touches at the bottom guard. The
// engine's function bodies are not invoked at require-time, so we don't need
// jsdom — just non-throwing shims for the tail.
global.window = global.window || {};
global.Qualtrics = global.Qualtrics || { SurveyEngine: {} };

const engine = require("../js/deconspirator-task.js");

test("ENGINE_VERSION matches YYYY.MM.DD or YYYY.MM.DD.patch pattern", () => {
  assert.match(engine.ENGINE_VERSION, /^\d{4}\.\d{2}\.\d{2}(?:\.\d+)?$/);
});

test("defaultSettings exposes the embedded-data field names QC depends on", () => {
  assert.equal(engine.defaultSettings.QUALTRICS_EMBEDDED_FIELD, "taskData");
  assert.equal(engine.defaultSettings.FOLLOW_UP_QUESTION_ENABLED, true);
  assert.equal(engine.defaultSettings.ERROR_RECOVERY_ENABLED, true);
  assert.equal(engine.defaultSettings.ERROR_RECOVERY_ASSET_FAILURE_THRESHOLD, 4);
  assert.equal(engine.defaultSettings.ASSET_LOAD_TIMEOUT_MS, 45000);
  assert.equal(typeof engine.defaultSettings.ERROR_RECOVERY_TITLE, "string");
  assert.equal(typeof engine.defaultSettings.ERROR_RECOVERY_MESSAGE, "string");
  assert.deepEqual(engine.defaultSettings.FOLLOW_UP_QUESTIONS.map((q) => q.embeddedFieldPrefix), [
    "confidence_fimi_",
    "report_fimi_",
    "check_sources_fimi_",
  ]);
});

test("mergeSettings warns on unknown keys but still passes them through", () => {
  const warnings = [];
  const orig = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    const merged = engine.mergeSettings({
      STIMULUS_TIMEOUT: 5000,
      CONCEAL_UNTIL_HOOVER: true, // intentional typo
    });
    assert.equal(merged.STIMULUS_TIMEOUT, 5000);
    assert.equal(merged.CONCEAL_UNTIL_HOOVER, true, "unknown keys still pass through");
    assert.ok(
      warnings.some((w) => w.includes("CONCEAL_UNTIL_HOOVER")),
      "expected warn mentioning the typo'd key"
    );
  } finally {
    console.warn = orig;
  }
});

test("mergeSettings is silent for keys present in defaults", () => {
  const warnings = [];
  const orig = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    engine.mergeSettings({ STIMULUS_TIMEOUT: 1000, SELECT_TARGET: "fimi" });
    assert.equal(warnings.length, 0);
  } finally {
    console.warn = orig;
  }
});

test("mergeSettings maps deprecated CONFIDENCE_ENABLED to FOLLOW_UP_QUESTION_ENABLED", () => {
  const merged = engine.mergeSettings({ CONFIDENCE_ENABLED: false });
  assert.equal(merged.FOLLOW_UP_QUESTION_ENABLED, false);
});

test("getFollowUpQuestions validates configurable question shape", () => {
  const questions = engine.getFollowUpQuestions(engine.defaultSettings);
  assert.equal(questions.length, 3);
  assert.deepEqual(questions.map((q) => q.key), ["confidence", "reportManipulated", "checkSources"]);
  assert.throws(
    () => engine.getFollowUpQuestions({ ...engine.defaultSettings, FOLLOW_UP_QUESTIONS: [{ key: "bad" }] }),
    /labels|question/
  );
});

test("validateStimuliPairs accepts well-formed pairs", () => {
  assert.doesNotThrow(() =>
    engine.validateStimuliPairs([{ id: "01", fimi: "a.jpg", non: "b.jpg" }])
  );
});

test("validateStimuliPairs rejects non-array", () => {
  assert.throws(() => engine.validateStimuliPairs(null), /STIMULI/);
});

test("validateStimuliPairs rejects pairs missing required keys", () => {
  for (const bad of [
    [{ fimi: "a.jpg", non: "b.jpg" }],            // no id
    [{ id: "01", non: "b.jpg" }],                  // no fimi
    [{ id: "01", fimi: "a.jpg" }],                 // no non
    [{ id: "", fimi: "a.jpg", non: "b.jpg" }],     // falsy id
  ]) {
    assert.throws(() => engine.validateStimuliPairs(bad), /STIMULI INVALID/);
  }
});

test("buildTrial CLICK on FIMI is correct when SELECT_TARGET=fimi", () => {
  const assignment = [
    { id: "01-FIMI", type: "fimi", side: "left", filename: "F.jpg" },
    { id: "01-NON",  type: "non",  side: "right", filename: "N.jpg" },
  ];
  const trial = engine.buildTrial({
    event: "CLICK",
    pair: { id: "01" },
    assignment,
    chosen: assignment[0],
    mouseData: [{ ts: 100, pageX: 1, pageY: 2, hovTarg: "01-FIMI" }],
    touchData: [],
    tsStart: 100,
    tsEnd: 1500,
    followUpAnswers: {
      confidence: 5,
      reportManipulated: 6,
      checkSources: 7,
    },
    correctType: "fimi",
  });

  assert.equal(trial.event, "CLICK");
  assert.equal(trial.pairId, "01");
  assert.equal(trial.chosenType, "fimi");
  assert.equal(trial.chosenId, "01-FIMI");
  assert.equal(trial.isCorrect, true);
  assert.equal(trial.rt, 1400);
  assert.equal(trial.confidence, 5);
  assert.equal(trial.reportManipulated, 6);
  assert.equal(trial.checkSources, 7);
  assert.deepEqual(trial.mouse, [{ ts: 100, pageX: 1, pageY: 2, hovTarg: "01-FIMI" }]);
  assert.deepEqual(trial.touch, []);
});

test("buildTrial CLICK on NON when SELECT_TARGET=fimi is incorrect", () => {
  const assignment = [
    { id: "01-FIMI", type: "fimi", side: "left", filename: "F.jpg" },
    { id: "01-NON",  type: "non",  side: "right", filename: "N.jpg" },
  ];
  const trial = engine.buildTrial({
    event: "CLICK",
    pair: { id: "01" },
    assignment,
    chosen: assignment[1],
    mouseData: [],
    touchData: [],
    tsStart: 0,
    tsEnd: 1000,
    followUpAnswers: {
      confidence: 3,
      reportManipulated: null,
      checkSources: null,
    },
    correctType: "fimi",
  });
  assert.equal(trial.isCorrect, false);
  assert.equal(trial.chosenType, "non");
  assert.equal(trial.reportManipulated, null);
  assert.equal(trial.checkSources, null);
});

test("buildTrial respects opposite SELECT_TARGET=non scoring", () => {
  const assignment = [
    { id: "01-FIMI", type: "fimi", side: "left", filename: "F.jpg" },
    { id: "01-NON",  type: "non",  side: "right", filename: "N.jpg" },
  ];
  const trial = engine.buildTrial({
    event: "CLICK",
    pair: { id: "01" },
    assignment,
    chosen: assignment[1],
    mouseData: [], touchData: [],
    tsStart: 0, tsEnd: 800, followUpAnswers: { confidence: 6 },
    correctType: "non",
  });
  assert.equal(trial.isCorrect, true);
});

test("buildTrial TIMEOUT has null chosen + isCorrect=false", () => {
  const assignment = [
    { id: "01-FIMI", type: "fimi", side: "left", filename: "F.jpg" },
    { id: "01-NON",  type: "non",  side: "right", filename: "N.jpg" },
  ];
  const trial = engine.buildTrial({
    event: "TIMEOUT",
    pair: { id: "01" },
    assignment,
    chosen: null,
    mouseData: [], touchData: [],
    tsStart: 0, tsEnd: 30000,
    followUpAnswers: { confidence: null, reportManipulated: null, checkSources: null },
    correctType: "fimi",
  });
  assert.equal(trial.chosenId, null);
  assert.equal(trial.chosenType, null);
  assert.equal(trial.isCorrect, false);
  assert.equal(trial.confidence, null);
  assert.equal(trial.reportManipulated, null);
  assert.equal(trial.checkSources, null);
});

test("buildTrial preserves assignment shape (drops extra keys)", () => {
  const assignment = [
    { id: "02-NON",  type: "non",  side: "left",  filename: "N.jpg", _internal: "drop me" },
    { id: "02-FIMI", type: "fimi", side: "right", filename: "F.jpg" },
  ];
  const trial = engine.buildTrial({
    event: "SKIP",
    pair: { id: "02" },
    assignment, chosen: null,
    mouseData: [], touchData: [],
    tsStart: 0, tsEnd: 500, followUpAnswers: { confidence: null }, correctType: "fimi",
  });
  // Asserts the projection: only the four wire-format keys survive.
  for (const a of trial.assignment) {
    assert.deepEqual(Object.keys(a).sort(), ["filename", "id", "side", "type"]);
  }
});

test("buildTrial rounds float timestamps", () => {
  const assignment = [
    { id: "01-FIMI", type: "fimi", side: "left", filename: "F.jpg" },
    { id: "01-NON",  type: "non",  side: "right", filename: "N.jpg" },
  ];
  const trial = engine.buildTrial({
    event: "CLICK",
    pair: { id: "01" },
    assignment, chosen: assignment[0],
    mouseData: [], touchData: [],
    tsStart: 100.7, tsEnd: 1500.4, followUpAnswers: { confidence: 4 }, correctType: "fimi",
  });
  assert.equal(trial.tsStart, 101);
  assert.equal(trial.tsEnd, 1500);
  assert.equal(trial.rt, 1400); // Math.round(1500.4 - 100.7) = Math.round(1399.7) = 1400
});

test("getEngineMeta exposes the wire-format constants QC consumes", () => {
  const meta = engine.getEngineMeta({
    ...engine.defaultSettings,
    STIMULUS_TIMEOUT: 9000,
    SELECT_TARGET: "fimi",
    STIMULI_PAIRS: [
      { id: "01", fimi: "a", non: "b" },
      { id: "02", fimi: "c", non: "d" },
    ],
  });

  assert.equal(meta.engineVersion, engine.ENGINE_VERSION);
  assert.deepEqual([...meta.validEvents].sort(), ["CLICK", "SKIP", "TIMEOUT"]);
  assert.deepEqual([...meta.validTypes].sort(), ["fimi", "non"]);
  assert.deepEqual([...meta.validSides].sort(), ["left", "right"]);
  assert.deepEqual(meta.validConfidenceRange, [1, 7]);
  assert.equal(meta.stimulusTimeoutMs, 9000);
  assert.equal(meta.assetLoadTimeoutMs, 45000);
  assert.equal(meta.selectTarget, "fimi");
  assert.deepEqual(meta.expectedPairIds, ["01", "02"]);
  assert.equal(meta.expectedNTrials, 2);
  assert.equal(meta.confidenceFieldPrefix, "confidence_fimi_");
  assert.equal(meta.reportFieldPrefix, "report_fimi_");
  assert.equal(meta.checkSourcesFieldPrefix, "check_sources_fimi_");
  assert.equal(meta.followUpQuestionEnabled, true);
  assert.equal(meta.errorRecoveryEnabled, true);
  assert.equal(meta.errorRecoveryAssetFailureThreshold, 4);
  assert.deepEqual(meta.postChoiceFields, [
    { key: "confidence", fieldPrefix: "confidence_fimi_" },
    { key: "reportManipulated", fieldPrefix: "report_fimi_" },
    { key: "checkSources", fieldPrefix: "check_sources_fimi_" },
  ]);
});

test("getEngineMeta supports removed or added follow-up questions", () => {
  const meta = engine.getEngineMeta({
    ...engine.defaultSettings,
    FOLLOW_UP_QUESTIONS: [
      {
        key: "confidence",
        question: "Confidence?",
        labels: ["1", "2", "3", "4", "5", "6", "7"],
        embeddedFieldPrefix: "confidence_fimi_",
      },
      {
        key: "shareIntent",
        question: "Share?",
        labels: ["1", "2", "3", "4", "5", "6", "7"],
        embeddedFieldPrefix: "share_fimi_",
      },
    ],
  });

  assert.deepEqual(meta.postChoiceFields, [
    { key: "confidence", fieldPrefix: "confidence_fimi_" },
    { key: "shareIntent", fieldPrefix: "share_fimi_" },
  ]);
  assert.equal(meta.reportFieldPrefix, null);
  assert.equal(meta.checkSourcesFieldPrefix, null);
});

test("getEngineMeta omits follow-up fields when disabled", () => {
  const meta = engine.getEngineMeta({
    ...engine.defaultSettings,
    FOLLOW_UP_QUESTION_ENABLED: false,
  });
  assert.equal(meta.followUpQuestionEnabled, false);
  assert.deepEqual(meta.postChoiceFields, []);
});

test("getEngineMeta exposes telemetry schema for dropout QC", () => {
  const meta = engine.getEngineMeta(engine.defaultSettings);
  assert.equal(meta.telemetryFieldPrefix, "taskStatus");
  assert.ok(Array.isArray(meta.telemetryStates), "telemetryStates is an array");
  // Pin the load-failure states the dropout dashboard filters on. If any of
  // these are renamed, the dashboard's classification rules break silently.
  for (const required of ["script_loaded", "addOnload_fired", "init_complete",
                          "assets_preload_started", "assets_preload_slow", "assets_preload_partial",
                          "main_task_started", "trial_shown", "trial_responded",
                          "complete", "crashed"]) {
    assert.ok(meta.telemetryStates.includes(required),
      "telemetryStates must include " + required);
  }
});

test("getEngineMeta normalises selectTarget casing", () => {
  const meta = engine.getEngineMeta({
    ...engine.defaultSettings,
    SELECT_TARGET: "FIMI",
  });
  assert.equal(meta.selectTarget, "fimi");
});

test("shuffle returns a permutation without mutating its input", () => {
  const input = [1, 2, 3, 4, 5];
  const out = engine.shuffle(input);
  assert.equal(out.length, input.length);
  assert.deepEqual([...out].sort(), [...input].sort());
  assert.deepEqual(input, [1, 2, 3, 4, 5], "input is not mutated");
});
