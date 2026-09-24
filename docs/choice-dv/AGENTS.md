# AGENTS.md — Deconspirator Choice Task

This directory contains a **self-contained Qualtrics-embedded experiment** used to study how participants identify Foreign Information Manipulation and Interference (FIMI). It is *not* a Next.js feature — it is a static asset bundle (vanilla JS/CSS + image stimuli) that happens to be served from the TDFC site's `public/` tree at <https://thedataflowcompany.com/files/deconspirator/>.

If you are a coding agent making changes here, read this whole file first. The constraints below are unusual: there is no build step, no bundler, no test runner, and the runtime host (Qualtrics) imposes shape requirements that are not enforced in code.

---

## 1. What this task does

Each trial shows two newspaper clippings side-by-side, hidden behind blank tiles. The participant **hovers** (desktop) or **taps** (mobile) to reveal one tile at a time and clicks/confirms the one they think is foreign-manipulated (FIMI). After each non-timeout response a three-item 1–7 post-choice Likert screen is shown (confidence, report-to-admins intention, check-other-sources intention). A practice/tutorial trial precedes the main task.

Beyond the final choice, the task records **process data**: full mouse trajectories with hover targets, touch reveal/conceal events, response times, and per-trial assignments. These feed the analytics described in [data/task_features_description.md](data/task_features_description.md).

Source of truth for stimulus content, timings, copy, and language: **the per-survey settings object in [js/task-item.js](js/task-item.js)**, which is pasted into the Qualtrics question's JS editor. The defaults in [js/deconspirator-task.js](js/deconspirator-task.js) are merged-under, not authoritative for any given study.

---

## 2. Files and what each one is for

```
deconspirator/
├── js/
│   ├── deconspirator-task.js   ← engine. window.startTask + ENGINE_VERSION + pure helpers.
│   └── task-item.js            ← per-study config. Pasted into Qualtrics question JS.
├── css/
│   └── deconspirator-task.css  ← styles. Loaded via Qualtrics "Look & Feel" or external <link>.
├── dev/
│   ├── index.html              ← local dev harness with fake Qualtrics SurveyEngine.
│   └── dev-config.js           ← editable per-session userSettings for the harness.
├── tests/
│   ├── data-shape.test.js      ← node:test pins for buildTrial / mergeSettings / getEngineMeta.
│   └── touch-detect.test.js    ← node:test pins for the OR-of-signals touch detection.
├── stimuli/
│   ├── FIMI-01.jpg … FIMI-08.jpg
│   ├── NonFIMI-01.jpg … NonFIMI-08.jpg
│   ├── FIMI-Tutorial.jpg / NonFIMI-Tutorial.jpg
│   └── lt/                     ← Lithuanian-language stimulus set (same naming convention).
├── data/
│   ├── task_features_description.md   ← canonical description of every recorded/derived feature.
│   ├── check_data_quality.py          ← QC pipeline; emits *_participant.csv, *_trial.csv, *_summary.txt.
│   ├── check_taskdata_availability.py ← lighter QC focused on field availability per device.
│   └── Study+3_…_April+16,+2026_*.csv ← latest Qualtrics export (do not commit new exports without need).
├── backup/                     ← snapshots of pre-mobile-mode versions. Reference only — do not edit.
├── CHANGELOG.md                ← engine version history. Bump on behavioural change.
└── AGENTS.md                   ← this file.
```

Anything in `backup/` is frozen for archaeology. Do not modify it and do not import from it.

---

## 3. Runtime architecture (read before editing JS)

