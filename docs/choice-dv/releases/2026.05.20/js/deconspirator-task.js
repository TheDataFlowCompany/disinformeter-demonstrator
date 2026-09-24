"use strict";
(function (global) {
  "use strict";

  const existingEngine =
    typeof window !== "undefined" &&
    global &&
    global.DeconspiratorTask &&
    typeof global.DeconspiratorTask.startTask === "function"
      ? global.DeconspiratorTask
      : null;

  if (existingEngine) {
    global.startTask = existingEngine.startTask;
    if (existingEngine.Telemetry) global.DeconspiratorTelemetry = existingEngine.Telemetry;
    return;
  }

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
const ENGINE_VERSION = "2026.05.20";

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
 * @property {boolean}   ERROR_RECOVERY_ENABLED             - Show participant-facing recovery UI on severe failures.
 * @property {number}    ERROR_RECOVERY_ASSET_FAILURE_THRESHOLD - Show recovery UI after this many failed assets; 0 disables asset-triggered recovery.
 * @property {number}    ASSET_LOAD_TIMEOUT_MS              - Preload delay threshold; late loads remain tracked separately from hard failures.
 * @property {string}    STIMULUS_LOADING_LABEL             - Per-tile placeholder label shown until the stimulus image finishes downloading.
 * @property {boolean}   SHOW_REVEAL_HINT                   - When true (and CONCEAL_UNTIL_HOVER is on), render a subtle "hover/tap to reveal" hint on each concealed tile.
 * @property {string}    REVEAL_HINT_HOVER                  - Hint label shown on desktop (mouse) sessions while the tile is concealed.
 * @property {string}    REVEAL_HINT_TOUCH                  - Hint label shown on touch sessions while the tile is concealed.
 * @property {string}    ERROR_RECOVERY_TITLE
 * @property {string}    ERROR_RECOVERY_MESSAGE
 * @property {string=}   TELEMETRY_FIELD_PREFIX             - Prefix for taskStatus_* embedded fields. Default: "taskStatus".
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

  // ---- Error recovery ----
  /**
   * When true, severe task failures render a participant-facing card over the
   * task area and re-enable Qualtrics' Next button. The copy is intentionally
   * configurable because this script is pasted into multilingual surveys.
   */
  ERROR_RECOVERY_ENABLED: true,

  /**
   * Show the recovery card once this many stimulus images emit hard load
   * errors (404/DNS/blocker-style onerror). Timeout fallback failures remain
   * telemetry-only because slow assets may still load for the participant.
   * Set to 0 to keep all asset failures telemetry-only.
   */
  ERROR_RECOVERY_ASSET_FAILURE_THRESHOLD: 4,
  ASSET_LOAD_TIMEOUT_MS: 45000,
  /**
   * Per-tile placeholder shown until the stimulus image actually paints. On
   * throttled connections empty tiles are otherwise indistinguishable from
   * "ready to reveal" — participants would click blank boxes or hit skip.
   * Set to "" to suppress the text and show only the spinner.
   */
  STIMULUS_LOADING_LABEL: "Loading clipping…",
  /**
   * Optional subtle hint rendered on each concealed tile until the participant
   * hovers/taps to reveal it. Off by default — turn on when stress-testing
   * suggests participants may not realise the tiles are interactive. Two label
   * variants so the copy can match the interaction mode (mouse vs touch).
   */
  SHOW_REVEAL_HINT: false,
  REVEAL_HINT_HOVER: "Hover to reveal",
  REVEAL_HINT_TOUCH: "Tap to reveal",
  ERROR_RECOVERY_TITLE: "Something went wrong",
  ERROR_RECOVERY_MESSAGE: "Something went wrong loading this part of the survey. Your responses so far have been recorded. Click Next to continue with the remaining questions.",

  // ---- Telemetry ----
  /**
   * Embedded-data field prefix for lifecycle telemetry. Default is "taskStatus".
   * The engine writes <prefix>_state, <prefix>_progress, <prefix>_assets,
   * <prefix>_errors, <prefix>_exitReason, <prefix>_heartbeatMs, etc. so dropouts
   * can be classified into loading failure / asset timeout / JS crash /
   * abandonment / intentional quit. See Telemetry block above.
   */
  TELEMETRY_FIELD_PREFIX: "taskStatus",
};

// Runtime state
let settings = {};
let qualtricsSurveyEngine = null;
let qualtricsQuestionData = null;
let taskData = [];
let _PAIRS = [];
let pairsQueue = [];
let errorRecoveryShown = false;
let activeRunToken = 0;

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
const EVENT_STALE_RUN = "__STALE_RUN__";

/***********
 * TELEMETRY
 ***********
 * Lifecycle markers + error capture continuously flushed to Qualtrics embedded
 * data. Designed so that a participant who never reaches "complete" still
 * leaves enough breadcrumbs to distinguish:
 *
 *   loading failure   → state never advances past addOnload_fired
 *   asset timeout     → assetsTimedOut non-empty / loaded < total
 *   asset failure     → assetsFailed non-empty (hard onerror)
 *   JS crash          → errors non-empty (state may be "crashed")
 *   silent abandon    → no exitReason, heartbeat stale, state mid-task
 *   intentional quit  → exitReason set (pagehide / beforeunload)
 *
 * Each marker writes the current state into <prefix>_state (default prefix is
 * "taskStatus"). All writes are idempotent: same value twice is a no-op so we
 * don't spam Qualtrics with redundant network traffic.
 *
 * Telemetry must NEVER throw — every write is try/catch'd. The whole module
 * is safe to require in Node (no DOM access at IIFE time).
 */
const TELEMETRY_PREFIX_DEFAULT = "taskStatus";
const TELEMETRY_STATES = Object.freeze([
  "script_loaded",         // engine JS evaluated
  "task_item_loaded",      // per-study config JS evaluated
  "addOnload_fired",       // Qualtrics fired the onload handler in task-item.js
  "merging_settings",      // startTask entered, before any DOM work
  "init_complete",         // initTask returned (DOM, touch resolved)
  "assets_preload_started",
  "assets_preload_complete",
  "assets_preload_slow",    // one or more images exceeded preload threshold but may still load later
  "assets_preload_partial", // some images emitted hard load errors
  "tutorial_started",
  "tutorial_complete",
  "main_task_started",
  "trial_shown",            // per-trial; trialIndex/nTrials populated
  "trial_responded",        // per-trial; event populated
  "post_choice_shown",
  "post_choice_submitted",
  "intertrial",
  "storing_data",
  "complete",
  "crashed",                // startTask try/catch caught a throw
]);

const Telemetry = (function () {
  let prefix = TELEMETRY_PREFIX_DEFAULT;
  let installed = false;
  let heartbeatId = null;
  const lastWritten = Object.create(null);

  const status = {
    engineVersion: ENGINE_VERSION,
    state: "script_loaded",
    stateMs: 0,
    // Append-only transition log. We can't rely on the single-valued `state`
    // field to be observable end-to-end: early marks (e.g. script_loaded)
    // fire before qualtricsSurveyEngine is bound, so their setEmbeddedData
    // writes never reach Qualtrics. By the time the binding lands, state has
    // already advanced. The history array survives those gaps because it's
    // rewritten wholesale on each subsequent mark, so the first reachable
    // setEmbeddedData call carries every earlier state too.
    stateHistory: [],
    trialIndex: 0,
    nTrials: 0,
    lastTrialEvent: null,
    assetsTotal: 0,
    assetsLoaded: 0,
    assetsFailed: [],
    assetsTimedOut: [],
    assetsLateLoaded: [],
    errors: [],
    visibility: [],
    exitReason: null,
    heartbeatMs: 0,
    touchMode: null,
    language: null,
  };

  function _now() {
    return typeof performance !== "undefined" && performance.now ? Math.round(performance.now()) : 0;
  }

  function _safeWrite(field, value) {
    const str = typeof value === "string" ? value : JSON.stringify(value);
    if (lastWritten[field] === str) return;
    try {
      // Resolve the survey engine in priority order:
      //   1. The module-scoped binding set by initTask() (preferred — this is
      //      the qse object task-item.js passed in)
      //   2. window.Qualtrics.SurveyEngine global (fallback for the case where
      //      task-item.js was blocked but the engine still loaded — without
      //      this fallback, every early Telemetry write would be lost forever)
      const qse =
        qualtricsSurveyEngine ||
        (typeof window !== "undefined" && window.Qualtrics && window.Qualtrics.SurveyEngine) ||
        null;
      if (qse && typeof qse.setEmbeddedData === "function") {
        qse.setEmbeddedData(field, str);
        // Only cache after a successful write — otherwise a write that
        // happened-to-be-attempted-before-qse-was-ready would dedup the real
        // write that comes later.
        lastWritten[field] = str;
      }
    } catch (_) {
      // Telemetry must never throw.
    }
  }

  function _flush() {
    _safeWrite(prefix + "_engineVersion", status.engineVersion);
    _safeWrite(prefix + "_state", status.state);
    _safeWrite(prefix + "_stateMs", String(status.stateMs));
    if (status.stateHistory.length) _safeWrite(prefix + "_stateHistory", JSON.stringify(status.stateHistory.slice(-60)));
    _safeWrite(prefix + "_progress", status.nTrials ? (status.trialIndex + "/" + status.nTrials) : "");
    _safeWrite(prefix + "_assets", status.assetsTotal ? (status.assetsLoaded + "/" + status.assetsTotal) : "");
    _safeWrite(prefix + "_heartbeatMs", String(status.heartbeatMs));
    _safeWrite(prefix + "_assetsFailed", status.assetsFailed.length ? JSON.stringify(status.assetsFailed) : "");
    _safeWrite(prefix + "_assetsTimedOut", status.assetsTimedOut.length ? JSON.stringify(status.assetsTimedOut) : "");
    _safeWrite(prefix + "_assetsLateLoaded", status.assetsLateLoaded.length ? JSON.stringify(status.assetsLateLoaded) : "");
    _safeWrite(prefix + "_errors", status.errors.length ? JSON.stringify(status.errors) : "");
    _safeWrite(prefix + "_visibility", status.visibility.length ? JSON.stringify(status.visibility.slice(-20)) : "");
    _safeWrite(prefix + "_exitReason", status.exitReason || "");
    _safeWrite(prefix + "_lastTrialEvent", status.lastTrialEvent || "");
    if (status.touchMode != null) _safeWrite(prefix + "_touchMode", String(status.touchMode));
    if (status.language) _safeWrite(prefix + "_language", status.language);
  }

  function mark(state, detail) {
    status.state = state;
    status.stateMs = _now();
    status.stateHistory.push({ s: state, ms: status.stateMs });
    if (status.stateHistory.length > 200) status.stateHistory.shift();
    if (detail && typeof detail === "object") {
      if (typeof detail.trialIndex === "number") status.trialIndex = detail.trialIndex;
      if (typeof detail.nTrials === "number") status.nTrials = detail.nTrials;
      if (detail.event) status.lastTrialEvent = detail.event;
    }
    try { console.log("[telemetry] " + state, detail || ""); } catch (_) {}
    _flush();
  }

  function recordError(err, source) {
    const entry = {
      ts: _now(),
      source: source || "uncaught",
      state: status.state,
      message: (err && err.message) || String(err || "unknown"),
      stack: err && err.stack ? String(err.stack).slice(0, 800) : null,
    };
    status.errors.push(entry);
    if (status.errors.length > 20) status.errors.shift();
    try { console.error("[telemetry] error", entry); } catch (_) {}
    _flush();
  }

  function setAssetTotals(total) {
    status.assetsTotal = total;
    status.assetsLoaded = 0;
    status.assetsFailed = [];
    status.assetsTimedOut = [];
    status.assetsLateLoaded = [];
    _flush();
  }
  function recordAssetLoaded(url, late) {
    status.assetsLoaded++;
    if (late && url) status.assetsLateLoaded.push(url);
    _flush();
  }
  function recordAssetFailed(url) { status.assetsFailed.push(url); _flush(); }
  function recordAssetTimedOut(url) { status.assetsTimedOut.push(url); _flush(); }

  function setTouchMode(v) { status.touchMode = v; _flush(); }
  function setLanguage(v) { status.language = v; _flush(); }

  function install(opts) {
    if (installed) {
      // Re-flush so the new qualtricsSurveyEngine binding receives prior markers.
      _flush();
      return;
    }
    installed = true;
    if (opts && opts.prefix) prefix = opts.prefix;

    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("error", function (e) {
        recordError(
          { message: e.message, stack: e.error && e.error.stack },
          "window.error " + (e.filename || "?") + ":" + (e.lineno || "?")
        );
      });
      window.addEventListener("unhandledrejection", function (e) {
        const r = e.reason;
        recordError(
          { message: "unhandledrejection: " + ((r && r.message) || r), stack: r && r.stack },
          "unhandledrejection"
        );
      });
      // pagehide fires for both "tab closed" and "navigated forward in bfcache".
      // persisted=true means the page is going into bfcache (likely returning).
      window.addEventListener("pagehide", function (e) {
        if (!status.exitReason) status.exitReason = e.persisted ? "pagehide_persisted" : "pagehide";
        _flush();
      });
      // beforeunload fires synchronously before navigation/close; gives us a
      // distinct signal from "tab discarded by OS / battery saver".
      window.addEventListener("beforeunload", function () {
        if (!status.exitReason) status.exitReason = "beforeunload";
        _flush();
      });
    }
    if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
      document.addEventListener("visibilitychange", function () {
        status.visibility.push({ ts: _now(), state: document.visibilityState });
        if (status.visibility.length > 50) status.visibility.shift();
        _flush();
      });
    }

    // Heartbeat: a stale taskStatus_heartbeatMs (vs taskStatus_stateMs) is the
    // signal for "tab was open but no JS ran" — i.e. silent abandonment or
    // device throttling, distinct from explicit pagehide/beforeunload.
    if (typeof setInterval === "function") {
      heartbeatId = setInterval(function () {
        status.heartbeatMs = _now();
        _safeWrite(prefix + "_heartbeatMs", String(status.heartbeatMs));
      }, 2500);
    }

    _flush();
  }

  function shutdown() {
    if (heartbeatId) { try { clearInterval(heartbeatId); } catch (_) {} heartbeatId = null; }
    _flush();
  }

  function getStatus() {
    try { return JSON.parse(JSON.stringify(status)); } catch (_) { return null; }
  }

  return {
    install: install,
    shutdown: shutdown,
    mark: mark,
    recordError: recordError,
    setAssetTotals: setAssetTotals,
    recordAssetLoaded: recordAssetLoaded,
    recordAssetFailed: recordAssetFailed,
    recordAssetTimedOut: recordAssetTimedOut,
    setTouchMode: setTouchMode,
    setLanguage: setLanguage,
    getStatus: getStatus,
    STATES: TELEMETRY_STATES,
    PREFIX_DEFAULT: TELEMETRY_PREFIX_DEFAULT,
  };
})();

