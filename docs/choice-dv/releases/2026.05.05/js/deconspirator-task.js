"use strict";
/**
 * Deconspirator Choice Task for Qualtrics
 * --------------------------------------
 * This script shows participants a pair of newspaper clippings per trial:
 *   - one FIMI (foreign misinformation) clipping
 *   - one NonFIMI (authentic / non-manipulated) clipping
 * The participant must choose the NON-manipulated clipping (configurable).
 *
 * Data captured per trial:
 *   - pairId, assignment (which side each type was shown), chosen element/type/id
 *   - correctness, event (CLICK | TIMEOUT | SKIP), RT, timestamps
 *   - full mouse trajectory with timestamps + hover targets
 *
 * Qualtrics integration:
 *   - Saves JSON to embedded field settings.QUALTRICS_EMBEDDED_FIELD (default: "taskData")
 *   - Also writes <field>_diagnostics (touch mode signals) and <field>_meta (engine version + wire-format constants).
 *
 * No external library dependencies.
 */

/**
 * Engine version. Stamped into the <field>_meta embedded data so saved sessions
 * can be traced back to a specific build. Bump on any behavioural change
 * (data shape, scoring rule, defaults). See CHANGELOG.md.
 */
const ENGINE_VERSION = "2026.05.05";

/*************************
 * CONFIG & INITIAL STATE *
 *************************/

/**
 * @typedef {Object} Settings
 * @property {boolean}   SHOW_SKIP_STIMULUS
 * @property {string}    SKIP_STIMULUS_LABEL
 * @property {boolean}   SHOW_LABEL_OVERLAY                 - Debug overlay; do not enable in production.
 * @property {boolean}   CONCEAL_UNTIL_HOVER                - Hide clippings until hover/tap (the whole design).
 * @property {number}    MOUSE_RECORDING_INTERVAL           - Mouse-sample cadence (ms).
 * @property {number}    STIMULUS_TIMEOUT                   - Per-trial timeout (ms); 0 disables timeout.
 * @property {boolean}   SHOW_TIMER                         - Visual countdown ring.
 * @property {number}    INTER_TRIAL_TIMEOUT
 * @property {boolean}   INTER_TRIAL_LOADER
 * @property {string}    INTER_TRIAL_LOADER_MSG_TIMEOUT
 * @property {string}    INTER_TRIAL_LOADER_MSG_CLICK
 * @property {string}    QUALTRICS_EMBEDDED_FIELD
 * @property {string}    END_OF_TASK_TITLE
 * @property {string}    END_OF_TASK_MSG
 * @property {string}    STIMULI_URL                        - Must end with "/".
 * @property {Array<{id: string, fimi: string, non: string}>} STIMULI_PAIRS
 * @property {"fimi"|"non"} SELECT_TARGET                   - Which option counts as correct.
 * @property {boolean}   FOLLOW_UP_QUESTION_ENABLED
 * @property {Array<{key: string, question: string, labels: string[], embeddedFieldPrefix: string}>} FOLLOW_UP_QUESTIONS
 * @property {string}    POST_CHOICE_SUBMIT_LABEL
 * @property {boolean=}  CONFIDENCE_ENABLED                 - Deprecated alias for FOLLOW_UP_QUESTION_ENABLED.
 * @property {boolean|null} FORCE_TOUCH_MODE                - null = auto-detect.
 * @property {string}    TOUCH_SELECT_LABEL
 * @property {boolean}   TUTORIAL_ENABLED
 * @property {string}    TUTORIAL_FIMI
 * @property {string}    TUTORIAL_NON
 * @property {string}    TUTORIAL_HEADING
 * @property {string|null} TUTORIAL_INSTRUCTION             - null = auto-pick from SELECT_TARGET.
 * @property {string}    TUTORIAL_CORRECT_MSG
 * @property {string}    TUTORIAL_INCORRECT_MSG
 * @property {string}    TUTORIAL_TIMEOUT_MSG
 * @property {string}    TUTORIAL_SKIP_MSG
 * @property {string}    TUTORIAL_REDO_LABEL
 * @property {string}    TUTORIAL_START_LABEL
 */
const defaultSettings = {
  // UI text
  SHOW_SKIP_STIMULUS: true,
  SKIP_STIMULUS_LABEL: "I cannot decide – skip to next.",
  SHOW_LABEL_OVERLAY: false, // if true, prints a small overlay label on each image

  // Reveal behavior
  CONCEAL_UNTIL_HOVER: true, // if true, keep images hidden until hover/focus to capture decision dynamics

  // Timing
  MOUSE_RECORDING_INTERVAL: 100, // ms
  STIMULUS_TIMEOUT: 12000, // ms for each choice screen
  SHOW_TIMER: true, // show the circular countdown widget during timed trials (timeout still enforced when false)
  INTER_TRIAL_TIMEOUT: 3000, // ms for loader / fixation between trials
  INTER_TRIAL_LOADER: true,
  INTER_TRIAL_LOADER_MSG_TIMEOUT: "Too slow. Wait for the next two clippings to load.",
  INTER_TRIAL_LOADER_MSG_CLICK: "Your response is being recorded. Please wait for the next two clippings.",

  // Task / stimuli
  QUALTRICS_EMBEDDED_FIELD: "taskData",
  END_OF_TASK_TITLE: "",
  END_OF_TASK_MSG: "Your response is recorded. Click Next to continue.",

  // Where your images are hosted (must end with "/")
  STIMULI_URL: "https://thedataflowcompany.com/files/deconspirator/stimuli/",

  /**
   * Array of matched pairs. Each element is:
   *   { id: "01", fimi: "FIMI-01.jpg", non: "NonFIMI-01.jpg" }
   * You can generate multiple blocks (e.g., language variants) by swapping this array per survey block.
   */
  STIMULI_PAIRS: [
    { id: "01", fimi: "FIMI-01.jpg", non: "NonFIMI-01.jpg" },
    // { id: "02", fimi: "FIMI-02.jpg", non: "NonFIMI-02.jpg" },
    { id: "03", fimi: "FIMI-03.jpg", non: "NonFIMI-03.jpg" },
    { id: "04", fimi: "FIMI-04.jpg", non: "NonFIMI-04.jpg" },
    { id: "05", fimi: "FIMI-05.jpg", non: "NonFIMI-05.jpg" },
    { id: "06", fimi: "FIMI-06.jpg", non: "NonFIMI-06.jpg" },
    { id: "07", fimi: "FIMI-07.jpg", non: "NonFIMI-07.jpg" },
    { id: "08", fimi: "FIMI-08.jpg", non: "NonFIMI-08.jpg" },
  ],

  /**
   * Which option is considered the correct target? "non" (non-manipulated, default) or "fimi".
   */
  SELECT_TARGET: "non",

  // ---- Post-choice ratings (shown after each stimulus CLICK) ----
  FOLLOW_UP_QUESTION_ENABLED: true,
  FOLLOW_UP_QUESTIONS: [
    {
      key: "confidence",
      question: "How confident are you with your choice?",
      labels: [
        "Not at all confident",
        "Slightly confident",
        "Somewhat confident",
        "Moderately confident",
        "Quite confident",
        "Very confident",
        "Extremely confident",
      ],
      embeddedFieldPrefix: "confidence_fimi_",
    },
    {
      key: "reportManipulated",
      question: "Would you report this headline as manipulated to social media administrators?",
      labels: [
        "Not at all",
        "Very unlikely",
        "Unlikely",
        "Neither likely nor unlikely",
        "Somewhat likely",
        "Likely",
        "Very likely",
      ],
      embeddedFieldPrefix: "report_fimi_",
    },
    {
      key: "checkSources",
      question: "Would you check other sources to confirm whether the information in this headline is manipulated?",
      labels: [
        "Not at all",
        "Very unlikely",
        "Unlikely",
        "Neither likely nor unlikely",
        "Somewhat likely",
        "Likely",
        "Very likely",
      ],
      embeddedFieldPrefix: "check_sources_fimi_",
    },
  ],
  POST_CHOICE_SUBMIT_LABEL: "Continue",
  // Deprecated alias retained so older pasted task configs can still disable the whole follow-up screen.
  CONFIDENCE_ENABLED: undefined,

  // ---- Touch / mobile mode ----
  /**
   * Override touch-device detection.
   *   null  = auto-detect via media query (recommended; works for most deployments)
   *   true  = always use touch mode  (useful for testing on desktop)
   *   false = always use desktop mouse mode
   */
  FORCE_TOUCH_MODE: null,

  /**
   * Label for the confirmation button that appears in touch mode.
   * Participants tap a clipping to reveal it, then press this button to select it.
   * Update to match the survey language (e.g. "Diese Meldung auswählen" for German).
   */
  TOUCH_SELECT_LABEL: "Submit my choice",

  // ---- Tutorial ----
  /**
   * Set to false to skip the tutorial entirely.
   */
  TUTORIAL_ENABLED: true,

  /**
   * Filenames of the tutorial stimuli (must live in STIMULI_URL folder).
   */
  TUTORIAL_FIMI: "FIMI-Tutorial.jpg",
  TUTORIAL_NON: "NonFIMI-Tutorial.jpg",

  /** Banner heading label shown above the tutorial tiles. */
  TUTORIAL_HEADING: "Practice Round",

  /**
   * Instruction text inside the banner. Set to null to auto-pick based on SELECT_TARGET.
   * (null → "Hover to reveal each clipping, then click the one you think is manipulated …")
   */
  TUTORIAL_INSTRUCTION: null,

  /** Feedback messages shown after the participant makes a choice. */
  TUTORIAL_CORRECT_MSG: "Correct! You identified the manipulated clipping.",
  TUTORIAL_INCORRECT_MSG: "Not quite — that clipping was authentic. Try again or start the task.",
  TUTORIAL_TIMEOUT_MSG: "Time's up! In the real task, try to respond before the timer runs out.",

  /** Feedback shown when the participant skips during the tutorial. */
  TUTORIAL_SKIP_MSG: "You skipped this one. In the real task, try to make a choice when possible.",

  /** Labels for the two action buttons in the result card. */
  TUTORIAL_REDO_LABEL: "Try again",
  TUTORIAL_START_LABEL: "Start the task",
};

