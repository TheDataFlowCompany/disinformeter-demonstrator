# Short-module translations (18 + 1 languages)

Translator-confirmed wording of the recommended **27-item short module** (19
receptivity items across five domains + 8 FIMI detection items), as fielded
multinationally in **Study 4 (Dec 2025)**, extracted directly from the Qualtrics
export `../../docs/Multilingual_short_version.qsf`.

Regenerate: `python3 scripts/extract/extract_translations.py`

## Files

| File | Format | Use |
|---|---|---|
| `short_module_translations.json` | nested JSON | App-ready. One object per item with `english_harmonised`, `english_deployed`, `construct`, `origin`, and a `translations` map of all languages. `_meta.languages` flags primary vs. extra. |
| `short_module_translations_long.csv` | tidy long | One row per item × language. For analysis / spreadsheets. |
| `short_disinformeter_languages_filled.csv` | wide | Drop-in replacement for the supplement's Annex-B stub (14 primary language columns). |
| `response_scales.json` | JSON | 1–7 agreement (Likert) and FIMI-detection anchor wording, per language. |

## Languages (19)

- **Primary** (S4 *n* ≥ 50) — EN (source), BG, DE, ET, FR, HU, IT, LT, LV, NL, PL, RU, SR, TR.
- **Extra** (carried in the deployment, S4 *n* < 50) — AR, FA, ZH-S, KAT, UK.

All 27 items are present in all 19 languages (513 cells, fully populated).

## Notes

- **EN is the source language** and comes from the base survey, not from a
  translation block.
- `english_deployed` is the exact S4 wording the translations correspond to;
  `english_harmonised` is the analysis wording (see `../README.md` → "Wording
  note"). The translation columns track the *deployed* wording.
- Short FIMI (source-balanced) = `news2`, `news5`, `news7`, `news8`.
