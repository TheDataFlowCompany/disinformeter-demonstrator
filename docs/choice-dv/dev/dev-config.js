// Local dev harness config — mirrors the userSettings object that survey
// authors paste into the Qualtrics question JS (see ../js/task-item.js).
// Edit freely; this file is never shipped to production.
Qualtrics.SurveyEngine.addOnload(function () {
  const rawLanguage = window.__DECONSPIRATOR_Q_LANGUAGE || "en";
  const language = window.resolveTaskLanguage(rawLanguage);
  const recoverySettings = window.buildTaskSettingsForLanguage(
    language.resolved,
    window.DECON_SHARED_STUDY_SETTINGS,
    window.DECON_LANGUAGE_CONFIGS,
    window.DECON_STIMULI_PAIRS
  );

  // Mirror task-item.js: detect engine-script load failure so the
  // "engine_missing" telemetry signature is reproducible in the harness too.
  // (The harness sets DECONSPIRATOR_TASK_ITEM_AUTORUN=false, so the production
  // detection inside task-item.js doesn't run here — without this guard, an
  // aborted engine load would silently throw a ReferenceError instead.)
  if (typeof window.startTask !== "function") {
    try {
      Qualtrics.SurveyEngine.setEmbeddedData("taskStatus_state", "engine_missing");
      Qualtrics.SurveyEngine.setEmbeddedData("taskStatus_errors", JSON.stringify([{
        ts: typeof performance !== "undefined" ? Math.round(performance.now()) : 0,
        source: "dev-config.js",
        message: "window.startTask is not a function — engine script did not load",
      }]));
    } catch (_) {}
    try { this.enableNextButton && this.enableNextButton(); } catch (_) {}
    if (typeof window.renderDeconspiratorRecoveryOverlay === "function") {
      window.renderDeconspiratorRecoveryOverlay(recoverySettings, "engine_missing");
    }
    console.error("[deconspirator] engine script missing in dev harness");
    return;
  }

  /** @type {Partial<import('../js/deconspirator-task.js').Settings>} */
  const sharedSettings = Object.assign({}, window.DECON_SHARED_STUDY_SETTINGS, {
    // Trial timings
    STIMULUS_TIMEOUT: 30000,
    INTER_TRIAL_TIMEOUT: 800,
    MOUSE_RECORDING_INTERVAL: 100,

    // Scoring + UI
    SELECT_TARGET: "fimi",
    SHOW_SKIP_STIMULUS: true,
    SHOW_LABEL_OVERLAY: true,   // helpful in the harness — disable in real studies
    CONCEAL_UNTIL_HOVER: true,
    SHOW_REVEAL_HINT: true,     // exercise the optional reveal-hint affordance in the harness

    // Tutorial
    TUTORIAL_ENABLED: true,

    // Follow-up question screen
    FOLLOW_UP_QUESTION_ENABLED: true,

    // Touch override surfaced from the toolbar
    FORCE_TOUCH_MODE: window.__DECONSPIRATOR_FORCE_TOUCH ? true : null,

    // Try a typo to see the unknown-key warning fire:
    // CONCEAL_UNTIL_HOOVER: true,
  });

  // Stress-test injection: settings-level mutations live here so a stress
  // scenario can target real participant-facing config (URL, timeout) without
  // editing the engine. The engine-side mutations (slow Image, throws) live in
  // dev/index.html. See the toolbar in index.html for what each mode does.
  const stress = window.__DECONSPIRATOR_STRESS || "none";
  if (stress === "bad-stimuli-url") {
    sharedSettings.STIMULI_URL = "https://stimuli-do-not-exist.invalid.example/";
  }
  if (stress === "slow-assets" || stress === "short-asset-timeout") {
    sharedSettings.ASSET_LOAD_TIMEOUT_MS = 5000;
  }
  if (stress === "short-timeout") {
    sharedSettings.STIMULUS_TIMEOUT = 1500;
    sharedSettings.SHOW_TIMER = true;
  }
  if (stress === "auto-timeout") {
    // Unattended happy-path: tutorial off + every stimulus times out quickly,
    // so the whole task runs to "complete" in ~5s with no UI interaction.
    // Used by the Playwright stress suite to verify the full lifecycle
    // sequence without driving hover/click events.
    sharedSettings.TUTORIAL_ENABLED = false;
    sharedSettings.STIMULUS_TIMEOUT = 300;
    sharedSettings.INTER_TRIAL_TIMEOUT = 100;
    sharedSettings.SHOW_TIMER = false;
    sharedSettings.INTER_TRIAL_LOADER = false;
  }
  if (stress === "crash-on-init") {
    // Throw from startTask's own try/catch by hooking the synchronous
    // Telemetry.mark("init_complete") call that runs right after initTask.
    // queueMicrotask-based throws don't work here — they land in
    // window.onerror, not inside the await chain — so the engine's
    // startTask try/catch never sees them and state never becomes "crashed".
    const tele = window.DeconspiratorTelemetry;
    if (tele && typeof tele.mark === "function") {
      const origMark = tele.mark.bind(tele);
      tele.mark = function (state, detail) {
        if (state === "init_complete") {
          // Restore before throwing so the catch block's own
          // mark("crashed") call still works.
          tele.mark = origMark;
          throw new Error("stress-test: crash on init");
        }
        return origMark(state, detail);
      };
    }
  }

  const userSettings = window.buildTaskSettingsForLanguage(
    language.resolved,
    sharedSettings,
    window.DECON_LANGUAGE_CONFIGS,
    window.DECON_STIMULI_PAIRS
  );

  if (stress === "bad-stimuli-url") {
    userSettings.STIMULI_URL = "https://stimuli-do-not-exist.invalid.example/";
  }

  // Crash-on-trial-N: monkey-patch buildTrial after the engine is loaded so a
  // mid-task throw exercises the startTask try/catch + taskStatus_state=crashed.
  if (stress.startsWith("crash-on-trial-")) {
    const targetTrial = parseInt(stress.split("-").pop(), 10) || 2;
    let trialCounter = 0;
    const origBuildTrial = window.startTask && window.buildTrial;
    // buildTrial isn't exported on window directly; instead we hook the
    // taskStatus_state writes to detect when we cross the target trial and
    // throw at that point from a microtask.
    const origSetEmbedded = Qualtrics.SurveyEngine.setEmbeddedData;
    Qualtrics.SurveyEngine.setEmbeddedData = function (field, value) {
      if (field === "taskStatus_state" && value === "trial_shown") {
        trialCounter++;
        if (trialCounter === targetTrial) {
          queueMicrotask(() => {
            throw new Error("stress-test: forced crash on trial " + targetTrial);
          });
        }
      }
      return origSetEmbedded.call(this, field, value);
    };
  }

  window.storeTaskLanguageAudit(Qualtrics.SurveyEngine, language, userSettings);

  window.startTask(Qualtrics.SurveyEngine, this, userSettings);
});