// Runtime state
let settings = {};
let qualtricsSurveyEngine = null;
let qualtricsQuestionData = null;
let taskData = [];
let _PAIRS = [];
let pairsQueue = [];

// Mouse tracking (desktop)
let mouseRecording = [];
let mousePosX = null;
let mousePosY = null;
let mouseHoverTarget = null;
let mouseRecordingIntervalId = null;

// Touch interaction (mobile)
let touchMode = false;
let touchFocusLog = [];

// Events
const EVENT_CLICK = "CLICK";
const EVENT_TIMEOUT = "TIMEOUT";
const EVENT_SKIP = "SKIP";

/***********************
 * PUBLIC ENTRY POINTS *
 ***********************/
async function startTask(qse = null, qqd = null, userSettings = {}) {
  settings = mergeSettings(userSettings);
  initTask(qse, qqd);
  initStimuli();
  disableNextButton();
  // Re-evaluate touch detection after the layout has had a chance to settle.
  // Qualtrics' addOnload sometimes fires before the mobile layout viewport is
  // finalised, so innerWidth and the pointer media queries can lie at init.
  await waitForLayoutSettled();
  if (settings.FORCE_TOUCH_MODE == null) {
    const recheck = resolveTouchMode("post-paint");
    if (recheck !== touchMode) {
      console.log("[deconspirator] touch mode changed after layout: " + touchMode + " -> " + recheck);
      touchMode = recheck;
      applyTouchModeClass();
    }
  }
  if (settings.TUTORIAL_ENABLED !== false) {
    await runTutorial();
  }
  await runTask();
  storeTaskData();
  enableNextButton();
}

function waitForLayoutSettled() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
  });
}

/********************
 * PURE HELPERS     *
 ********************/

/**
 * Merge user settings over defaults. Logs a console warning for keys not in
 * the schema — typo'd settings (e.g. CONCEAL_UNTIL_HOOVER) used to silently
 * no-op, which made misconfigured studies hard to debug. Unknown keys are
 * still passed through (we don't want to silently drop a key added on a fork).
 *
 * @param {Partial<Settings>} userSettings
 * @returns {Settings}
 */
function mergeSettings(userSettings) {
  const u = userSettings || {};
  const known = new Set(Object.keys(defaultSettings));
  const unknown = Object.keys(u).filter((k) => !known.has(k));
  if (unknown.length) {
    console.warn(
      "[deconspirator] unknown setting key(s) — possible typo? " +
      JSON.stringify(unknown) +
      ". Known keys: " + JSON.stringify([...known].sort())
    );
  }
  const merged = Object.assign({}, defaultSettings, u);
  if (
    Object.prototype.hasOwnProperty.call(u, "CONFIDENCE_ENABLED") &&
    !Object.prototype.hasOwnProperty.call(u, "FOLLOW_UP_QUESTION_ENABLED")
  ) {
    merged.FOLLOW_UP_QUESTION_ENABLED = Boolean(u.CONFIDENCE_ENABLED);
  }
  return merged;
}

/**
 * Validates and normalises the configured follow-up question list. The engine
 * uses these definitions for UI rendering, trial JSON keys, embedded-data
 * field names, and metadata, so invalid entries should fail before a survey
 * participant reaches the task.
 *
 * @param {Settings} s
 * @returns {Array<{key: string, question: string, labels: string[], embeddedFieldPrefix: string}>}
 */
function getFollowUpQuestions(s) {
  const source = (s || defaultSettings).FOLLOW_UP_QUESTIONS;
  if (!Array.isArray(source)) {
    throw new Error("FOLLOW_UP_QUESTIONS must be an array.");
  }
  return source.map((q, idx) => {
    if (!q || typeof q !== "object") {
      throw new Error("FOLLOW_UP_QUESTIONS[" + idx + "] must be an object.");
    }
    if (!q.key || typeof q.key !== "string") {
      throw new Error("FOLLOW_UP_QUESTIONS[" + idx + "].key must be a non-empty string.");
    }
    if (!q.question || typeof q.question !== "string") {
      throw new Error("FOLLOW_UP_QUESTIONS[" + idx + "].question must be a non-empty string.");
    }
    if (!Array.isArray(q.labels) || q.labels.length !== 7 || q.labels.some((label) => typeof label !== "string")) {
      throw new Error("FOLLOW_UP_QUESTIONS[" + idx + "].labels must contain 7 strings.");
    }
    if (!q.embeddedFieldPrefix || typeof q.embeddedFieldPrefix !== "string") {
      throw new Error("FOLLOW_UP_QUESTIONS[" + idx + "].embeddedFieldPrefix must be a non-empty string.");
    }
    return {
      key: q.key,
      question: q.question,
      labels: q.labels.slice(),
      embeddedFieldPrefix: q.embeddedFieldPrefix,
    };
  });
}

