# Reproducible scripts

## Resource extraction and builds

The extraction scripts are reproducible builders for everything under
[`../resources/`](../resources/). They use only the Python 3 standard library.
Each script prints a coverage report and ends with an `assert`-based self-check
(non-zero exit on any failure).

| Script | Reads | Writes |
|---|---|---|
| `extract/extract_translations.py` | `docs/Multilingual_short_version.qsf` | `resources/translations/` (4 files) |
| `extract/extract_feedback.py` | `docs/Personalized_Feedback_Qualtrics.qsf` | `resources/feedback/feedback_logic.json` |
| `extract/build_item_bank.py` | `resources/item-bank/item_mapping_overview.csv` + `resources/translations/short_module_translations.json` | `resources/item-bank/item_bank.{json,csv}` |

## Run order

`build_item_bank.py` joins against the translations output, so:

```bash
python3 scripts/extract/extract_translations.py
python3 scripts/extract/extract_feedback.py
python3 scripts/extract/build_item_bank.py
```

## Design notes

- **No fuzzy text matching for translations.** The item → Qualtrics-choice map in
  `extract_translations.py` is explicit and auditable, because the deployed S4
  English differs slightly from the harmonised analysis wording for a handful of
  items (so normalised-text joins would be fragile). Both wordings are kept.
- **QSF duplicate tags.** Both Qualtrics files contain inactive duplicate blocks
  sharing the same `DataExportTag`. The scripts prefer the payload that actually
  carries content (real `ChoiceDataExportTags` / `QuestionJS` / longer text).
- **Self-checks pin the known shape:** 27 short-module items, 19 receptivity +
  8 FIMI (5 Russian / 3 Chinese), full coverage in every primary language; 4
  feedback domains with LT + EN text; item-bank counts (short = 27,
  ultra-brief = 5).

## Site build

`sync-public.mjs` assembles the generated `public/` tree (client data, the
choice-task bundle, downloads, figures, brand marks, favicon) from `resources/`
and `docs/`. It runs automatically via npm `predev`/`prebuild`, so `public/` is
git-ignored and always derived:

```bash
npm run sync     # or just npm run dev / npm run build
```

It throws on any missing source rather than shipping a half-built tree.

> The scripts that build the D5.2 Word report live with the report itself, in the
> separate `disinformeter-demonstrator-report` repository. This repository is the
> demonstrator only.
