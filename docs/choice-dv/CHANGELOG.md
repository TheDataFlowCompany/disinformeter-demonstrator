# Changelog

Behavioural changes to the Deconspirator engine. Versions are date-stamped
(`YYYY.MM.DD`, with an optional same-day patch suffix such as
`YYYY.MM.DD.1`) since the engine is delivered as a single static asset, not a
published package.

`ENGINE_VERSION` is written into the `taskData_meta` Qualtrics embedded field,
so any saved session can be traced back to a specific build by inspecting the
participant's row.

**When to bump the version:** any change to data shape, scoring rule, default
settings, touch-detection logic, or anything else that could cause a participant
on the new build to behave differently from the same participant on the old one.
Pure code refactors that preserve behaviour do not need a bump.

## 2026.05.20

### Added
- **Per-tile loading indicator.** Each stimulus tile now shows a subtle
  shimmer background, a small spinner, and a localised
  "Loading clipping…" label until its image actually finishes downloading.
  Driven by an off-DOM `Image()` probe per tile, so the indicator clears the
  moment the bytes arrive — independent of whether the participant has
  revealed the tile yet (the engine sets the image as `background-image`,
  which only paints on hover under `CONCEAL_UNTIL_HOVER`). Without this,
  throttled-3G participants in the May 20 stress test reported being tempted
  to click blank boxes or skip just to advance the trial.
- `STIMULUS_LOADING_LABEL` setting (`task-item.js` ships en/de/pl/lt copy).
  Set to `""` to keep the spinner but drop the text. The shimmer + spinner
  respect `prefers-reduced-motion`.
- `ASSET_LOAD_TIMEOUT_MS` setting, exposed in `taskData_meta` as
  `assetLoadTimeoutMs`.
- `taskStatus_assetsTimedOut` and `taskStatus_assetsLateLoaded` telemetry. Slow
  preloads are now distinguished from hard browser image errors so throttled
  3G sessions no longer look like broken stimulus files when images eventually
  load.
- `assets_preload_slow` telemetry state for sessions where the preload window
  elapsed before one or more images loaded.
- **Participant-facing error recovery.** Severe failures now render a recovery
  card over `#task` and re-enable Qualtrics' Next button instead of leaving a
  blank or frozen task area. Covered cases: `startTask` crashes,
  `engine_missing` in `task-item.js`, and multiple hard asset load errors once
  `ERROR_RECOVERY_ASSET_FAILURE_THRESHOLD` is reached.
- `ERROR_RECOVERY_ENABLED`, `ERROR_RECOVERY_ASSET_FAILURE_THRESHOLD`,
  `ERROR_RECOVERY_TITLE`, and `ERROR_RECOVERY_MESSAGE` settings. The copy is
  supplied per language in `task-item.js`; asset-triggered recovery defaults
  to 4 hard image errors and can be disabled by setting the threshold to `0`.
- **Lifecycle telemetry.** Every stage of the participant's journey (script
  load → onload fired → settings merged → assets preloaded → tutorial → trials
  → post-choice → complete) is now stamped into Qualtrics embedded data under
  the `taskStatus_*` prefix as it happens, not just at the end. Designed so a
  participant who never reaches `storeTaskData()` still leaves enough
  breadcrumbs to classify the dropout:
    - **Loading failure**: `taskStatus_state` never advances past `script_loaded`
      / `task_item_loaded` / `addOnload_fired`. `engine_missing` is set
      explicitly when the engine `<script>` failed to load.
    - **Asset timeout / failure**: `taskStatus_assetsFailed` non-empty;
      `taskStatus_assets` shows `loaded/total` short of total.
    - **JS crash**: `taskStatus_errors` non-empty; `taskStatus_state="crashed"`
      from the new `startTask` try/catch + global `error` / `unhandledrejection`
      handlers.
    - **Silent abandonment**: `taskStatus_exitReason` empty,
      `taskStatus_heartbeatMs` stale (heartbeat ticks every 2.5s),
      `taskStatus_state` mid-task.
    - **Intentional quit**: `taskStatus_exitReason` set to `pagehide` /
      `pagehide_persisted` / `beforeunload`.
- `taskStatus_progress`, `taskStatus_assets`, `taskStatus_lastTrialEvent`,
  `taskStatus_visibility`, `taskStatus_touchMode`, `taskStatus_language`,
  `taskStatus_engineVersion`, `taskStatus_stateMs` embedded fields.