/***********************
 * PUBLIC ENTRY POINTS *
 ***********************/
async function startTask(qse = null, qqd = null, userSettings = {}) {
  const runToken = beginTaskRun();
  Telemetry.mark("merging_settings");
  try {
    settings = mergeSettings(userSettings);
    initTask(qse, qqd);
    // Install telemetry now that qualtricsSurveyEngine is wired — earlier
    // marks (script_loaded, addOnload_fired) are re-flushed via the new binding.
    Telemetry.install({ prefix: settings.TELEMETRY_FIELD_PREFIX || TELEMETRY_PREFIX_DEFAULT });
    Telemetry.setTouchMode(touchMode);
    Telemetry.mark("init_complete");
    disableNextButton();
    storeTaskData();
    initStimuli();
    // Re-evaluate touch detection after the layout has had a chance to settle.
    // Qualtrics' addOnload sometimes fires before the mobile layout viewport is
    // finalised, so innerWidth and the pointer media queries can lie at init.
    await waitForLayoutSettled();
    if (settings.FORCE_TOUCH_MODE == null) {
      const recheck = resolveTouchMode("post-paint");
      if (recheck !== touchMode) {
        console.log("[deconspirator] touch mode changed after layout: " + touchMode + " -> " + recheck);
        touchMode = recheck;
        Telemetry.setTouchMode(touchMode);
        applyTouchModeClass();
        storeTaskData();
      }
    }
    if (settings.TUTORIAL_ENABLED !== false) {
      Telemetry.mark("tutorial_started");
      await runTutorial(runToken);
      if (!isTaskRunActive(runToken)) return;
      Telemetry.mark("tutorial_complete");
    }
    Telemetry.mark("main_task_started", { trialIndex: 0, nTrials: pairsQueue.length });
    await runTask(runToken);
    if (!isTaskRunActive(runToken)) return;
    Telemetry.mark("storing_data");
    storeTaskData();
    Telemetry.mark("complete");
    enableNextButton();
  } catch (e) {
    Telemetry.recordError(e, "startTask");
    Telemetry.mark("crashed");
    persistPartialTaskDataSafely();
    showErrorRecoveryOverlay("crashed");
    // Try to free the participant from a stuck Next button so they can submit
    // partial data + telemetry rather than being trapped on a frozen page.
    try { enableNextButton(); } catch (_) {}
    throw e;
  }
}

