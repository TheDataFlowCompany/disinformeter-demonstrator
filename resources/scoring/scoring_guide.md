# DisInforMeter — scoring guide

This guide is the authoritative scoring reference for the DisInforMeter toolkit,
condensed from the D5.3 policy-report supplement (construct-reference page). It
covers the receptivity domains, the FIMI detection criterion, and the three scale
versions.

> **The one rule that matters most.** The two sides of the instrument run in
> **opposite directions** and must **never** be averaged into a single
> "vulnerability" number:
> - **Receptivity domains** — higher = *more* receptivity-relevant endorsement.
> - **FIMI detection** — higher = *better* detection (1 = certainly **not**
>   manipulated → 7 = certainly manipulated). Lower = a detection blind spot.

---

## 1. Response scales

| Side | Item type | Scale | Direction |
|---|---|---|---|
| Receptivity domains | Agreement statements | 1 = *strongly disagree* → 7 = *strongly agree* | Higher = more endorsement |
| FIMI detection | "How likely is it that this headline has been manipulated by a foreign actor?" | 1 = *certainly not manipulated* → 7 = *certainly manipulated* | Higher = better detection |

Per-language anchor wording for both scales is in
[`../translations/response_scales.json`](../translations/response_scales.json).

---

## 2. The five receptivity domains

| Domain | What it captures |
|---|---|
| **Threat** | Perceived threat to national identity, security, culture, sovereignty, or social order. |
| **Betrayal / Abandonment** | Perceived failure of domestic institutions, allies, or mainstream information institutions to protect citizens. |
| **Fear / Pragmatism** | Anxiety-driven openness to accommodation with hostile or rival powers as a route to safety. |
| **Foreign-Power Admiration** | Positive affect toward Russia, China, or alternative geopolitical models (Russia and China sub-blocks). |
| **General Anchor** | Cross-cutting affective stance toward protection, external threats, and rival powers. |

**Domain score** = mean of the domain's items (after reverse-coding where the
wrangling marks it), on the 1–7 scale.

**Overall DisInforMeter composite** = mean of the five domain scores, z-scored
and rescaled to 1–7 for display. Higher = more receptivity-relevant endorsement.

---

## 3. FIMI detection criterion

All eight FIMI items are **confirmed foreign-manipulation cases**. Respondents
rate how likely each headline is to have been manipulated by a foreign actor.

| Score | Items |
|---|---|
| **Full FIMI** | all 8 items (`news1`–`news8`) |
| **Russian-origin** | `news1`–`news5` |
| **Chinese-origin** | `news6`–`news8` |
| **Short FIMI** (source-balanced) | `news2`, `news5`, `news7`, `news8` |

Each is the item mean on the 1–7 scale (higher = better detection).

> Always report **Full FIMI together with the Russian- and Chinese-origin
> variants** — the source split is a headline result, not a robustness detail.

---

## 4. Scale versions

| Version | What it is | Items | Fielded in |
|---|---|---|---|
| **Long** | Full validated item pool (first- and higher-order). For diagnostic precision, intervention evaluation, detailed domain modelling. | first- + higher-order pool | S2, S3, S5 |
| **Short** | Recommended monitoring module: **19 receptivity items across the five domains + 8 FIMI items = 27**. Already translated (see [`../translations/`](../translations/)). For recurring monitoring at minimal respondent burden. | 27 | S4 |
| **Ultra-brief** | The **General Anchor** index — the cross-cutting higher-order items (`gen1`, `gen2`, `gen3`, `gen5`, `gen7`). A broad monitoring signal. **For psychometric/theoretical use; not validated as a stand-alone policy instrument.** | 5 | S4 (final), with similar items in S2/S3/S5 |

Per-item version membership, domains, and per-wave variable names are in
[`../item-bank/item_bank.json`](../item-bank/item_bank.json) /
[`item_bank.csv`](../item-bank/item_bank.csv).

---

## 5. Personalized feedback (intervention)

The S5 intervention scores four domains (Threat, Betrayal/Abandonment,
Fear/Pragmatism, Foreign-Power Admiration), ranks them, and returns tailored
feedback for the participant's relatively **strongest** (two highest) and
**weakest** (two lowest) domains. Logic and message text:
[`../feedback/feedback_logic.json`](../feedback/feedback_logic.json).

---

## 6. Boundary of interpretation

The DisInforMeter is a **population-monitoring and survey-research instrument**.
It is **not** an individual risk-profiling tool, a content-moderation tool, or a
stand-alone basis for enforcement. Country results are evidence for policy
prioritisation and follow-up analysis — **not** country verdicts, and never a
basis for individual-level targeting. Cross-national comparisons are strongest as
profiles, ranks, and associations; absolute latent-mean comparisons carry a
scalar-invariance caveat.

---

*Source: DE-CONSPIRATOR D5.3 DisInforMeter Policy Report & online supplement
(construct-reference page). Grant Agreement No. 101132671.*
