# DisInforMeter Demonstrator — DE-CONSPIRATOR Deliverable D5.2

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.22936441.svg)](https://doi.org/10.5281/zenodo.22936441)
[![License: CC BY 4.0](https://img.shields.io/badge/License-CC_BY_4.0-lightgrey.svg)](https://creativecommons.org/licenses/by/4.0/)
[![Release](https://img.shields.io/github/v/release/TheDataFlowCompany/disinformeter-demonstrator?label=release)](https://github.com/TheDataFlowCompany/disinformeter-demonstrator/releases)
[![Deploy](https://github.com/TheDataFlowCompany/disinformeter-demonstrator/actions/workflows/deploy.yml/badge.svg)](https://github.com/TheDataFlowCompany/disinformeter-demonstrator/actions/workflows/deploy.yml)
[![Live demonstrator](https://img.shields.io/badge/live-disinformeter.deconspirator.eu-0A66C2)](https://disinformeter.deconspirator.eu)
[![Built with Astro](https://img.shields.io/badge/Astro-BC52EE?logo=astro&logoColor=fff)](https://astro.build)
[![Funded by the European Union](https://img.shields.io/badge/Funded%20by-the%20European%20Union-003399)](https://cordis.europa.eu/project/id/101132671)

A self-contained, interactive web demonstrator of the **DisInforMeter Toolkit**: a
validated population indicator for receptivity to, and detection of, **Foreign
Information Manipulation and Interference (FIMI)**, developed across five studies
and more than 10,000 respondents.

> **Deliverable:** D5.2 — Technical Demonstrator of the scale · **Work package:**
> WP5 · **Dissemination level:** PU (Public) · **Grant Agreement:** 101132671

The demonstrator lets practitioners — survey authorities, media regulators, EDMO
hubs, researchers — **explore the toolkit, learn about its versions and
components, evaluate its utility, and download every key resource**.

---

## The app

An [Astro](https://astro.build) static site (vanilla-JS interactive islands, no
UI framework) that consumes `resources/` and deploys to GitHub Pages.

```bash
npm install
npm run dev       # → http://localhost:4321
npm run build     # → dist/  (prebuild regenerates public/ from resources/)
npm run preview   # serve the built site locally
```

`npm run dev`/`build` first run `npm run sync` (see
[`scripts/sync-public.mjs`](scripts/sync-public.mjs)), which assembles the
generated `public/` tree (client data, the choice-task bundle, downloads,
figures, favicon) from the single-source-of-truth `resources/` and `docs/`.
`public/` and `dist/` are git-ignored — they are fully derived.

Pages: **Overview** (animated gauge hero + the receptivity/detection duality),
**Demonstrator** (the headline experience — see below),
**Versions** (long / short / ultra-brief), **Item explorer** (151 items,
filter by version/type/study, 19-language toggle, localized scale anchors),
**Feedback** (live personalized-feedback simulator, EN + deployed Lithuanian),
**Choice task** (the playable FIMI task embedded), **Evidence** (study chain,
reliability, invariance, figures), and **Downloads**.

### The Demonstrator (D5.2 headline output)

[`/demonstrator`](src/pages/demonstrator.astro) is a **simulated, authentic-feeling
survey** that runs the toolkit end to end, in a distraction-reduced "survey mode"
shell ([`Survey.astro`](src/layouts/Survey.astro)):

1. **Questionnaire** — the 19 receptivity items in a neutral, un-labelled agreement
   battery (domains interleaved so the construct isn't cued), paginated into two
   pages with a live progress bar and forced response. The 8 FIMI headline-rating
   items are deliberately *not* administered here — FIMI detection is covered
   behaviourally by the choice task instead.
2. **Personalized feedback** — the responses are scored *in the browser* into the
   four feedback domains (Threat, Betrayal/Abandonment, Fear/Pragmatism,
   Foreign-Power Admiration), which are then ranked so the deployed **S5 personalized
   feedback** is shown for the relatively strongest/weakest two. No score readout is
   surfaced — this leads with the feedback, the way the intervention is disseminated.
3. **Choice task** — the playable FIMI choice task, embedded.

Runs in **English and Lithuanian** — the two languages with full parity across
items, feedback, and the choice task (LT is the language S5 was actually fielded
in; the question stems come verbatim from the S5 Qualtrics export). **No visitor
data is stored or transmitted** — every run is scored client-side and discarded on
reload. The domain scoring and feedback ranking are a pure, tested module
([`disinformeter-score.mjs`](src/lib/disinformeter-score.mjs), mirroring the
deployed `feedback_logic.json` ranking JS); a "fill at random" affordance lets
evaluators jump to the feedback without answering every item.

### Hosting

The site is published at **<https://disinformeter.deconspirator.eu>**, a custom
domain on GitHub Pages. A push to `main` builds and deploys via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) (Pages source:
“GitHub Actions”). To host elsewhere, override the origin and base path at build
time:

```bash
SITE=https://example.org BASE=/subpath npm run build
```

## Resources

Every input the app needs is collected, organised, documented, and — where it did
not yet exist as reusable data — *generated* under [`resources/`](resources/),
with the reproducible builders in [`scripts/`](scripts/). Highlight: the full
**19-language** short-module translation matrix, which the policy-report
supplement could only ship as an empty stub.

---

## What the toolkit contains

The demonstrator presents **three scale versions** and **three components**.

### Scale versions
| Version | Items | Use |
|---|---|---|
| **Long** | full first- + higher-order pool | Diagnostic precision, intervention evaluation, detailed domain modelling (S2/S3/S5). |
| **Short** | 27 (19 receptivity + 8 FIMI) | Recommended recurring **monitoring** module, multinationally fielded and translated (S4). |
| **Ultra-brief** | 5 (General Anchor) | Broad signal; psychometric/theoretical use, not a stand-alone policy instrument. |

### Components
| Component | What it is |
|---|---|
| **The DisInforMeter scale** | Five receptivity domains (Threat, Betrayal/Abandonment, Fear/Pragmatism, Foreign-Power Admiration, General Anchor) + the FIMI detection criterion. |
| **Personalized feedback** | An intervention returning tailored feedback on a respondent's relatively strongest and weakest domains (S5). |
| **FIMI choice task** | A complementary behavioural DV: detect the foreign-manipulated headline of a pair. Self-contained vanilla-JS task. |

---

## Repository layout

```
disinformeter-demonstrator/
├── README.md                 ← you are here
├── src/                       ← the Astro app
│   ├── pages/                 ← one .astro per route (index, versions, explorer, …)
│   ├── layouts/ components/   ← Base layout, Nav, Footer, Gauge, PageHeader
│   ├── styles/                ← tokens.css (design system) + global.css
│   └── lib/                   ← data access (build-time JSON import) + path helpers
├── astro.config.mjs · package.json · tsconfig.json
├── scripts/
│   ├── sync-public.mjs        ← assembles the generated public/ from resources/ + docs/
│   └── extract/               ← reproducible builders for resources/  (Python, stdlib)
├── resources/                 ← organised, documented, app-ready resources  ⭐
│   ├── README.md              ← resource manifest + provenance + licensing
│   ├── item-bank/             ← consolidated item bank (all versions/domains/studies)
│   ├── translations/          ← 19-language short-module matrix  ⭐ (was a stub upstream)
│   ├── feedback/              ← personalized-feedback logic + message text (LT + EN)
│   ├── scoring/               ← authoritative scoring guide
│   ├── policy-report/         ← D5.3 PDF + key architecture figures
│   └── choice-dv/             ← pointer/docs for the FIMI choice task (engine in docs/)
├── docs/                      ← raw source materials (provenance, as received)
│   ├── Multilingual_short_version.qsf       ← S4 Qualtrics export (translations source)
│   ├── Personalized_Feedback_Qualtrics.qsf  ← S5 feedback intervention export
│   ├── DeConspirator_ChoiceTask_Debrief.pdf ← participant debrief for the choice task
│   ├── brand/                               ← DE-CONSPIRATOR logo + cover mark
│   └── choice-dv/                           ← the FIMI choice-task bundle (engine, tests, stimuli)
├── .github/workflows/deploy.yml             ← GitHub Pages CI
└── public/ · dist/            ← generated (git-ignored)
```

`docs/` is **provenance** (the files as received). `resources/` is the
**curated, documented, machine-readable** layer the app builds on. Nothing in
`resources/` is hand-edited where a script can produce it — re-run the scripts to
regenerate.

---

## Reproduce the resources

Requires only Python 3 (standard library) and Node ≥ 18 (for the choice-task tests).

```bash
# from repo root
python3 scripts/extract/extract_translations.py   # → resources/translations/
python3 scripts/extract/extract_feedback.py        # → resources/feedback/
python3 scripts/extract/build_item_bank.py         # → resources/item-bank/

# verify the FIMI choice task engine
npm test --prefix docs/choice-dv                   # 49 tests
```

Each script prints a coverage report and runs an assertion-based self-check.

---

## How to cite

> Baršytė, J., Kaminskienė, Ž., Zakarevičiūtė, A., & Kreienkamp, J. (2026).
> *DisInforMeter Toolkit — Technical Demonstrator (Deliverable D5.2).*
> DE-CONSPIRATOR Consortium. EU Horizon Europe Grant Agreement No. 101132671.

The academic scale-development write-up and the D5.3 policy-report supplement are
sibling outputs; see [`resources/policy-report/README.md`](resources/policy-report/README.md).

---

## License

Everything in this repository is released under
**[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)** — see
[`LICENSE`](LICENSE). That covers the Astro application, the build and extraction
scripts, the curated resources, the item wording and translations, the figures and
the vendored FIMI choice-task bundle in [`docs/choice-dv/`](docs/choice-dv/).

When reusing material, cite as above and retain the interpretation caveats in
[`resources/scoring/scoring_guide.md`](resources/scoring/scoring_guide.md):
receptivity and detection are separate readouts and must never be combined into a
single susceptibility score.

---

<sub>Funded by the European Union (Grant Agreement No. 101132671). Views and
opinions expressed are those of the authors only and do not necessarily reflect
those of the European Union. Neither the European Union nor the granting authority
can be held responsible for them.

*This deliverable is dedicated to the memory of Justina Baršytė, a dear friend and
a valued colleague, whose inspiration and vision made this work possible.*</sub>