/**
 * Start a fresh logical run in the same browser realm. Qualtrics preview can
 * re-fire addOnload when the author switches languages or restarts a preview;
 * without an explicit run token, old async handlers can append trials from a
 * previous attempt into the new response row.
 */
function beginTaskRun() {
  activeRunToken += 1;
  taskData = [];
  pairsQueue = [];
  _PAIRS = [];
  errorRecoveryShown = false;
  clearMouseRecording();
  touchFocusLog = [];
  try { stopDataRecording(); } catch (_) {}
  return activeRunToken;
}

function isTaskRunActive(runToken) {
  return runToken === activeRunToken;
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
    assetLoadTimeoutMs: Number(s.ASSET_LOAD_TIMEOUT_MS || 0),
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
    errorRecoveryEnabled: s.ERROR_RECOVERY_ENABLED !== false,
    errorRecoveryAssetFailureThreshold: Number(s.ERROR_RECOVERY_ASSET_FAILURE_THRESHOLD || 0),
    // Telemetry: surfaces the lifecycle-marker schema so QC / dropout analysis
    // can interpret <prefix>_state values without redeclaring the constant set.
    telemetryFieldPrefix: s.TELEMETRY_FIELD_PREFIX || TELEMETRY_PREFIX_DEFAULT,
    telemetryStates: [...TELEMETRY_STATES],
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
  setQualtricsNextSuppressed(true);
  if (qualtricsQuestionData) qualtricsQuestionData.disableNextButton();
}