- `taskStatus_stateHistory`: append-only JSON array of `{s, ms}` for every
  lifecycle transition. Crucial because the single-valued `taskStatus_state`
  loses early marks (e.g. `script_loaded` fires before
  `qualtricsSurveyEngine` is bound, so its `setEmbeddedData` write is dropped
  by the time state advances). The history is flushed wholesale on each
  subsequent mark, so the first reachable Qualtrics write carries every
  preceding state.
- `TELEMETRY_FIELD_PREFIX` setting to override the field prefix.
- `getEngineMeta(settings).telemetryFieldPrefix` + `telemetryStates` exposed
  for downstream QC consumers.
- `Telemetry` and `TELEMETRY_STATES` exports for unit testing.
- Dev harness stress-test bar (`dev/index.html`) with buttons that inject each
  failure mode (broken asset URL, slow assets, crash on trial N, late error,
  unhandled rejection, fast timeout) plus a telemetry ribbon showing the
  current `taskStatus_state` / progress / asset counts / error count / exit
  reason / last heartbeat.
- `tests/telemetry.test.js` pinning the Telemetry public surface, state
  schema, error capture, and asset accounting.

### Changed
- `taskStatus_assetsFailed` is now reserved for hard image load errors. Timeout
  fallback URLs move to `taskStatus_assetsTimedOut`; late `onload` events still
  increment `taskStatus_assets` and are mirrored in `taskStatus_assetsLateLoaded`.
- The engine writes `taskData`, `taskData_meta`, and diagnostics at startup and
  after each completed trial, not only after the final trial. Incomplete
  Qualtrics rows therefore keep the active config and any completed trials.
- `startTask` now creates a fresh logical run token. If Qualtrics preview
  re-fires `addOnload` during a language switch or restart, old async handlers
  can no longer append previous trials into the new run's `taskData`.
- `task-item.js` and the engine suppress the Qualtrics Next button at the DOM
  level before the question-scoped API is ready, then restore it on completion
  or recovery. This closes the slow-start window where a page could advance
  before `disableNextButton()` had run.
- Browser engine loading is now idempotent. If Qualtrics injects
  `deconspirator-task.js` again in the same page realm, the second evaluation
  reuses the existing `window.DeconspiratorTask` surface instead of
  redeclaring top-level constants such as `ENGINE_VERSION`.
- `task-item.js` now no-ops when the current Qualtrics page does not contain
  `<div id="task">`, preventing non-task pages from starting a phantom task or
  overwriting task telemetry.
- On caught engine crashes and asset-triggered recovery, the engine now makes a
  best-effort partial `taskData` save before asking the participant to continue
  with the rest of the survey.
- Asset preload timeout fallbacks remain telemetry-only and no longer trigger
  participant-facing recovery. This avoids ejecting participants on merely slow
  30s image loads while still surfacing hard 404/DNS/blocker-style failures.
- Telemetry listeners (`window.error`, `unhandledrejection`, `pagehide`,
  `beforeunload`, `visibilitychange`, heartbeat) now install at engine load
  time, not inside `startTask`. If `task-item.js` fails to load or
  `startTask` is never called for any other reason, errors during that
  window are now captured instead of silently lost.
- `_safeWrite` falls back to `window.Qualtrics.SurveyEngine` when the
  module-scoped `qualtricsSurveyEngine` binding isn't set yet, and only
  caches a value in the dedupe map *after* a successful write — so an early
  mark that happened before `qse` was wired isn't dropped by dedupe of the
  successful re-flush later.
- `preloadImages` → `preloadImagesTracked`: tracks per-asset onload/onerror
  plus a 20s fallback timeout so silent hangs are still reported. Trial flow
  is unchanged — preloading is still non-blocking.
- `startTask` is now wrapped in `try`/`catch`: any throw records to
  `taskStatus_errors`, marks `taskStatus_state="crashed"`, and re-enables the
  Qualtrics Next button so participants aren't trapped on a frozen page.
- `task-item.js` now marks `task_item_loaded` and `addOnload_fired` *before*
  invoking `window.startTask`, so engine-script load failures are detectable.
- `task-item.js` writes a clearer `engine_missing` state if `window.startTask`
  is not a function at addOnload time (CDN error / CSP block).