/**
 * Build a trial object. Pure (no DOM, no module state) so node:test can pin
 * the wire format. Every field here is consumed by data/check_data_quality.py
 * — see the JSDoc on storeTaskData for the canonical schema.
 *
 * @param {{
 *   event: "CLICK"|"TIMEOUT"|"SKIP",
 *   pair: {id: string},
 *   assignment: Array<{id: string, type: "fimi"|"non", side: "left"|"right", filename: string}>,
 *   chosen: {id: string, type: "fimi"|"non"} | null,
 *   mouseData: Array<object>,
 *   touchData: Array<object>,
 *   tsStart: number,
 *   tsEnd: number,
 *   followUpAnswers?: Record<string, number | null>,
 *   correctType: "fimi"|"non",
 * }} args
 */
function buildTrial(args) {
  const { event, pair, assignment, chosen, mouseData, touchData,
          tsStart, tsEnd, followUpAnswers, correctType } = args;
  const targetType = chosen ? chosen.type : null;
  const isCorrect = event === EVENT_CLICK ? targetType === correctType : false;
  const trial = {
    event,
    pairId: pair.id,
    assignment: assignment.map((a) => ({ id: a.id, type: a.type, side: a.side, filename: a.filename })),
    chosenId: chosen ? chosen.id : null,
    chosenType: targetType,
    isCorrect,
    tsStart: Math.round(tsStart),
    tsEnd: Math.round(tsEnd),
    rt: Math.round(tsEnd - tsStart),
    mouse: mouseData,
    touch: touchData,
  };
  Object.keys(followUpAnswers || {}).forEach((key) => {
    trial[key] = followUpAnswers[key];
  });
  return trial;
}

/**
 * JSON-safe meta object describing the engine config used for this session.
 * Written to <QUALTRICS_EMBEDDED_FIELD>_meta so check_data_quality.py can read
 * wire-format constants from data instead of redeclaring them. Keep in lockstep
 * with the keys consumed by reconcile_engine_meta() in the Python QC.
 */
function getEngineMeta(s) {
  s = s || (typeof settings !== "undefined" && settings && Object.keys(settings).length ? settings : defaultSettings);
  const expectedPairIds = (s.STIMULI_PAIRS || []).map((p) => p.id);
  const followUpQuestionEnabled = s.FOLLOW_UP_QUESTION_ENABLED !== false;
  const followUpQuestions = followUpQuestionEnabled ? getFollowUpQuestions(s) : [];
  const findFollowUpPrefix = (key) => {
    const item = followUpQuestions.find((q) => q.key === key);
    return item ? item.embeddedFieldPrefix : null;
  };
  return {
    engineVersion: ENGINE_VERSION,
    validEvents: [EVENT_CLICK, EVENT_TIMEOUT, EVENT_SKIP],
    validTypes: ["fimi", "non"],
    validSides: ["left", "right"],
    validConfidenceRange: [1, 7],
    stimulusTimeoutMs: s.STIMULUS_TIMEOUT,
    interTrialTimeoutMs: s.INTER_TRIAL_TIMEOUT,
    mouseRecordingIntervalMs: s.MOUSE_RECORDING_INTERVAL,
    expectedPairIds,
    expectedNTrials: expectedPairIds.length,
    confidenceFieldPrefix: findFollowUpPrefix("confidence"),
    reportFieldPrefix: findFollowUpPrefix("reportManipulated"),
    checkSourcesFieldPrefix: findFollowUpPrefix("checkSources"),
    postChoiceFields: followUpQuestions.map((q) => ({ key: q.key, fieldPrefix: q.embeddedFieldPrefix })),
    followUpQuestionEnabled,
    confidenceEnabled: followUpQuestionEnabled,
    selectTarget: (s.SELECT_TARGET || "").toLowerCase(),
    tutorialEnabled: s.TUTORIAL_ENABLED !== false,
    showSkipStimulus: !!s.SHOW_SKIP_STIMULUS,
    concealUntilHover: !!s.CONCEAL_UNTIL_HOVER,
    forceTouchMode: s.FORCE_TOUCH_MODE,
  };
}

/**********************
 * INITIALIZATION/DOM *
 **********************/
function initTask(qse, qqd) {
  qualtricsSurveyEngine = qse;
  qualtricsQuestionData = qqd;
  ensureViewportMeta();
  touchMode = resolveTouchMode("init");
  applyTouchModeClass();
  removeQualtricsAdvertising();
  initTaskDom();
}

/**
 * Mirror the resolved touchMode onto a body class so CSS can disable the
 * desktop :hover reveal whenever JS is using tap-to-reveal. Without this,
 * a narrow desktop window (where touchMode flips on but hover still works)
 * lets users tap one tile and hover the other, defeating the "one revealed
 * at a time" rule.
 */
function applyTouchModeClass() {
  if (typeof document === "undefined" || !document.body) return;
  document.body.classList.toggle("decon-touch-mode", Boolean(touchMode));
}

/**
 * Resolve touchMode from FORCE_TOUCH_MODE or auto-detect, capturing the raw
 * signals into touchModeDiagnostics so we can persist them with task data.
 * Called once in initTask and again on the next animation frame to recover
 * from incorrect viewport measurements at addOnload time.
 */
function resolveTouchMode(stage) {
  const forced = settings.FORCE_TOUCH_MODE;
  const autoDetected = isTouchPrimary();
  const resolved = forced != null ? Boolean(forced) : autoDetected;
  touchModeDiagnostics = {
    stage,
    forced,
    autoDetected,
    resolved,
    signals: readTouchSignals(),
    userAgent: navigator.userAgent,
  };
  console.log("[deconspirator] touch mode " + stage + ":", touchModeDiagnostics);
  return resolved;
}

/**
 * Some Qualtrics question contexts ship without a width=device-width viewport
 * meta, which makes Android Chrome render the page at its default ~980px
 * layout viewport. That breaks both the CSS pointer media queries and any
 * width-based JS gates. Inject a sane default if one is missing.
 */
function ensureViewportMeta() {
  if (typeof document === "undefined") return;
  if (document.querySelector('meta[name="viewport"]')) return;
  const meta = document.createElement("meta");
  meta.name = "viewport";
  meta.content = "width=device-width, initial-scale=1";
  document.head.appendChild(meta);
}

function initTaskDom() {
  const root = document.getElementById("task");
  if (!root) {
    const container = document.createElement("div");
    container.id = "task";
    document.body.appendChild(container);
  }
  const task = document.getElementById("task");

  // Clear existing content to be safe
  task.innerHTML = "";

  // Text/loader area
  const textWrapper = document.createElement("div");
  textWrapper.id = "text-wrapper";
  task.appendChild(textWrapper);

  // Timer area (populated during timed trials)
  const timerArea = document.createElement("div");
  timerArea.id = "timer-area";
  task.appendChild(timerArea);

  // Stimuli area
  const stimuliWrapper = document.createElement("div");
  stimuliWrapper.id = "stimuli-wrapper";
  task.appendChild(stimuliWrapper);
}

function removeQualtricsAdvertising() {
  const e = document.getElementById("Plug");
  if (e) e.remove();
}

function disableNextButton() {
  if (qualtricsQuestionData) qualtricsQuestionData.disableNextButton();
}

function enableNextButton() {
  if (qualtricsQuestionData) qualtricsQuestionData.enableNextButton();
}

/****************
 * STIMULI LOGIC *
 ****************/
function validateStimuliPairs(pairs) {
  if (!Array.isArray(pairs)) throw new Error("STIMULI UNREADABLE: STIMULI_PAIRS must be an array.");
  pairs.forEach((p) => {
    const hasId = Object.prototype.hasOwnProperty.call(p, "id") && p.id;
    const hasFimi = Object.prototype.hasOwnProperty.call(p, "fimi") && p.fimi;
    const hasNon = Object.prototype.hasOwnProperty.call(p, "non") && p.non;
    if (!hasId || !hasFimi || !hasNon) {
      throw new Error("STIMULI INVALID: Each pair must have 'id', 'fimi', and 'non'.");
    }
  });
}

