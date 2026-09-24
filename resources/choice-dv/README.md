# FIMI choice task — pointer

The complementary behavioural DV. Each trial shows two news clippings hidden
behind tiles; the participant reveals them (hover on desktop, tap on mobile) and
picks the one they judge to be **foreign-manipulated (FIMI)**, then answers a
short post-choice battery (confidence, report intention, verify intention).
Beyond the choice it records process data: mouse trajectories, reveal/conceal
events, and response times.

## Where the code lives

The engine is **not duplicated here** — its single source of truth is the
self-contained bundle at [`../../docs/choice-dv/`](../../docs/choice-dv/):

| Path | What |
|---|---|
| `docs/choice-dv/js/deconspirator-task.js` | The engine (`window.startTask` + pure helpers). |
| `docs/choice-dv/js/task-item.js` | Per-study config (pasted into Qualtrics). |
| `docs/choice-dv/css/deconspirator-task.css` | Styles. |
| `docs/choice-dv/dev/index.html` | **Local dev harness** with a faux Qualtrics engine — the basis for the demonstrator's playable embed. |
| `docs/choice-dv/stimuli/` | Image stimuli (EN + `de/`, `lt/`, `pl/` localisations). |
| `docs/choice-dv/tests/` | `node:test` suites (49 tests, all passing). |
| `docs/choice-dv/AGENTS.md` | Full architecture & constraints. |

## Verify it runs

```bash
npm test --prefix docs/choice-dv                # 49 tests
python3 -m http.server 8000                     # then open docs/choice-dv/dev/index.html
```

## Demonstrator plan

The Astro app will embed the dev harness (or a trimmed build of the engine +
stimuli) as a **playable** module, with an explainer on what it measures and how
it scores. No build step is required — it is vanilla JS/CSS + images.