### Wire format
- Additive `taskStatus_assetsTimedOut` and `taskStatus_assetsLateLoaded`
  embedded fields.
- Additive `taskData_meta.assetLoadTimeoutMs` key.
- Existing trial objects are unchanged.
- `taskData`, `taskData_meta`, and per-pair Likert fields are **unchanged**.
- New `taskStatus_*` fields are **additive**. Old QC scripts continue to work.
- `taskData_meta.telemetryFieldPrefix` + `taskData_meta.telemetryStates` are
  new keys; absence in pre-2026.05.20 sessions is benign.
- `taskData_meta.errorRecoveryEnabled` and
  `taskData_meta.errorRecoveryAssetFailureThreshold` are new keys used to audit
  whether participant-facing recovery was active for a fielded study.

## 2026.05.05

### Added
- Expanded the post-choice screen from a single confidence Likert to three
  required 1-7 ratings: confidence, likelihood of reporting the headline as
  manipulated to social media administrators, and likelihood of checking other
  sources.
- Added per-trial `reportManipulated` and `checkSources` fields in `taskData`.
- Added per-pair embedded fields using `report_fimi_<pairId>` and
  `check_sources_fimi_<pairId>` by default, with prefixes exposed in
  `taskData_meta`.
- Added multilingual copy for the new questions and likelihood scales in
  `task-item.js`.
- Added `FOLLOW_UP_QUESTION_ENABLED` to control the whole post-choice screen
  and `FOLLOW_UP_QUESTIONS` to make the follow-up question set configurable.

### Changed
- The post-choice rating UI now waits for all three answers and a final
  continue action, allowing participants to revise accidental taps before the
  trial advances.
- `CONFIDENCE_ENABLED` is deprecated as a config flag. Older pasted configs
  that set it still map to `FOLLOW_UP_QUESTION_ENABLED` when the new flag is
  absent.

### Wire format
- `taskData` trial objects now include `reportManipulated` and `checkSources`.
  Existing `confidence` and `confidence_fimi_<id>` fields are unchanged.

## 2026.05.04

### Added
- `ENGINE_VERSION` constant and `taskData_meta` embedded data field. Stores
  engine version + wire-format constants (`validEvents`, `validTypes`,
  `validSides`, `expectedPairIds`, `stimulusTimeoutMs`,
  `confidenceFieldPrefix`, `selectTarget`, …) so downstream QC can read them
  from data instead of hardcoding them.
- Settings JSDoc `@typedef` and `mergeSettings()` helper. Logs a console
  warning at task start for any user-supplied setting key that is not in the
  schema — typo'd settings (e.g. `CONCEAL_UNTIL_HOOVER`) used to silently
  no-op.
- `buildTrial()` pure helper extracted from `presentPairAndAwaitResponse`.
  Same wire format; testable without DOM.
- `getEngineMeta(settings)` pure helper.
- Local dev harness in [`dev/`](dev/) with a fake `Qualtrics.SurveyEngine`
  that captures embedded-data writes for inspection. Run with
  `python3 -m http.server` from the deconspirator root and open
  `http://localhost:8000/dev/`.
- Unit tests under [`tests/`](tests/) using `node:test`. Pin trial JSON
  shape, settings merging, stimulus validation, and touch-detection signal
  combinations. Run with `node --test tests/`.

### Changed
- DEMO mode (loaded with no `Qualtrics` global) no longer pops a blocking
  `alert()`. Replaced with a console warning. Auto-run still triggers unless
  `window.DECONSPIRATOR_AUTORUN === false`.
- `console.log` after data save now includes engine version.

### Wire format
- `taskData_meta` is **additive**. Existing `taskData` and
  `confidence_fimi_<id>` fields are unchanged. Old QC scripts continue to work.

## Pre-2026.05.04

Pre-versioning history is in git. Notable milestones:

- Touch / mobile mode (tap-to-reveal, dual touch-mode resolution to recover
  from Qualtrics' wrong-viewport-at-onload bug, hybrid-device handling).
- Confidence rating widget (1–7 Likert after each `CLICK`).
- Tutorial flow with retry and per-event feedback messages.
- Countdown timer widget with reduced-motion support.
- Inter-trial loader with distinct messages for `CLICK`/`SKIP` vs `TIMEOUT`.