function initStimuli() {
  validateStimuliPairs(settings.STIMULI_PAIRS);
  _PAIRS = Object.freeze(settings.STIMULI_PAIRS.map((p) => ({ ...p })));
  pairsQueue = shuffle(_PAIRS);
  // Preload all images for smoother UX
  preloadImages(pairsQueue);
  // Preload tutorial images
  if (settings.TUTORIAL_ENABLED !== false) {
    [settings.TUTORIAL_FIMI, settings.TUTORIAL_NON].filter(Boolean).forEach((f) => {
      const img = new Image();
      img.src = settings.STIMULI_URL + f;
    });
  }
}

function preloadImages(pairs) {
  const urls = [];
  pairs.forEach((p) => {
    urls.push(settings.STIMULI_URL + p.fimi);
    urls.push(settings.STIMULI_URL + p.non);
  });
  urls.forEach((u) => {
    const img = new Image();
    img.src = u;
  });
}

/*******************
 * TASK FLOW / LOOP *
 *******************/
async function runTask() {
  while (pairsQueue.length) {
    const pair = pairsQueue.shift();
    const clicked = await presentPairAndAwaitResponse(pair);

    // Inter-trial screen
    if (settings.INTER_TRIAL_TIMEOUT > 0) {
      if (settings.INTER_TRIAL_LOADER) {
        presentLoaderText(clicked);
      } else {
        presentText("+");
      }
      await wait(settings.INTER_TRIAL_TIMEOUT);
      removeAllText();
    }
  }

  // End of task
  presentText(settings.END_OF_TASK_TITLE, settings.END_OF_TASK_MSG);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/*********************
 * PRESENTATION LAYER *
 *********************/
function presentPairAndAwaitResponse(pair) {
  const stimuliWrapper = document.getElementById("stimuli-wrapper");
  clearStimuli();

  // Randomize left/right assignment for this pair
  const assignment = Math.random() < 0.5
    ? [
        { type: "fimi", filename: pair.fimi, id: `${pair.id}-FIMI`, side: "left" },
        { type: "non", filename: pair.non, id: `${pair.id}-NON`, side: "right" },
      ]
    : [
        { type: "non", filename: pair.non, id: `${pair.id}-NON`, side: "left" },
        { type: "fimi", filename: pair.fimi, id: `${pair.id}-FIMI`, side: "right" },
      ];

  // Touch mode: create the select button first so tile handlers can reference it
  const selectBtn = (touchMode && settings.CONCEAL_UNTIL_HOVER) ? createSelectButton() : null;

  // Build DOM elements
  const left = createStimulusDomEl(assignment[0], selectBtn);
  const right = createStimulusDomEl(assignment[1], selectBtn);

  // Optional SKIP element
  const skip = settings.SHOW_SKIP_STIMULUS ? createSkipDomEl() : null;

  // Prepare event promises:
  //   Touch + concealment  → tiles reveal on tap; a separate confirm button selects
  //   Touch + no conceal   → tiles always visible; direct tap selects (like desktop)
  //   Desktop              → direct click on tile selects
  const responders = [];
  if (settings.STIMULUS_TIMEOUT > 0) responders.push(createTimeoutHandler());
  if (selectBtn) {
    responders.push(attachAsyncSelectHandler(selectBtn));
  } else {
    responders.push(attachAsyncClickHandler(left));
    responders.push(attachAsyncClickHandler(right));
  }
  if (skip) responders.push(attachAsyncClickHandler(skip, EVENT_SKIP));

  // Countdown timer widget (visual only – duration matches createTimeoutHandler)
  const _trialTimer = (settings.SHOW_TIMER !== false && settings.STIMULUS_TIMEOUT > 0)
    ? createTimerWidget(settings.STIMULUS_TIMEOUT)
    : null;

  // Mount to DOM and start recording on the next frame to sync timestamps
  let tsStart = null;
  window.requestAnimationFrame((ts) => {
    stimuliWrapper.appendChild(left);
    stimuliWrapper.appendChild(right);
    if (selectBtn) stimuliWrapper.appendChild(selectBtn);
    if (skip) stimuliWrapper.appendChild(skip);
    if (_trialTimer) {
      const _ta = document.getElementById("timer-area");
      if (_ta) { _ta.replaceChildren(_trialTimer.el); }
      _trialTimer.start();
    }
    startDataRecording();
    tsStart = ts;
  });

  // Race events
  return Promise.race(responders).then(async ({ event, targetId, timestamp }) => {
    stopDataRecording();
    if (_trialTimer) _trialTimer.stop();

    const chosen = assignment.find((a) => a.id === targetId) || null;
    const correctType = settings.SELECT_TARGET.toLowerCase() === "fimi" ? "fimi" : "non";

    // Capture both attention data streams (mouse trajectory + touch focus log).
    // Both are always recorded; on pure-mouse devices touch will be empty and vice versa.
    const mouseData = getMouseRecording();
    const touchData = [...touchFocusLog];
    clearMouseRecording();
    touchFocusLog = [];

    // Clear stimuli (post-choice widget may follow)
    clearStimuli();
    const _tac = document.getElementById("timer-area");
    if (_tac) _tac.replaceChildren();

    // Post-choice ratings: shown only when participant made a stimulus choice.
    const followUpQuestions = settings.FOLLOW_UP_QUESTION_ENABLED !== false
      ? getFollowUpQuestions(settings)
      : [];
    let followUpAnswers = {};
    followUpQuestions.forEach(function(question) {
      followUpAnswers[question.key] = null;
    });
    if (followUpQuestions.length > 0 && event === EVENT_CLICK) {
      const ratings = await presentPostChoiceWidget(followUpQuestions);
      followUpAnswers = ratings;
      followUpQuestions.forEach(function(question) {
        storeEmbeddedData(question.embeddedFieldPrefix + pair.id, String(ratings[question.key]));
      });
    } else if (followUpQuestions.length > 0) {
      const sentinel = event === EVENT_SKIP ? "skip" : "timeout";
      followUpQuestions.forEach(function(question) {
        storeEmbeddedData(question.embeddedFieldPrefix + pair.id, sentinel);
      });
    }

    const trial = buildTrial({
      event,
      pair,
      assignment,
      chosen,
      mouseData,
      touchData,
      tsStart,
      tsEnd: timestamp,
      followUpAnswers,
      correctType,
    });

    taskData.push(trial);

    return event; // returned to inform inter-trial message
  });
}

function createStimulusDomEl(stim, selectBtn = null) {
  const el = document.createElement("div");
  el.className = "stimulus";
  if (settings.CONCEAL_UNTIL_HOVER) {
    el.classList.add("conceal-until-hover");
  }
  el.id = stim.id;
  el.setAttribute("data-type", stim.type);
  el.setAttribute("data-side", stim.side);
  el.style.backgroundImage = `url(${settings.STIMULI_URL}${stim.filename})`;

  // Optional overlay label (useful for debugging)
  if (settings.SHOW_LABEL_OVERLAY) {
    const lab = document.createElement("label");
    lab.setAttribute("for", stim.id);
    lab.innerText = `${stim.type.toUpperCase()}`;
    el.appendChild(lab);
  }

  // Always attach mouse handlers for hover-target tracking (data recording).
  // In touch mode with concealment, also attach tap-to-reveal behaviour.
  attachMouseHandlers(el);
  if (touchMode && settings.CONCEAL_UNTIL_HOVER) {
    attachTouchRevealHandler(el, selectBtn);
  }
  return el;
}

function createSkipDomEl() {
  const el = document.createElement("div");
  el.className = "stimulus-skip";
  el.id = "skip-elem";
  const lab = document.createElement("label");
  lab.setAttribute("for", "stimulus-skip");
  lab.innerText = settings.SKIP_STIMULUS_LABEL;
  el.appendChild(lab);
  attachMouseHandlers(el);
  return el;
}

function clearStimuli() {
  const wrapper = document.getElementById("stimuli-wrapper");
  if (wrapper) wrapper.innerHTML = "";
}

function presentText(title, body = "") {
  const textWrapper = document.getElementById("text-wrapper");
  textWrapper.classList.add("visible");
  const h = document.createElement("h1");
  h.textContent = title || "";
  const p = document.createElement("p");
  p.textContent = body || "";
  textWrapper.appendChild(h);
  textWrapper.appendChild(p);
}

function presentLoaderText(lastEvent) {
  const textWrapper = document.getElementById("text-wrapper");
  textWrapper.classList.add("visible");
  const spinner = document.createElement("span");
  spinner.classList.add("spinner-dual-ring");
  const msg = document.createElement("div");
  msg.textContent = (lastEvent === EVENT_CLICK || lastEvent === EVENT_SKIP) ? settings.INTER_TRIAL_LOADER_MSG_CLICK : settings.INTER_TRIAL_LOADER_MSG_TIMEOUT;
  textWrapper.appendChild(spinner);
  textWrapper.appendChild(msg);
}

function removeAllText() {
  const textWrapper = document.getElementById("text-wrapper");
  textWrapper.classList.remove("visible");
  textWrapper.innerHTML = "";
}

/*******************
 * EVENT UTILITIES  *
 *******************/
function attachMouseHandlers(el) {
  el.addEventListener("mouseleave", (e) => {
    if (mouseHoverTarget === e.target.id) mouseHoverTarget = null;
  });
  el.addEventListener("mouseenter", (e) => {
    mouseHoverTarget = e.target.id;
    mousePosX = e.pageX;
    mousePosY = e.pageY;
  });
}

function attachAsyncClickHandler(el, overrideEventName = EVENT_CLICK) {
  return new Promise((resolve) => {
    el.addEventListener("click", () => {
      resolve({ event: overrideEventName, targetId: el.id, timestamp: performance.now() });
    });
  });
}

function createTimeoutHandler() {
  return new Promise((resolve) => {
    const to = setTimeout(() => {
      resolve({ event: EVENT_TIMEOUT, targetId: null, timestamp: performance.now() });
    }, settings.STIMULUS_TIMEOUT);
    // If a click occurs, the winning promise resolves first and we won't clearTimeout here; harmless.
  });
}

function startDataRecording() {
  // Always reset both data streams so both are captured regardless of mode.
  // On hybrid devices (touchscreen laptops) this ensures no data is lost.
  touchFocusLog = [];
  mousePosX = null;
  mousePosY = null;
  mouseHoverTarget = null;
  window.addEventListener("mousemove", _updateMousePos, { passive: true });
  mouseRecordingIntervalId = setInterval(_doDataRecording, settings.MOUSE_RECORDING_INTERVAL);
}

function stopDataRecording() {
  window.removeEventListener("mousemove", _updateMousePos);
  clearInterval(mouseRecordingIntervalId);
}

function _updateMousePos(e) {
  mousePosX = e.pageX;
  mousePosY = e.pageY;
}

function _doDataRecording() {
  // Only record if the mouse has actually moved (avoids empty samples on
  // pure-touch devices where mousemove never fires).
  if (mousePosX == null && mousePosY == null) return;
  mouseRecording.push({
    ts: Math.round(performance.now()),
    pageX: mousePosX,
    pageY: mousePosY,
    hovTarg: mouseHoverTarget,
  });
}

function getMouseRecording() {
  return mouseRecording;
}

function clearMouseRecording() {
  mouseRecording = [];
}

/*****************
 * MISC UTILITIES *
 *****************/
function shuffle(arr) {
  const a = [...arr];
  let n = a.length;
  while (n) {
    const i = Math.floor(Math.random() * n--);
    const tmp = a[n];
    a[n] = a[i];
    a[i] = tmp;
  }
  return a;
}

/**
 * Serialises all trial data to Qualtrics embedded data.
 *
 * ─── Primary field ───────────────────────────────────────────────────────────
 * Field : settings.QUALTRICS_EMBEDDED_FIELD  (default: "taskData")
 * Value : JSON-encoded array — one object per trial:
 *
 * {
 *   event      : "CLICK" | "TIMEOUT" | "SKIP"
 *   pairId     : string          // e.g. "01"
 *   assignment : [               // randomised left/right mapping for this trial
 *     { id: string, type: "fimi"|"non", side: "left"|"right", filename: string }
 *   ]
 *   chosenId   : string | null   // id of selected tile ("01-FIMI" / "01-NON"), null on timeout/skip
 *   chosenType : "fimi" | "non" | null
 *   isCorrect  : boolean         // true if chosenType === settings.SELECT_TARGET
 *   // One key per settings.FOLLOW_UP_QUESTIONS entry when enabled:
 *   confidence : number | null
 *   reportManipulated : number | null
 *   checkSources : number | null
 *   tsStart    : number          // performance.now() ms at stimulus onset
 *   tsEnd      : number          // performance.now() ms at response
 *   rt         : number          // response time ms  (tsEnd − tsStart)
 *
 *   // ── Mouse trajectory ─────────────────────────────────────────────────────
 *   // Always recorded. Populated when a mouse/trackpad is used; empty on
 *   // pure-touch devices where no mousemove events fire.
 *   mouse : [
 *     {
 *       ts      : number          // performance.now() snapshot (sampled every MOUSE_RECORDING_INTERVAL ms)
 *       pageX   : number | null   // cursor X coordinate relative to page
 *       pageY   : number | null   // cursor Y coordinate relative to page
 *       hovTarg : string | null   // id of element under cursor ("01-FIMI", "01-NON", "skip-elem"), or null
 *     }
 *   ]
 *
 *   // ── Touch focus log ─────────────────────────────────────────────────────
 *   // Always recorded. Populated when tap-to-reveal is used (touch mode);
 *   // empty on pure-mouse devices. One entry per tap event: reveals and
 *   // conceals are both logged, so dwell time = Σ(conceal.ts − preceding
 *   // reveal.ts) per target.
 *   touch : [
 *     {
 *       ts     : number           // performance.now() of the tap
 *       target : string           // id of the tile ("01-FIMI" / "01-NON")
 *       event  : "reveal" | "conceal"
 *     }
 *   ]
 * }
 *
 * ─── Per-pair post-choice rating fields ──────────────────────────────────────
 * Field : question.embeddedFieldPrefix + pairId for each configured follow-up question
 *         e.g. "confidence_fimi_01", "confidence_fimi_02", …
 * Value : "1"–"7"  (Likert rating chosen by participant)
 *       | "skip"    (participant skipped this pair)
 *       | "timeout" (no response within STIMULUS_TIMEOUT)
 *
 * ─── Engine meta field ───────────────────────────────────────────────────────
 * Field : settings.QUALTRICS_EMBEDDED_FIELD + "_meta"   (default: "taskData_meta")
 * Value : JSON-encoded object — getEngineMeta(settings). Includes engineVersion,
 *         validEvents/Types/Sides, expectedPairIds, stimulusTimeoutMs,
 *         confidenceFieldPrefix, etc. Read by check_data_quality.py to source
 *         wire-format constants from data instead of hardcoding them.
 *
 * ─── Diagnostics field ───────────────────────────────────────────────────────
 * Field : settings.QUALTRICS_EMBEDDED_FIELD + "_diagnostics"
 * Value : JSON-encoded { touchMode, touchModeDiagnostics } — input signals
 *         used for touch-mode resolution. Useful when investigating ambiguous
 *         field reports on hybrid devices.
 */
function storeTaskData() {
  const diagnostics = { touchMode, touchModeDiagnostics };
  const meta = getEngineMeta(settings);
  if (qualtricsSurveyEngine && typeof qualtricsSurveyEngine.setEmbeddedData === "function") {
    qualtricsSurveyEngine.setEmbeddedData(settings.QUALTRICS_EMBEDDED_FIELD, JSON.stringify(taskData));
    qualtricsSurveyEngine.setEmbeddedData(settings.QUALTRICS_EMBEDDED_FIELD + "_diagnostics", JSON.stringify(diagnostics));
    qualtricsSurveyEngine.setEmbeddedData(settings.QUALTRICS_EMBEDDED_FIELD + "_meta", JSON.stringify(meta));
    console.log(`Task data stored in Qualtrics embedded data [${settings.QUALTRICS_EMBEDDED_FIELD}] (engine ${ENGINE_VERSION})`);
  } else {
    console.warn("Task data not stored in Qualtrics (SurveyEngine not available). Logging to console.");
    console.log("Task data:", taskData);
    console.log("Touch diagnostics:", diagnostics);
    console.log("Engine meta:", meta);
  }
}

function storeEmbeddedData(field, value) {
  if (qualtricsSurveyEngine && typeof qualtricsSurveyEngine.setEmbeddedData === "function") {
    qualtricsSurveyEngine.setEmbeddedData(field, value);
  } else {
    console.log(`[DEMO] Embedded data: ${field} = ${value}`);
  }
}

/*************************
 * TOUCH INTERACTION MODE *
 *************************/

/**
 * Returns true when the device is primarily touch-operated (phone / tablet).
 *
 * Uses an OR-of-signals approach: any one of (touch points, ontouchstart,
 * any-pointer:coarse, hover:none, narrow viewport) is enough to flip into
 * touch mode. Earlier versions AND-ed these signals, which silently failed
 * inside the Qualtrics mobile shell when a single signal misreported (e.g.
 * innerWidth measured before the layout viewport settled).
 */
function isTouchPrimary() {
  const signals = readTouchSignals();
  return (
    signals.maxTouchPoints ||
    signals.ontouchstart ||
    signals.anyPointerCoarse ||
    signals.hoverNone ||
    signals.narrowViewport
  );
}

/**
 * Snapshot of every input signal we use for touch detection. Stored on the
 * last trial's data and logged on startup so ambiguous field reports can be
 * diagnosed from the recorded payload alone.
 */
function readTouchSignals() {
  return {
    maxTouchPoints: (navigator.maxTouchPoints || 0) > 0,
    ontouchstart: "ontouchstart" in window,
    anyPointerCoarse: window.matchMedia("(any-pointer: coarse)").matches,
    hoverNone: window.matchMedia("(hover: none)").matches,
    pointerCoarse: window.matchMedia("(pointer: coarse)").matches,
    narrowViewport: window.innerWidth <= 768,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
  };
}

let touchModeDiagnostics = null;

/**
 * Attaches tap-to-reveal / tap-to-conceal behaviour to a stimulus tile.
 *
 * Rules:
 *   • Tapping a concealed tile reveals it and conceals the other tile (only
 *     one clipping is visible at a time, mirroring the desktop hover rule).
 *   • Tapping an already-revealed tile conceals it (participant can "put it
 *     back" before making a decision).
 *   • The select button is enabled only while exactly one tile is revealed;
 *     its dataset.targetId always reflects the currently visible tile.
 *
 * Every reveal/conceal tap is logged to touchFocusLog via recordTouchFocus(),
 * allowing dwell time and switching behaviour to be computed in analysis.
 */
function attachTouchRevealHandler(el, selectBtn) {
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    const isRevealed = el.classList.contains("touch-revealed");

    // Conceal any other currently revealed tile
    document.querySelectorAll(".stimulus.touch-revealed").forEach((other) => {
      if (other !== el) {
        other.classList.remove("touch-revealed");
        recordTouchFocus(other.id, "conceal");
      }
    });

    if (isRevealed) {
      // Toggle off: conceal this tile
      el.classList.remove("touch-revealed");
      recordTouchFocus(el.id, "conceal");
      if (selectBtn) {
        selectBtn.disabled = true;
        selectBtn.dataset.targetId = "";
      }
    } else {
      // Reveal this tile
      el.classList.add("touch-revealed");
      recordTouchFocus(el.id, "reveal");
      if (selectBtn) {
        selectBtn.disabled = false;
        selectBtn.dataset.targetId = el.id;
      }
    }
  });
}

