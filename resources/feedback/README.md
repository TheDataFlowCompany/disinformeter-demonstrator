# Personalized feedback intervention

The S5 (Lithuania, Mar–Apr 2026) intervention returns feedback tailored to a
respondent's **relative** standing across four DisInforMeter domains. Extracted
from `../../docs/Personalized_Feedback_Qualtrics.qsf`.

Regenerate: `python3 scripts/extract/extract_feedback.py`

## How it works

Four domain mean scores — **Threat**, **Betrayal/Abandonment**,
**Fear/Pragmatism**, **Foreign-Power Admiration** — are ranked. The two
highest-scoring domains receive the **"high"-resonance** message; the two lowest
receive the **"low"-resonance** message. Ties are broken randomly so no domain is
systematically favoured. (The General Anchor is not used for feedback.)

The selection runs client-side in a Qualtrics question's JavaScript; survey flow
then shows the matching message block per domain via `show_<domain>_high` flags.

## `feedback_logic.json`

| Key | Contents |
|---|---|
| `algorithm` | Plain-language summary + ordered steps + group semantics. |
| `ranking_js` | The **verbatim** Qualtrics ranking JavaScript. |
| `intro` | General intro shown to everyone before the per-domain feedback. |
| `domains[]` | Per domain: DisInforMeter label, subscale embedded-data field, `show_flag`, and `low`/`high` messages. |
| `closing` | Shared closing tips shown to everyone. |

Each message has **`lt`** (verbatim deployed Lithuanian, pulled live from the QSF)
and **`en`** (the project's **official English** wording, from
`../../docs/DisInforMeter_feedback_intervention.docx`). The study was fielded in
Lithuanian; the English is the official English version of the intervention.

`intro` is new in that doc and not present in the QSF, so both languages are
curated in the extraction script (LT verbatim from the doc).

The English text follows the doc's anti-reactance principles — neutral-analytical,
emotion-normalising, externally attributing, autonomy-preserving — and the
extraction self-check fails if stigmatising vocabulary (`vulnerable`, `at-risk`,
`high susceptibility`, …) ever reaches the English feedback.