- The engine is a single IIFE-free script that exposes `window.startTask(qse, qqd, userSettings)`. `task-item.js` calls it from `Qualtrics.SurveyEngine.addOnload`.
- `defaultSettings` is the schema. `mergeSettings(userSettings)` overrides keys and **logs a console warning for any unknown key** (typo'd settings used to silently no-op). The JSDoc `@typedef Settings` block above `defaultSettings` is the authoritative type.
- **Pure helpers** are extracted for testability: `mergeSettings`, `buildTrial`, `getEngineMeta`, `validateStimuliPairs`, `shuffle`, `readTouchSignals`, `isTouchPrimary`. The engine exports them via CommonJS at the bottom for [tests/](tests/) to import — no DOM required.
- Module state is held in script-level `let` variables (`settings`, `taskData`, `pairsQueue`, `mouseRecording`, `touchFocusLog`, `touchModeDiagnostics`). The script assumes one task instance per page.
- Trial flow is `async`/`await` driven via `Promise.race` over click/select/skip/timeout responders. Mouse sampling uses `setInterval`; touch logging is event-driven.
- Touch mode is **resolved twice**: once at `addOnload`, then again after `requestAnimationFrame` settles (the Qualtrics mobile shell occasionally lies about viewport width on first paint). The resolved value is mirrored to `body.decon-touch-mode` so CSS can disable `:hover` reveal on hybrid touchscreen laptops. Don't simplify this — it was added to fix a real cross-platform bug.
- Tutorial trials reuse the main `createStimulusDomEl` builder, but their data is intentionally **discarded** (never pushed to `taskData`).
- **`ENGINE_VERSION`** is stamped into `taskData_meta` on save. Bump it (and add a `CHANGELOG.md` entry) on any behavioural change. Pure refactors do not need a bump.

---

## 4. Data contract — DO NOT BREAK SILENTLY

Downstream Python QC (`data/check_data_quality.py`) reads wire-format constants from `taskData_meta` when present (engines ≥ 2026.05.04) and falls back to the constants block at the top of the script otherwise. **Any change to field names, event strings, or per-trial JSON keys must be synchronised across:**

1. `defaultSettings` and `getEngineMeta()` in `deconspirator-task.js`
2. The JSDoc on `storeTaskData()` in `deconspirator-task.js`
3. `data/task_features_description.md`
4. `data/check_data_quality.py` — both the fallback constants block AND the `KEYS` tuple in `reconcile_engine_meta()`
5. `tests/data-shape.test.js` — at least one assertion should pin the new field
6. `CHANGELOG.md` — bump `ENGINE_VERSION` and document the change

Embedded data fields written per session (defaults):

| Field | Type | Value |
| --- | --- | --- |
| `taskData` | JSON string | array of trial objects (see schema below) |
| `taskData_diagnostics` | JSON string | `{ touchMode, touchModeDiagnostics }` (touch-detection signals) |
| `taskData_meta` | JSON string | `getEngineMeta(settings)` — engine version + wire-format constants |
| `confidence_fimi_<pairId>` | string | `"1"`–`"7"`, or `"skip"` / `"timeout"` |
| `report_fimi_<pairId>` | string | `"1"`–`"7"`, or `"skip"` / `"timeout"` |
| `check_sources_fimi_<pairId>` | string | `"1"`–`"7"`, or `"skip"` / `"timeout"` |
| `taskStatus_state` | string | last lifecycle marker reached (`script_loaded` → `complete` / `crashed`; see `TELEMETRY_STATES`) |
| `taskStatus_progress` | string | `"<idx>/<n>"` trial counter (empty before main task) |
| `taskStatus_assets` | string | `"<loaded>/<total>"` image preload counter |
| `taskStatus_assetsFailed` | JSON string | array of URLs that errored or timed out (>20s) during preload |
| `taskStatus_errors` | JSON string | rolling array of `{ts, source, state, message, stack}` from `window.error` / `unhandledrejection` / `startTask` try-catch |
| `taskStatus_visibility` | JSON string | last 20 `visibilitychange` events `{ts, state}` |
| `taskStatus_exitReason` | string | `pagehide` / `pagehide_persisted` / `beforeunload` if the page is being torn down |
| `taskStatus_heartbeatMs` | string | `performance.now()` of the last 2.5s heartbeat — stale value vs `stateMs` = silent abandonment |
| `taskStatus_stateMs` | string | `performance.now()` when `taskStatus_state` was last updated |
| `taskStatus_lastTrialEvent` | string | last response event (`CLICK` / `TIMEOUT` / `SKIP`) |
| `taskStatus_touchMode`, `taskStatus_language`, `taskStatus_engineVersion` | string | session metadata |

The `taskStatus_*` fields are written **continuously** (every state transition + 2.5s heartbeat), not only at the end. They are designed so an in-progress / abandoned response in Qualtrics still has enough breadcrumbs to classify the dropout cause. The full state schema is exposed in `getEngineMeta().telemetryStates` so QC consumers don't have to redeclare it.

Trial object shape:
```
{
  event:      "CLICK" | "TIMEOUT" | "SKIP",
  pairId:     "01"…"08",
  assignment: [ { id, type: "fimi"|"non", side: "left"|"right", filename } × 2 ],
  chosenId:   "<pairId>-FIMI" | "<pairId>-NON" | null,
  chosenType: "fimi" | "non" | null,
  isCorrect:  boolean,
  confidence: 1–7 | null,
  reportManipulated: 1–7 | null,
  checkSources: 1–7 | null,
  tsStart, tsEnd, rt: number (ms, performance.now()),
  mouse: [ { ts, pageX, pageY, hovTarg } ],
  touch: [ { ts, target, event: "reveal"|"conceal" } ]
}
```

`isCorrect` is computed against `settings.SELECT_TARGET` (`"fimi"` or `"non"`). Studies have shipped with both values — **never assume one**; always read it from settings.

---

## 5. Local development & testing

There is no build step and no bundler. Three workflows you should know about:

**Local dev harness — `dev/index.html`.** The fastest feedback loop:

```bash
# from this directory
python3 -m http.server 8000
open http://localhost:8000/dev/
```

The harness ships with a fake `Qualtrics.SurveyEngine` that captures every `setEmbeddedData` write into a panel below the task. Edit `dev/dev-config.js` to change settings; reload to restart. The "Force touch mode" toggle persists across reloads via sessionStorage so you can easily switch between desktop and touch flows. `STIMULI_URL` points at the production CDN by default, so artwork loads without a local copy.

**Stress-testing dropout telemetry.** The harness has a yellow "Stress test" bar with buttons that inject each failure mode:

- **Broken asset URL** — points `STIMULI_URL` at a non-existent host. Expect `taskStatus_assetsFailed` to fill, `taskStatus_state="assets_preload_partial"`.
- **Slow assets (30s)** — wraps `Image` to delay `onload` past the 20s preload-timeout fallback. Same telemetry signature as the above, but via the timeout path rather than `onerror`.
- **Crash on trial 2** — throws a synchronous error during the second trial. Expect `taskStatus_state="crashed"`, `taskStatus_errors` populated.
- **Uncaught error after 3s** — fires a stray `throw` from `setTimeout`. Exercises the `window.error` global handler (state freezes mid-trial, error recorded).
- **Unhandled rejection** — fires a stray `Promise.reject`. Exercises `unhandledrejection`.
- **Fast timeout (1.5s)** — sets `STIMULUS_TIMEOUT=1500` so the main task runs to completion with mostly `TIMEOUT` events. Useful for verifying lifecycle flow at speed.

To simulate **silent abandonment**, just close the tab while the task is mid-trial — the heartbeat will go stale relative to `taskStatus_stateMs`. To simulate **intentional quitting**, navigate away (the toolbar's "Reload" button counts). Distinguish them in the captured-data panel: `taskStatus_exitReason` is set for intentional, absent for silent.

The telemetry ribbon above the task shows the current `taskStatus_state` live, so you can see the classification change as you trigger each scenario. Stress-test mode persists across reloads via `sessionStorage`; click "Clear" to reset.

**Unit tests — `tests/`** (Node ≥ 18 for `node:test`, no other deps):

```bash
node --test tests/*.test.js
# or, from monorepo root:
npm run test:deconspirator
```

The tests pin the trial-object shape (`buildTrial`), settings merging (`mergeSettings` warns on typos), stimulus validation (`validateStimuliPairs`), engine meta surface (`getEngineMeta`), the Telemetry public surface + state schema (`tests/telemetry.test.js`), and the OR-of-signals touch detection (`isTouchPrimary`, `readTouchSignals`). **Run before any change to wire format or engine config.** The engine exports its pure helpers via CommonJS, gated on `module !== undefined`, so requiring it in Node is safe (no auto-run, no DOM access).

**Stress tests — `stress-tests/`** (Playwright; monorepo-root devDep):

```bash
# From monorepo root:
npm run stress:deconspirator           # headless, all scenarios
npm run stress:deconspirator:headed    # watch each scenario in a real browser
npm run stress:deconspirator:ui        # Playwright UI mode (per-test trace viewer)
```

Two spec files in `stress-tests/`:

- **`dropout-classification.spec.js`** — pins the telemetry signature for each of the five dropout classes (loading failure, asset timeout, JS crash, silent abandonment, intentional quit) plus a lifecycle-coverage check that asserts every non-error state in `TELEMETRY_STATES` is reached during an `auto-timeout` run. If any assertion fails, the **dropout dashboard's classification rules need to update in lockstep** — that's the whole point of pinning here.

- **`environment-hostility.spec.js`** — pins behaviour under real-world participant browsers and networks: iOS Facebook in-app webview / Samsung Internet / iOS Safari (UA + viewport emulation), ad/script blockers (per-URL request abort), CDN block + CORS-style 403 on stimuli, real network throttling (25s delay), private-browsing sessionStorage sabotage, and visibilitychange / background-tab cycles. Each test asserts the task either completes cleanly OR leaves a classifiable telemetry signature. A regression here means a real participant in that environment would disappear from the data without us being able to tell why.

The Playwright config launches `python3 -m http.server 8765` from `deconspirator/` as its `webServer`, so specs hit `/dev/?stress=<mode>`. Test artefacts (traces, screenshots) are written to `<repo-root>/.playwright-stress-artifacts/` — explicitly outside the static-asset tree because anything under `sites/tdfc/public/` would otherwise be served at thedataflowcompany.com.

Playwright is installed as a monorepo-root devDependency. From the deconspirator directory you cannot run `npm install` locally — there is intentionally no `node_modules` here (it lives under `public/`, which is served). Always run stress tests from the monorepo root.

**Inside Qualtrics.** Paste `js/task-item.js` into the question's JS editor; load `deconspirator-task.js` and the CSS via `<script>`/`<link>` in the question's source or via Look & Feel → Header. The question HTML must contain `<div id="task"></div>`.

**Mobile/touch.** Use Chrome DevTools device emulation *and* a real device — emulators and the Qualtrics mobile preview disagree on viewport reporting at `addOnload`, which is why touch-mode resolution runs twice (see `resolveTouchMode`).

**Data-shape regression check.** If you change anything in the trial schema or `getEngineMeta`, also run:

```bash
python3 data/check_data_quality.py data/<latest_export>.csv --out-prefix /tmp/qc_check
```

The QC will print `[meta] adopted engine config from taskData_meta — version=…` when reading from a session that includes the new meta field; otherwise it falls back to the script-level constants.

The host monorepo's commands (`npm run dev:tdfc`, `npm run build`) are unrelated to this task — they build the marketing site that *serves* these files. Editing files here does not require running the Next.js dev server.

---

## 6. Conventions to follow

- **Vanilla ES2017+** (`async`/`await`, template literals, `const`/`let`). No frameworks, no transpilation, no `import`/`export` — keep everything as plain `<script>`-loadable code.
- **No new runtime dependencies.** This file is pasted into Qualtrics; an extra `<script src=…>` is friction the survey author should not have to manage.
- **JSDoc on every non-trivial function.** Existing comments document *why*, not *what* (see `attachTouchRevealHandler`, `resolveTouchMode`, `applyTouchModeClass`). Match that style.
- **Settings, never hardcoded copy.** Every user-visible string must be reachable from `defaultSettings` and surfaced in `task-item.js`. Multilingual studies depend on this.
- **Accessibility:** preserve `prefers-reduced-motion` blocks in CSS, `aria-label`s on confidence buttons and the touch select button, and keyboard reachability via `:focus-visible`. Don't strip them.
- **`use strict`** is set at the top of the engine — keep it.
- **Stimulus naming is structural**, not cosmetic: pair `id` joins the FIMI and NonFIMI image, drives the per-pair embedded-data field suffixes, and indexes the QC reports. Never reuse or renumber ids in a live study.

---

## 7. Common change recipes

**Add a stimulus pair (e.g. `09`):**
1. Drop `FIMI-09.jpg` and `NonFIMI-09.jpg` in `stimuli/` (and `stimuli/<lang>/` for each translation).
2. Append `{ id: "09", fimi: "FIMI-09.jpg", non: "NonFIMI-09.jpg" }` to `STIMULI_PAIRS` in `task-item.js`.
3. **No Python change required for new exports** — `reconcile_engine_meta` reads `expectedPairIds`/`expectedNTrials`/`CONFIDENCE_COLS` from `taskData_meta`. Only update the fallback constants in `check_data_quality.py` if you want pre-2026.05.04 exports re-QC'd against the new pair count.
4. Re-deploy the static files (commit + merge to `main`; the TDFC site serves `public/files/` as-is).

**Translate the task:**
- Translate every label in the `userSettings` object in `task-item.js` (`SKIP_STIMULUS_LABEL`, `INTER_TRIAL_LOADER_MSG_*`, `TOUCH_SELECT_LABEL`, each `question` and `labels` entry inside `FOLLOW_UP_QUESTIONS`, `POST_CHOICE_SUBMIT_LABEL`, all `TUTORIAL_*`, `END_OF_TASK_*`).
- Point `STIMULI_URL` at the language-specific subfolder if translated artwork exists (e.g. `…/deconspirator/stimuli/lt/`).
- The engine is language-agnostic; do not introduce translation logic into `deconspirator-task.js`.

**Change the timeout or scoring rule:**
- Edit `STIMULUS_TIMEOUT` and/or `SELECT_TARGET` in `task-item.js`. The QC adopts both from `taskData_meta` automatically — no script edit needed for new exports. The fallback constants only matter for pre-meta exports.

**Disable the tutorial / timer / post-choice widget:**
- Set `TUTORIAL_ENABLED: false`, `SHOW_TIMER: false`, or `FOLLOW_UP_QUESTION_ENABLED: false` in `task-item.js`. The engine handles each independently. When follow-up questions are disabled, the post-choice embedded fields are not written with ratings and `taskData_meta.postChoiceFields` is empty.

---

## 8. Pitfalls

- **Don't `--amend` or rebase** the current export CSV in `data/`. It is the working dataset for ongoing analysis; re-checkout is expensive.
- **Don't move JS/CSS out of `public/files/deconspirator/`.** The path is the public URL; live Qualtrics surveys reference it absolutely.
- **Don't rename `taskData`, post-choice field prefixes (`confidence_fimi_`, `report_fimi_`, `check_sources_fimi_`), or the event strings (`CLICK`/`TIMEOUT`/`SKIP`)** without coordinating with whoever runs the analysis pipeline. These are wire-format.
- **Don't AND the touch-detection signals.** They are intentionally OR'd because at least one of them lies on each tested platform — see comment block above `isTouchPrimary`.
- **Don't `.gitignore` or delete `*_diagnostics`.** Field reports rely on it for ambiguous mobile cases.
- **Don't introduce a build step.** Survey authors paste raw URLs into Qualtrics; a build pipeline would silently break deployments without anyone noticing until participants started failing trials.

---

## 9. References

- Engine entry: [js/deconspirator-task.js](js/deconspirator-task.js) (`startTask`, `mergeSettings`, `buildTrial`, `getEngineMeta`, `presentPairAndAwaitResponse`, `storeTaskData`).
- Per-study config template: [js/task-item.js](js/task-item.js).
- Local dev harness: [dev/index.html](dev/index.html), [dev/dev-config.js](dev/dev-config.js).
- Tests: [tests/data-shape.test.js](tests/data-shape.test.js), [tests/touch-detect.test.js](tests/touch-detect.test.js).
- Engine version history: [CHANGELOG.md](CHANGELOG.md).
- Feature catalogue: [data/task_features_description.md](data/task_features_description.md).
- QC pipeline: [data/check_data_quality.py](data/check_data_quality.py) (see `reconcile_engine_meta`), [data/check_taskdata_availability.py](data/check_taskdata_availability.py).
- Hosting site (unrelated to task logic): [../../../../../CLAUDE.md](../../../../../CLAUDE.md).