/**
 * Creates the "Select this clipping" confirmation button used in touch mode.
 * Initially disabled; enabled by attachTouchRevealHandler when a tile is revealed.
 * Resolves the trial promise via attachAsyncSelectHandler when clicked.
 */
function createSelectButton() {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "touch-select-btn";
  btn.id = "touch-select-btn";
  btn.textContent = settings.TOUCH_SELECT_LABEL;
  btn.disabled = true;
  btn.dataset.targetId = "";
  btn.setAttribute("aria-label", "Confirm the currently visible clipping as your answer");
  return btn;
}

/**
 * Returns a promise that resolves when the select button is clicked.
 * Reads the confirmed tile ID from btn.dataset.targetId (kept current by
 * attachTouchRevealHandler), so the resolution carries the correct targetId
 * even if the participant switched tiles multiple times before confirming.
 */
function attachAsyncSelectHandler(btn) {
  return new Promise((resolve) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.targetId || null;
      resolve({ event: EVENT_CLICK, targetId, timestamp: performance.now() });
    });
  });
}

/**
 * Appends a touch focus event to the per-trial log.
 * @param {string} targetId - Element ID of the tile ("01-FIMI" / "01-NON")
 * @param {"reveal"|"conceal"} event - Whether the tile became visible or hidden
 */