function enableNextButton() {
  setQualtricsNextSuppressed(false);
  if (qualtricsQuestionData) qualtricsQuestionData.enableNextButton();
}

/**
 * Qualtrics' question API is only available after addOnload, but under slow
 * network conditions the visible Next button can exist before the task is
 * ready to call `this.disableNextButton()`. Suppressing the DOM button closes
 * that gap and is reversed by enableNextButton().
 */
function setQualtricsNextSuppressed(suppressed) {
  if (typeof document === "undefined") return;
  const btn = document.getElementById("NextButton");
  if (!btn) return;
  if (suppressed) {
    if (!btn.getAttribute("data-decon-next-suppressed")) {
      btn.setAttribute("data-decon-next-display", btn.style.display || "");
      btn.setAttribute("data-decon-next-disabled", btn.disabled ? "true" : "false");
    }
    btn.setAttribute("data-decon-next-suppressed", "true");
    btn.style.display = "none";
    btn.disabled = true;
    btn.setAttribute("aria-disabled", "true");
  } else if (btn.getAttribute("data-decon-next-suppressed")) {
    btn.style.display = btn.getAttribute("data-decon-next-display") || "";
    btn.disabled = btn.getAttribute("data-decon-next-disabled") === "true";
    btn.removeAttribute("aria-disabled");
    btn.removeAttribute("data-decon-next-suppressed");
    btn.removeAttribute("data-decon-next-display");
    btn.removeAttribute("data-decon-next-disabled");
  }
}

