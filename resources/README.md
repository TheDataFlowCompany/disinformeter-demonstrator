# Resources — manifest, provenance & licensing

Curated, documented, machine-readable resources for the DisInforMeter
demonstrator. Everything here is either **copied** from a documented upstream
source or **generated** by a script in [`../scripts/`](../scripts/). Nothing is
hand-edited where a script can regenerate it.

## Manifest

| Path | What | Provenance / generator |
|---|---|---|
| `item-bank/item_bank.json` · `.csv` | Consolidated item bank: 151 items, every version/domain/study + full English wording. | `scripts/extract/build_item_bank.py` |
| `item-bank/item_mapping_overview.csv` etc. | Harmonised cross-wave item maps (vendored copies). | scale-development repo `outputs/` |
| `item-bank/construct_reference_card.csv` | Plain-language construct dictionary. | D5.3 supplement `tables_raw/` |
| `translations/short_module_translations.json` | **19-language** short-module matrix, 27 items × 19 languages (513 cells). | `scripts/extract/extract_translations.py` ← `docs/Multilingual_short_version.qsf` |
| `translations/short_module_translations_long.csv` | Same, tidy long format. | ″ |
| `translations/short_disinformeter_languages_filled.csv` | Drop-in fill of the supplement's Annex-B stub (14 primary langs). | ″ |
| `translations/response_scales.json` | 1–7 Likert + FIMI anchor wording per language. | ″ |
| `feedback/feedback_logic.json` | Personalized-feedback ranking algorithm + message text (LT verbatim + EN rendering). | `scripts/extract/extract_feedback.py` ← `docs/Personalized_Feedback_Qualtrics.qsf` |
| `scoring/scoring_guide.md` | Authoritative scoring reference. | Condensed from D5.3 supplement |
| `policy-report/d5-3_DisInforMeter_PolicyReport.pdf` | The D5.3 policy report. | scale-development repo `D5-3_.../LaTeX/` |
| `policy-report/figures/*.png` | Key architecture/overview figures. | D5.3 supplement `figures/` |
| `choice-dv/README.md` | Docs/pointer for the FIMI choice task. | engine lives in `docs/choice-dv/` |

## The flagship: filled translations

The policy-report supplement's Annex B
(`short_disinformeter_languages.csv`) shipped as a **stub** — English wording
authoritative, every other-language column empty — with the note that the
verified translations "will be available with **D5.2 the DisInforMeter
demonstrator**." That promise is fulfilled here: the translator-confirmed wording
fielded in S4 is extracted directly from the Qualtrics survey file, all 27 items
in **19 languages** (14 primary deployment languages with S4 *n* ≥ 50, plus 5
additional languages carried in the deployment: AR, FA, ZH-S, KAT, UK).

## Provenance & data lineage

```
docs/Multilingual_short_version.qsf      ──► extract_translations.py ──► translations/
docs/Personalized_Feedback_Qualtrics.qsf ──► extract_feedback.py     ──► feedback/
scale-dev outputs/item_mapping_*         ──► build_item_bank.py       ──► item-bank/
  + translations/short_module_translations.json (join)
```

The two `.qsf` files are the actual Qualtrics exports of the S4 multilingual
short version and the S5 feedback intervention. The item maps come from the
DisInforMeter scale-development repository, which is the authoritative source for
construct architecture, harmonised wording, and per-wave variable names.

## Wording note (important)

For a few items the **deployed** S4 English differs slightly from the
**harmonised** analysis wording used in the scale-development paper and the
policy-report supplement (e.g. "international community" vs "international
allies", "worried by" vs "worried about"). Both are preserved:
`english_deployed` (what the translations correspond to) and
`english_harmonised` (the analysis wording). They are never silently merged.

## License

Content here is released under
**[CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/)**, with the
interpretation caveats in [`scoring/scoring_guide.md`](scoring/scoring_guide.md).
The FIMI choice-task engine (`docs/choice-dv/`) carries its own terms.