function recordTouchFocus(targetId, event) {
  touchFocusLog.push({ ts: Math.round(performance.now()), target: targetId, event });
}

/*********************
 * POST-CHOICE WIDGET *
 *********************/
/**
 * Renders the post-choice Likert screen in the stimuli wrapper. The ratings
 * share one submit button so participants can revise answers before advancing;
 * this is especially important on touch devices where accidental taps are more
 * common than mouse clicks.
 *
 * @param {Array<{key: string, question: string, labels: string[]}>} items
 * @returns {Promise<Record<string, number>>}
 */
function presentPostChoiceWidget(items) {
  return new Promise((resolve) => {
    const wrapper = document.getElementById("stimuli-wrapper");
    const answers = {};

    const card = document.createElement("div");
    card.className = "confidence-widget";

    items.forEach(function(item) {
      answers[item.key] = null;
    });

    const submit = document.createElement("button");
    submit.type = "button";
    submit.className = "post-choice-submit";
    submit.textContent = settings.POST_CHOICE_SUBMIT_LABEL;
    submit.disabled = true;

    function updateSubmitState() {
      submit.disabled = !items.every(function(item) {
        return typeof answers[item.key] === "number";
      });
    }

    items.forEach(function(item) {
      card.appendChild(createLikertItem(item, answers, updateSubmitState));
    });

    submit.addEventListener("click", function() {
      if (submit.disabled) return;
      submit.disabled = true;
      card.querySelectorAll(".confidence-btn").forEach(function(b) { b.disabled = true; });
      setTimeout(function() {
        wrapper.replaceChildren();
        resolve(Object.assign({}, answers));
      }, 220);
    });

    card.appendChild(submit);
    wrapper.appendChild(card);

    requestAnimationFrame(function() { card.classList.add("visible"); });
  });
}