/**
 * Best-effort partial save used before handing the participant back to the
 * survey after a severe failure. It must not mask the original crash path.
 */
function persistPartialTaskDataSafely() {
  try {
    if (settings && settings.QUALTRICS_EMBEDDED_FIELD) storeTaskData();
  } catch (e) {
    try { Telemetry.recordError(e, "partial_save"); } catch (_) {}
  }
}

/**
 * Render a participant-facing recovery card over the task area. Telemetry
 * tells researchers what happened; this tells participants how to continue.
 *
 * @param {string} reason - Short internal reason for data attributes/logging.
 */
function showErrorRecoveryOverlay(reason) {
  if (!settings || settings.ERROR_RECOVERY_ENABLED === false || errorRecoveryShown) return;
  if (typeof document === "undefined") return;

  const task = document.getElementById("task");
  if (!task) return;
  errorRecoveryShown = true;
  task.classList.add("decon-recovery-active");
  task.setAttribute("data-recovery-reason", reason || "unknown");

  const existing = task.querySelector(".decon-error-recovery-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.className = "decon-error-recovery-overlay";
  overlay.setAttribute("role", "alert");
  overlay.setAttribute("aria-live", "assertive");

  const card = document.createElement("div");
  card.className = "decon-error-recovery-card";

  const icon = document.createElement("div");
  icon.className = "decon-error-recovery-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "!";

  const title = document.createElement("h1");
  title.textContent = settings.ERROR_RECOVERY_TITLE || defaultSettings.ERROR_RECOVERY_TITLE;

  const message = document.createElement("p");
  message.textContent = settings.ERROR_RECOVERY_MESSAGE || defaultSettings.ERROR_RECOVERY_MESSAGE;

  card.appendChild(icon);
  card.appendChild(title);
  card.appendChild(message);
  overlay.appendChild(card);
  task.appendChild(overlay);
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

  // Build full asset list (main pairs + tutorial) so the telemetry total is
  // accurate from the first writeback.
  const urls = [];
  pairsQueue.forEach((p) => {
    urls.push(settings.STIMULI_URL + p.fimi);
    urls.push(settings.STIMULI_URL + p.non);
  });
  if (settings.TUTORIAL_ENABLED !== false) {
    [settings.TUTORIAL_FIMI, settings.TUTORIAL_NON].filter(Boolean).forEach((f) => {
      urls.push(settings.STIMULI_URL + f);
    });
  }
  preloadImagesTracked(urls);
}

/**
 * Kick off image preloads in parallel and track per-asset success/failure via
 * Telemetry. Non-blocking: trial flow does not wait for preloads to finish
 * (matches prior behaviour — tiles use background-image, which lazy-loads on
 * mount anyway). The point is to *detect* asset failures, not to gate on them.
 *
 * Any URL that neither fires onload nor onerror within ASSET_LOAD_TIMEOUT_MS
 * is recorded as delayed, not failed. Late onload events still update the
 * loaded count so throttled 3G sessions don't look like broken stimuli.
 */
function preloadImagesTracked(urls) {
  const ASSET_LOAD_TIMEOUT_MS = Number(settings.ASSET_LOAD_TIMEOUT_MS || defaultSettings.ASSET_LOAD_TIMEOUT_MS || 45000);
  Telemetry.setAssetTotals(urls.length);
  Telemetry.mark("assets_preload_started");

  let remaining = urls.length;
  let unsettled = urls.length;
  let hardFailureCount = 0;
  let anyTimedOut = false;
  let initialWindowMarked = false;

  const markInitialWindowIfDone = () => {
    if (initialWindowMarked || remaining > 0) return;
    initialWindowMarked = true;
    if (hardFailureCount > 0) {
      Telemetry.mark("assets_preload_partial");
    } else if (anyTimedOut) {
      Telemetry.mark("assets_preload_slow");
    } else {
      Telemetry.mark("assets_preload_complete");
    }
  };

  const markCompleteIfRecovered = () => {
    if (!initialWindowMarked || hardFailureCount > 0 || unsettled > 0) return;
    Telemetry.mark("assets_preload_complete");
  };

  urls.forEach((u) => {
    const img = new Image();
    let finalSettled = false;
    let initialSettled = false;
    let timedOut = false;
    const finish = (ok, reason) => {
      if (reason === "timeout") {
        if (initialSettled) return;
        initialSettled = true;
        timedOut = true;
        anyTimedOut = true;
        remaining--;
        Telemetry.recordAssetTimedOut(u);
        markInitialWindowIfDone();
        return;
      }
      if (finalSettled) return;
      finalSettled = true;
      unsettled--;
      if (!initialSettled) {
        initialSettled = true;
        remaining--;
      }
      if (ok) {
        Telemetry.recordAssetLoaded(u, timedOut);
        markCompleteIfRecovered();
      } else if (reason === "error") {
        Telemetry.recordAssetFailed(u);
        hardFailureCount++;
        maybeShowAssetRecovery(hardFailureCount);
        if (initialWindowMarked) Telemetry.mark("assets_preload_partial");
      }
      if (reason === "load" || reason === "error") {
        markInitialWindowIfDone();
      }
    };
    img.onload = () => finish(true, "load");
    img.onerror = () => finish(false, "error");
    setTimeout(() => finish(false, "timeout"), ASSET_LOAD_TIMEOUT_MS);
    img.src = u;
  });

  if (urls.length === 0) {
    Telemetry.mark("assets_preload_complete");
  }
}

/**
 * Asset preloading is intentionally non-blocking, and timeout fallback failures
 * can reflect temporary slowness rather than broken stimuli. Only hard browser
 * image errors count toward participant-facing recovery.
 */
function maybeShowAssetRecovery(hardFailureCount) {
  if (!settings || settings.ERROR_RECOVERY_ENABLED === false || errorRecoveryShown) return;
  const threshold = Number(settings.ERROR_RECOVERY_ASSET_FAILURE_THRESHOLD || 0);
  if (!threshold || threshold < 1) return;
  const status = Telemetry.getStatus && Telemetry.getStatus();
  if (status && status.state === "complete") return;
  if (hardFailureCount >= threshold) {
    persistPartialTaskDataSafely();
    showErrorRecoveryOverlay("assets_failed");
    try { enableNextButton(); } catch (_) {}
  }
}

/*******************
 * TASK FLOW / LOOP *
 *******************/
async function runTask(runToken) {
  const total = pairsQueue.length;
  let idx = 0;
  while (pairsQueue.length) {
    if (!isTaskRunActive(runToken)) return;
    idx++;
    const pair = pairsQueue.shift();
    Telemetry.mark("trial_shown", { trialIndex: idx, nTrials: total });
    const clicked = await presentPairAndAwaitResponse(pair, runToken);
    if (clicked === EVENT_STALE_RUN || !isTaskRunActive(runToken)) return;
    Telemetry.mark("trial_responded", { trialIndex: idx, nTrials: total, event: clicked });

    // Inter-trial screen
    if (settings.INTER_TRIAL_TIMEOUT > 0) {
      Telemetry.mark("intertrial", { trialIndex: idx, nTrials: total });
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
function presentPairAndAwaitResponse(pair, runToken) {
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
    if (!isTaskRunActive(runToken)) return EVENT_STALE_RUN;
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
      Telemetry.mark("post_choice_shown");
      const ratings = await presentPostChoiceWidget(followUpQuestions);
      Telemetry.mark("post_choice_submitted");
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
    storeTaskData();

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
  const url = `${settings.STIMULI_URL}${stim.filename}`;
  el.style.backgroundImage = `url(${url})`;

  // Subtle per-tile loading indicator. Without it, throttled-3G participants
  // see empty tiles for tens of seconds and (per stress-test feedback) start
  // clicking blank boxes or skip just to advance the trial.
  attachStimulusLoadingIndicator(el, url);

  // Optional subtle "hover/tap to reveal" affordance for the concealed tiles.
  // Hidden by CSS while .is-loading is on, and while the tile is hovered /
  // focused / touch-revealed, so it only appears in the "ready, waiting"
  // state and never overlaps the loading shimmer or the revealed clipping.
  if (settings.CONCEAL_UNTIL_HOVER && settings.SHOW_REVEAL_HINT) {
    attachStimulusRevealHint(el);
  }

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

/**
 * Marks a stimulus tile as "loading" with a small visible indicator and a
 * shimmer background, then clears both as soon as the browser reports the
 * image is available. Uses an off-DOM Image() probe so we don't depend on
 * the background-image actually being painted (which only happens on
 * hover/reveal under CONCEAL_UNTIL_HOVER) — the participant gets the signal
 * the moment the bytes arrive, not the moment they reveal the tile.
 *
 * Cached images (subsequent trials, or post-preload completion) settle on
 * the next microtask via the `complete` short-circuit, so the indicator
 * never flashes when there is nothing to wait for. Errors clear the
 * indicator too — surface-level recovery is the engine's existing
 * ERROR_RECOVERY path, not this overlay.
 */
function attachStimulusLoadingIndicator(tileEl, url) {
  const labelText = settings.STIMULUS_LOADING_LABEL == null
    ? defaultSettings.STIMULUS_LOADING_LABEL
    : settings.STIMULUS_LOADING_LABEL;

  const overlay = document.createElement("div");
  overlay.className = "stimulus-loading-overlay";
  overlay.setAttribute("aria-hidden", "true");

  const spinner = document.createElement("span");
  spinner.className = "stimulus-loading-spinner";
  overlay.appendChild(spinner);

  if (labelText) {
    const lbl = document.createElement("span");
    lbl.className = "stimulus-loading-label";
    lbl.textContent = labelText;
    overlay.appendChild(lbl);
  }

  tileEl.classList.add("is-loading");
  tileEl.appendChild(overlay);

  let settled = false;
  const clear = () => {
    if (settled) return;
    settled = true;
    tileEl.classList.remove("is-loading");
    if (overlay.parentNode === tileEl) tileEl.removeChild(overlay);
  };

  const probe = new Image();
  probe.onload = clear;
  probe.onerror = clear;
  probe.src = url;

  // If the image was already cached (e.g. preloaded by initStimuli, or seen
  // in a previous trial), `complete` is true synchronously and naturalWidth
  // is non-zero. Skip the indicator entirely in that case.
  if (probe.complete && probe.naturalWidth > 0) {
    clear();
  }
}

/**
 * Append a low-contrast "hover to reveal" / "tap to reveal" affordance to a
 * concealed stimulus tile. Picks the label variant based on current touchMode
 * so the copy matches how the participant actually interacts. CSS handles
 * visibility — the hint is hidden whenever the tile is loading, hovered/
 * focused, or already touch-revealed, so it is only seen in the ready-but-
 * concealed state.
 *
 * Built with createElementNS rather than a font icon so the engine stays
 * dependency-free and the stroke colour can inherit via currentColor.
 */
function attachStimulusRevealHint(tileEl) {
  const isTouch = !!touchMode;
  const labelText = isTouch
    ? (settings.REVEAL_HINT_TOUCH == null ? defaultSettings.REVEAL_HINT_TOUCH : settings.REVEAL_HINT_TOUCH)
    : (settings.REVEAL_HINT_HOVER == null ? defaultSettings.REVEAL_HINT_HOVER : settings.REVEAL_HINT_HOVER);
  if (!labelText) return;

  const hint = document.createElement("span");
  hint.className = "stimulus-reveal-hint";
  hint.setAttribute("aria-hidden", "true");
  hint.appendChild(buildRevealHintIcon(isTouch));

  const lbl = document.createElement("span");
  lbl.className = "stimulus-reveal-hint-label";
  lbl.textContent = labelText;
  hint.appendChild(lbl);

  tileEl.appendChild(hint);
}

/** Minimal feather-style SVG icon: eye for hover, finger-tap for touch. */
function buildRevealHintIcon(isTouch) {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "stimulus-reveal-hint-icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.6");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");

  const addPath = (d) => {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    svg.appendChild(p);
  };

  if (isTouch) {
    addPath("M9 11V6a2 2 0 1 1 4 0v5");
    addPath("M13 11V4.5a2 2 0 1 1 4 0V13");
    addPath("M17 13V7.5a2 2 0 1 1 4 0V16a6 6 0 0 1-6 6h-2a6 6 0 0 1-5.2-3l-3.5-6a2 2 0 0 1 3.4-2L9 14");
  } else {
    addPath("M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z");
    const circle = document.createElementNS(NS, "circle");
    circle.setAttribute("cx", "12");
    circle.setAttribute("cy", "12");
    circle.setAttribute("r", "3");
    svg.appendChild(circle);
  }
  return svg;
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
 *         confidenceFieldPrefix, telemetry schema, and error-recovery flags.
 *         Read by check_data_quality.py to source wire-format constants from
 *         data instead of hardcoding them.
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
async function runTutorial(runToken) {
  let action;
  do {
    action = await _presentTutorialTrial(runToken);
    if (action === EVENT_STALE_RUN || !isTaskRunActive(runToken)) return;
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
async function _presentTutorialTrial(runToken) {
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
  if (!isTaskRunActive(runToken)) return EVENT_STALE_RUN;

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
  if (!isTaskRunActive(runToken)) return EVENT_STALE_RUN;
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
  window.DeconspiratorTask = {
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
    startTask,
    Telemetry,
    TELEMETRY_STATES,
    TELEMETRY_PREFIX_DEFAULT,
  };
  window.startTask = startTask;
  window.buildTrial = buildTrial;
  // Surface the Telemetry handle so task-item.js (and the dev harness) can mark
  // lifecycle states before startTask is called.
  window.DeconspiratorTelemetry = Telemetry;
  if (!_isCommonJsRequire) {
    // Install global error / unload / visibility listeners immediately, NOT
    // inside startTask. If task-item.js fails to load (ad blocker, CSP, syntax
    // error from a bad paste), startTask never runs, and a `startTask`-gated
    // listener install would mean every error in that window is silently lost.
    // The install is idempotent — startTask will call it again and the guard
    // keeps the second call a no-op.
    Telemetry.install();
    // Mark script-loaded immediately — visible in console even before the
    // Qualtrics binding is ready; will reach embedded data via the
    // window.Qualtrics.SurveyEngine fallback in _safeWrite if no qse is wired.
    Telemetry.mark("script_loaded");
    if (typeof Qualtrics === "undefined" && window.DECONSPIRATOR_AUTORUN !== false) {
      console.warn("[deconspirator] DEMO MODE: Qualtrics SurveyEngine not available. Data will not be saved to Qualtrics.");
      startTask();
    }
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
    Telemetry,
    TELEMETRY_STATES,
    TELEMETRY_PREFIX_DEFAULT,
  };
}
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
