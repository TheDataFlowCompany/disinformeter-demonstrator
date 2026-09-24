"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const taskItem = require("../js/task-item.js");

test("resolveTaskLanguage resolves Lithuanian Qualtrics variants", () => {
  for (const raw of ["LT", "lt", "lt-LT", "lt_LT"]) {
    const language = taskItem.resolveTaskLanguage(raw);
    assert.equal(language.resolved, "lt", raw);
    assert.equal(language.fallback, false, raw);
  }
});

test("resolveTaskLanguage resolves English Qualtrics variants", () => {
  for (const raw of ["EN", "en", "ENG", "en-US", "en_GB"]) {
    const language = taskItem.resolveTaskLanguage(raw);
    assert.equal(language.resolved, "en", raw);
    assert.equal(language.fallback, false, raw);
  }
});

test("resolveTaskLanguage falls back to English for unresolved or unknown values", () => {
  for (const raw of ["${e://Field/Q_Language}", "", null, "fr"]) {
    const language = taskItem.resolveTaskLanguage(raw);
    assert.equal(language.resolved, "en", String(raw));
    assert.equal(language.fallback, true, String(raw));
  }
});

test("resolveTaskLanguage tolerates Qualtrics piping artefacts", () => {
  // Qualtrics has been observed to leak a trailing "}" or whitespace into the
  // substituted value. These should still resolve to the intended language.
  const cases = [
    ["DE}", "de"],
    [" lt ", "lt"],
    ["en​", "en"],
    ["PL\t", "pl"],
  ];
  for (const [raw, expected] of cases) {
    const language = taskItem.resolveTaskLanguage(raw);
    assert.equal(language.resolved, expected, JSON.stringify(raw));
    assert.equal(language.fallback, false, JSON.stringify(raw));
  }
});

test("buildTaskSettingsForLanguage keeps pair ids stable and swaps stimuli URL", () => {
  const en = taskItem.buildTaskSettingsForLanguage("en");
  const lt = taskItem.buildTaskSettingsForLanguage("lt");

  assert.equal(en.STIMULI_URL, "https://thedataflowcompany.com/files/deconspirator/stimuli/");
  assert.equal(lt.STIMULI_URL, "https://thedataflowcompany.com/files/deconspirator/stimuli/lt/");
  assert.deepEqual(en.STIMULI_PAIRS.map((p) => p.id), taskItem.DECON_STIMULI_PAIRS.map((p) => p.id));
  assert.deepEqual(lt.STIMULI_PAIRS.map((p) => p.id), en.STIMULI_PAIRS.map((p) => p.id));
  assert.equal(en.ASSET_LOAD_TIMEOUT_MS, 45000);
});

test("language configs expose all post-choice question strings", () => {
  for (const [code, config] of Object.entries(taskItem.DECON_LANGUAGE_CONFIGS)) {
    assert.equal(typeof config.POST_CHOICE_SUBMIT_LABEL, "string", code);
    assert.equal(config.FOLLOW_UP_QUESTIONS.length, 3, code);
    assert.deepEqual(config.FOLLOW_UP_QUESTIONS.map((q) => q.key), [
      "confidence",
      "reportManipulated",
      "checkSources",
    ], code);
    for (const question of config.FOLLOW_UP_QUESTIONS) {
      assert.equal(typeof question.question, "string", code);
      assert.equal(question.labels.length, 7, code);
      assert.equal(typeof question.embeddedFieldPrefix, "string", code);
    }
  }
});

test("language configs expose recovery strings", () => {
  for (const [code, config] of Object.entries(taskItem.DECON_LANGUAGE_CONFIGS)) {
    assert.equal(typeof config.ERROR_RECOVERY_TITLE, "string", code);
    assert.ok(config.ERROR_RECOVERY_TITLE.length > 0, code);
    assert.equal(typeof config.ERROR_RECOVERY_MESSAGE, "string", code);
    assert.ok(config.ERROR_RECOVERY_MESSAGE.length > 0, code);
  }
});

test("storeTaskLanguageAudit writes the resolved language fields", () => {
  const writes = {};
  const qse = {
    setEmbeddedData(field, value) {
      writes[field] = value;
    },
  };
  const language = taskItem.resolveTaskLanguage("lt-LT");
  const settings = taskItem.buildTaskSettingsForLanguage(language.resolved);

  taskItem.storeTaskLanguageAudit(qse, language, settings);

  assert.deepEqual(writes, {
    taskLanguage_raw: "lt-LT",
    taskLanguage_resolved: "lt",
    taskLanguage_fallback: "false",
    taskStimuliUrl: "https://thedataflowcompany.com/files/deconspirator/stimuli/lt/",
  });
});