/**
 * Builds one labelled 1-7 Likert row. Keeping this small prevents the
 * three-question screen from diverging into subtly different keyboard or
 * touch behaviour across questions.
 */
function createLikertItem(item, answers, onChange) {
  const block = document.createElement("div");
  block.className = "post-choice-item";

  const question = document.createElement("p");
  question.className = "confidence-question";
  question.textContent = item.question;
  block.appendChild(question);

  const scale = document.createElement("div");
  scale.className = "confidence-scale";

  const buttonsRow = document.createElement("div");
  buttonsRow.className = "confidence-buttons";
  buttonsRow.setAttribute("role", "group");
  buttonsRow.setAttribute("aria-label", item.question);

  for (let i = 1; i <= 7; i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "confidence-btn";
    btn.textContent = String(i);
    btn.setAttribute("aria-label", i + " \u2013 " + item.labels[i - 1]);
    btn.setAttribute("title", item.labels[i - 1]);

    btn.addEventListener("click", function() {
      answers[item.key] = i;
      buttonsRow.querySelectorAll(".confidence-btn").forEach(function(b) { b.classList.remove("selected"); });
      btn.classList.add("selected");
      onChange();
    });

    buttonsRow.appendChild(btn);
  }

  scale.appendChild(buttonsRow);

  const labelsRow = document.createElement("div");
  labelsRow.className = "confidence-endpoint-labels";
  const leftLabel = document.createElement("span");
  leftLabel.textContent = item.labels[0];
  const rightLabel = document.createElement("span");
  rightLabel.textContent = item.labels[6];
  labelsRow.appendChild(leftLabel);
  labelsRow.appendChild(rightLabel);
  scale.appendChild(labelsRow);

  block.appendChild(scale);
  return block;
}

/***************************
 * COUNTDOWN TIMER WIDGET  *
 ***************************/

/**
 * Creates a circular SVG countdown timer.
 * Returns { el, start, stop, reset }.
 *   el    – DOM element to mount wherever needed
 *   start – begin counting down from full
 *   stop  – freeze the visual on response (dims the ring)
 *   reset – return to full (used for tutorial redo)
 */
function createTimerWidget(totalMs) {
  const RADIUS = 18;
  const CIRC = 2 * Math.PI * RADIUS;

  const wrap = document.createElement("div");
  wrap.className = "countdown-timer";
  wrap.setAttribute("aria-hidden", "true");

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 44 44");

  const bgCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  bgCircle.setAttribute("class", "countdown-ring-bg");
  bgCircle.setAttribute("cx", "22");
  bgCircle.setAttribute("cy", "22");
  bgCircle.setAttribute("r", String(RADIUS));

  const fgCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  fgCircle.setAttribute("class", "countdown-ring-fg");
  fgCircle.setAttribute("cx", "22");
  fgCircle.setAttribute("cy", "22");
  fgCircle.setAttribute("r", String(RADIUS));
  fgCircle.style.strokeDasharray = String(CIRC);
  fgCircle.style.strokeDashoffset = "0";

  svg.appendChild(bgCircle);
  svg.appendChild(fgCircle);

  const label = document.createElement("span");
  label.className = "countdown-timer-label";
  label.textContent = String(Math.ceil(totalMs / 1000));

  wrap.appendChild(svg);
  wrap.appendChild(label);

  let startTs = null;
  let intervalId = null;
  let active = false;

  function _tick() {
    if (!active) return;
    const elapsed = performance.now() - startTs;
    const remaining = Math.max(0, totalMs - elapsed);
    const progress = remaining / totalMs;
    fgCircle.style.strokeDashoffset = String(CIRC * (1 - progress));
    label.textContent = String(Math.ceil(remaining / 1000));
    // colour shifts green → yellow → red
    const hue = Math.round(progress * 120);
    fgCircle.style.stroke = "hsl(" + hue + ", 65%, 42%)";
    if (remaining <= 0) stop();
  }

  function start() {
    startTs = performance.now();
    active = true;
    wrap.classList.remove("timer-stopped");
    intervalId = setInterval(_tick, 80);
  }

  function stop() {
    active = false;
    clearInterval(intervalId);
    wrap.classList.add("timer-stopped");
  }

  function reset() {
    stop();
    active = false;
    fgCircle.style.strokeDashoffset = "0";
    fgCircle.style.stroke = "";
    label.textContent = String(Math.ceil(totalMs / 1000));
    wrap.classList.remove("timer-stopped");
  }

  return { el: wrap, start, stop, reset };
}

/***********************
 * TUTORIAL FLOW        *
 ***********************/

/**
 * Runs one or more tutorial trials until the participant clicks "Start the task".
 * Tutorial data is intentionally NOT saved to Qualtrics.
 */
async function runTutorial() {
  let action;
  do {
    action = await _presentTutorialTrial();
  } while (action !== "start");
  clearStimuli();
  const ta = document.getElementById("timer-area");
  if (ta) ta.replaceChildren();
  removeAllText();
}

/**
 * Renders one practice trial.
 * Resolves with "redo" (try again) or "start" (proceed to main task).
 */
async function _presentTutorialTrial() {
  const stimuliWrapper = document.getElementById("stimuli-wrapper");
  const timerArea = document.getElementById("timer-area");
  clearStimuli();
  if (timerArea) timerArea.replaceChildren();

  const fimiFile = settings.TUTORIAL_FIMI || "FIMI-Tutorial.jpg";
  const nonFile  = settings.TUTORIAL_NON  || "NonFIMI-Tutorial.jpg";

  // Randomise left/right placement each attempt
  const assignment = Math.random() < 0.5
    ? [
        { type: "fimi", filename: fimiFile, id: "tut-FIMI", side: "left"  },
        { type: "non",  filename: nonFile,  id: "tut-NON",  side: "right" },
      ]
    : [
        { type: "non",  filename: nonFile,  id: "tut-NON",  side: "left"  },
        { type: "fimi", filename: fimiFile, id: "tut-FIMI", side: "right" },
      ];

  // Instruction banner (spans both grid columns)
  const banner = _createTutorialBanner();
  stimuliWrapper.appendChild(banner);

  // Tiles – reuse the exact same DOM builder as main trials
  const selectBtn = (touchMode && settings.CONCEAL_UNTIL_HOVER) ? createSelectButton() : null;
  const leftEl    = createStimulusDomEl(assignment[0], selectBtn);
  const rightEl   = createStimulusDomEl(assignment[1], selectBtn);
  stimuliWrapper.appendChild(leftEl);
  stimuliWrapper.appendChild(rightEl);
  if (selectBtn) stimuliWrapper.appendChild(selectBtn);

  // Optional skip button (mirrors main task behaviour)
  const skip = settings.SHOW_SKIP_STIMULUS ? createSkipDomEl() : null;
  if (skip) stimuliWrapper.appendChild(skip);

  // Timer
  const tutMs = settings.STIMULUS_TIMEOUT > 0 ? settings.STIMULUS_TIMEOUT : 0;
  const timer = (tutMs > 0 && settings.SHOW_TIMER !== false) ? createTimerWidget(tutMs) : null;
  if (timer && timerArea) {
    timerArea.appendChild(timer.el);
    timer.start();
  }

  startDataRecording(); // mouse/touch data is captured but discarded for tutorial

  // Build response promise race (same pattern as main task)
  const responders = [];
  if (tutMs > 0) {
    responders.push(new Promise((resolve) => {
      setTimeout(
        () => resolve({ event: EVENT_TIMEOUT, targetId: null, timestamp: performance.now() }),
        tutMs
      );
    }));
  }
  if (selectBtn) {
    responders.push(attachAsyncSelectHandler(selectBtn));
  } else {
    responders.push(attachAsyncClickHandler(leftEl));
    responders.push(attachAsyncClickHandler(rightEl));
  }
  if (skip) responders.push(attachAsyncClickHandler(skip, EVENT_SKIP));

  const { event, targetId } = await Promise.race(responders);

  stopDataRecording();
  clearMouseRecording();
  touchFocusLog = [];
  if (timer) timer.stop();

  // Evaluate result
  const correctType = settings.SELECT_TARGET.toLowerCase() === "fimi" ? "fimi" : "non";
  const chosen      = assignment.find((a) => a.id === targetId) || null;
  const isCorrect   = event === EVENT_CLICK && chosen !== null && chosen.type === correctType;

  // Permanently reveal both tiles so participant can compare
  _revealAllStimulusTiles();
  if (event === EVENT_CLICK) {
    _applyTutorialHighlights(chosen, assignment, isCorrect, correctType);
  }

  // Remove banner (tiles stay visible as reference)
  banner.remove();

  // Show result card and wait for participant's choice
  const action = await _presentTutorialResult(event, isCorrect, stimuliWrapper);
  return action; // "redo" | "start"
}

/** Instruction banner that spans both grid columns at the top of the stimuli area. */
function _createTutorialBanner() {
  const banner = document.createElement("div");
  banner.className = "tutorial-banner";

  const textDiv = document.createElement("div");
  textDiv.className = "tutorial-banner__text";

  const heading = document.createElement("span");
  heading.className = "tutorial-banner__heading";
  heading.textContent = settings.TUTORIAL_HEADING || "Practice Round";

  const defaultInstruction = settings.SELECT_TARGET && settings.SELECT_TARGET.toLowerCase() === "non"
    ? "Hover over each clipping to reveal it, then click the one you think is authentic."
    : "Hover over each clipping to reveal it, then click the one you think is manipulated by a foreign actor.";

  const instruction = document.createElement("p");
  instruction.className = "tutorial-banner__instruction";
  instruction.textContent = settings.TUTORIAL_INSTRUCTION || defaultInstruction;

  textDiv.appendChild(heading);
  textDiv.appendChild(instruction);
  banner.appendChild(textDiv);
  return banner;
}

/**
 * Shows a result card with feedback and two action buttons.
 * Resolves with "redo" or "start".
 */
function _presentTutorialResult(event, isCorrect, wrapper) {
  return new Promise((resolve) => {
    const card = document.createElement("div");
    card.className = "tutorial-result";

    const iconEl = document.createElement("div");
    iconEl.className = "tutorial-result__icon";

    const msgEl = document.createElement("p");
    msgEl.className = "tutorial-result__msg";

    if (event === EVENT_SKIP) {
      iconEl.textContent = "\u2192"; // →
      iconEl.classList.add("skip");
      msgEl.textContent = settings.TUTORIAL_SKIP_MSG
        || "You skipped this one. In the real task, try to make a choice when possible.";
    } else if (event === EVENT_TIMEOUT) {
      iconEl.textContent = "\u23F1"; // ⏱
      iconEl.classList.add("timeout");
      msgEl.textContent = settings.TUTORIAL_TIMEOUT_MSG
        || "Time\u2019s up! In the real task, try to respond before the timer runs out.";
    } else if (isCorrect) {
      iconEl.textContent = "\u2713"; // ✓
      iconEl.classList.add("correct");
      msgEl.textContent = settings.TUTORIAL_CORRECT_MSG
        || "Correct! You identified the manipulated clipping.";
    } else {
      iconEl.textContent = "\u2715"; // ✕
      iconEl.classList.add("incorrect");
      msgEl.textContent = settings.TUTORIAL_INCORRECT_MSG
        || "Not quite \u2014 that clipping was authentic. Try again or start the task.";
    }

    const actions = document.createElement("div");
    actions.className = "tutorial-actions";

    const redoBtn = document.createElement("button");
    redoBtn.type = "button";
    redoBtn.className = "tutorial-btn tutorial-btn--redo";
    redoBtn.textContent = settings.TUTORIAL_REDO_LABEL || "Try again";

    const startBtn = document.createElement("button");
    startBtn.type = "button";
    startBtn.className = "tutorial-btn tutorial-btn--start";
    startBtn.textContent = settings.TUTORIAL_START_LABEL || "Start the task";

    redoBtn.addEventListener("click", () => {
      card.classList.remove("visible");
      setTimeout(() => resolve("redo"), 180);
    });
    startBtn.addEventListener("click", () => {
      card.classList.remove("visible");
      setTimeout(() => resolve("start"), 180);
    });

    actions.appendChild(redoBtn);
    actions.appendChild(startBtn);
    card.appendChild(iconEl);
    card.appendChild(msgEl);
    card.appendChild(actions);
    wrapper.appendChild(card);
    requestAnimationFrame(() => { card.classList.add("visible"); });
  });
}

/** Permanently reveals all stimulus tiles (removes CSS concealment). */
function _revealAllStimulusTiles() {
  document.querySelectorAll("#stimuli-wrapper .stimulus").forEach((tile) => {
    tile.classList.remove("conceal-until-hover");
    tile.classList.add("touch-revealed");
    tile.style.backgroundPosition = "center";
  });
}

/**
 * Applies border highlights to tiles after a tutorial selection:
 *   chosen tile  → green (correct) or red (incorrect)
 *   correct tile → subtle green hint when the participant was wrong
 */
function _applyTutorialHighlights(chosen, assignment, isCorrect, correctType) {
  if (!chosen) return;
  const chosenEl = document.getElementById(chosen.id);
  if (chosenEl) {
    chosenEl.classList.add(isCorrect ? "tut-highlight-correct" : "tut-highlight-incorrect");
  }
  if (!isCorrect) {
    const correctItem = assignment.find((a) => a.type === correctType);
    if (correctItem) {
      const correctEl = document.getElementById(correctItem.id);
      if (correctEl) correctEl.classList.add("tut-highlight-hint");
    }
  }
}

/*********************************
 * DEMO FALLBACK & MODULE EXPORT *
 *********************************/
// Browser surface: expose startTask globally for Qualtrics question JS to call.
// Auto-run in DEMO mode (no Qualtrics global) so a static-served harness shows
// the task immediately. Set window.DECONSPIRATOR_AUTORUN = false to opt out
// (e.g. when the harness wants to call startTask with custom settings).
const _isCommonJsRequire = typeof module !== "undefined" && module.exports;
if (typeof window !== "undefined") {
  window.startTask = startTask;
  if (!_isCommonJsRequire && typeof Qualtrics === "undefined" && window.DECONSPIRATOR_AUTORUN !== false) {
    console.warn("[deconspirator] DEMO MODE: Qualtrics SurveyEngine not available. Data will not be saved to Qualtrics.");
    startTask();
  }
}

// Node test surface: export pure helpers so node:test can pin the wire format
// without spinning up a DOM. Side-effect-free at require-time.
if (_isCommonJsRequire) {
  module.exports = {
    ENGINE_VERSION,
    defaultSettings,
    mergeSettings,
    buildTrial,
    getEngineMeta,
    getFollowUpQuestions,
    validateStimuliPairs,
    shuffle,
    readTouchSignals,
    isTouchPrimary,
    resolveTouchMode,
  };
}
