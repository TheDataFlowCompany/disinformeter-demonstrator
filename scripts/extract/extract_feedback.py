#!/usr/bin/env python3
"""Extract the DisInforMeter personalized-feedback intervention (S5 Lithuania).

After completing the DisInforMeter, S5 participants received feedback tailored to
their *relative* standing across four affective domains: the two domains on which
they scored relatively high were framed with a "high"-resonance message, the two
on which they scored relatively low with a "low"-resonance message. The selection
runs entirely client-side in a Qualtrics question's JavaScript ("DONT DELETE RANK
JS"); the message texts are static display blocks.

This script captures the intervention as a single self-describing JSON:
  - the exact ranking algorithm (verbatim JS + a plain-language description),
  - the general intro shown to all participants,
  - the four feedback domains and which DisInforMeter subscale each maps to,
  - every feedback message block, verbatim Lithuanian (the deployed wording) plus
    the project's official English wording, and
  - the shared closing tips ("end for all").

The Lithuanian is pulled live from the QSF so it can never drift from what was
fielded; the English is the official English version of the intervention
(docs/DisInforMeter_feedback_intervention.docx), curated here. The intro is new
in that doc and not in the QSF, so it is curated in both languages.

Run:  python3 scripts/extract/extract_feedback.py
Output:  resources/feedback/feedback_logic.json
"""
from __future__ import annotations
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
QSF = ROOT / "docs" / "Personalized_Feedback_Qualtrics.qsf"
OUT = ROOT / "resources" / "feedback"

# Feedback domain -> (DisInforMeter domain label, embedded-data subscale field,
#                     QSF block tag for low / high message)
DOMAINS = [
    ("threat", "Threat", "meanscore_threat", "threat low", "threat high"),
    ("aband",  "Betrayal / Abandonment", "meanscore_aband", "aband low", "aband high"),
    ("fear",   "Fear / Pragmatism", "meanscore_fear", "fear low", "fear high"),
    ("super",  "Foreign-Power Admiration", "meanscore_super", "super low", "super high"),
]
RANK_JS_TAG = "DONT DELETE RANK JS"
CLOSING_TAG = "end for all"

# Official English wording of the intervention (from
# docs/DisInforMeter_feedback_intervention.docx — the project's English version).
# The study itself was fielded in Lithuanian; the LT here is pulled verbatim from
# the QSF, the EN is the official English text lightly normalised to plain prose
# (leading "(n)" item markers dropped, " - " set as em dashes, one source typo
# "coutries" corrected). Crafted to the anti-reactance principles in the docx:
# neutral-analytical, emotion-normalising, externally attributing, autonomy-
# preserving — never "vulnerable", "at-risk", or "high susceptibility".
EN = {
    "threat low": (
        "Messages emphasizing existential threats to culture, identity, or "
        "national survival tend to have a limited emotional impact on you.\n\n"
        "Such emotional reactions are often linked to a greater ability to "
        "distinguish between legitimate societal challenges and narratives that "
        "exaggerate threats to provoke fear or anger. This response pattern is "
        "generally associated with greater resilience to information manipulation "
        "strategies employed by hostile foreign countries that rely on threat "
        "amplification."),
    "threat high": (
        "Messages emphasizing threats to national identity, culture, or social "
        "order may have a strong emotional impact.\n\n"
        "Such emotional reactions are common and understandable. Information "
        "campaigns employed by hostile foreign countries often deliberately "
        "amplify these themes because they are effective at capturing attention "
        "and influencing people's views. Becoming aware of this tactic can help "
        "reduce its influence."),
    "aband low": (
        "You generally maintain trust in institutions and mainstream media, even "
        "when you disagree with their decisions.\n\n"
        "This tendency is associated with greater resistance to narratives that "
        "frame states, allies, or media as fundamentally hostile or deceptive — a "
        "method of information manipulation frequently used by hostile foreign "
        "countries."),
    "aband high": (
        "Messages emphasizing distrust of, or abandonment by, institutions, "
        "allies, or media may have a strong emotional impact.\n\n"
        "Such feelings are widely exploited in information campaigns by hostile "
        "foreign countries, which often aim to weaken trust and foster social "
        "fragmentation. Awareness of this strategy can help better recognize when "
        "distrust is being intentionally amplified."),
    "fear low": (
        "Fear-based messages emphasizing unavoidable conflict or the need for "
        "peace 'at any cost' generally have limited influence.\n\n"
        "This increases resilience to manipulation strategies that rely on anxiety "
        "and risk exaggeration to justify appeasement or passivity."),
    "fear high": (
        "Fear of conflict and its consequences may influence how information is "
        "evaluated in certain contexts.\n\n"
        "Information campaigns by hostile foreign countries often exploit such "
        "fears by framing confrontation as irrational or catastrophic. "
        "Understanding this tactic can help distinguish genuine risk assessment "
        "from fear-based persuasion."),
    "super low": (
        "Messages portraying hostile foreign countries as powerful or superior "
        "usually do not have an influence on your emotions.\n\n"
        "This increases resilience against narratives that exaggerate the "
        "strength, morality, or inevitable rise of hostile foreign countries in "
        "order to influence political attitudes."),
    "super high": (
        "Messages portraying hostile foreign countries as powerful or superior may "
        "evoke overly sympathetic reactions.\n\n"
        "Such narratives are commonly used by hostile foreign countries in their "
        "information campaigns to build legitimacy and foster emotional "
        "attachment. Recognizing this pattern does not invalidate genuine "
        "admiration — it simply helps distinguish personal evaluation from "
        "information attacks."),
    "end for all": (
        "Summary of quick habits that improve resilience:\n"
        "• Pause briefly when a headline triggers strong emotion.\n"
        "• Check if another independent outlet reports the same facts.\n"
        "• Search one key phrase from the headline to confirm accuracy.\n\n"
        "Information manipulation does not rely on ignorance — it relies on "
        "emotions that are shared by many people. Becoming aware of how different "
        "messages affect you is one of the most effective ways to reduce their "
        "influence."),
}

# General intro shown to every participant before the per-domain feedback. New in
# the official intervention doc; not present in the QSF, so both languages are
# curated here (LT verbatim from the doc, the deployed wording).
INTRO = {
    "en": (
        "Thank you for completing the DisInforMeter questionnaire.\n\n"
        "This questionnaire examines four ways in which emotionally engaging or "
        "strategically framed manipulative information may influence people. Based "
        "on your responses, the feedback below reflects your actual performance, "
        "highlighting areas where you may be more or less affected by different "
        "types of messages."),
    "lt": (
        "Ačiū, kad užpildėte DisInforMeter klausimyną.\n\n"
        "Šis klausimynas nagrinėja keturis būdus, kaip emociškai įtraukianti arba "
        "strategiškai suformuluota manipuliatyvi informacija gali paveikti žmones. "
        "Remiantis jūsų atsakymais, žemiau pateikiamas grįžtamasis ryšys atspindi "
        "jūsų faktinius rezultatus, išryškindamas sritis, kuriose galite būti "
        "labiau arba mažiau paveikūs skirtingų tipų žinutėms."),
}

ALGORITHM = {
    "summary": (
        "Each participant's four domain mean scores are ranked. The two "
        "highest-scoring domains are framed with the 'high'-resonance message and "
        "the two lowest with the 'low'-resonance message, so feedback targets the "
        "participant's relatively strongest and weakest domains rather than "
        "absolute cut-offs."),
    "steps": [
        "Read the four domain mean scores (meanscore_threat/aband/fear/super) from "
        "embedded data; abort gracefully (ranking_valid=0) if any is non-numeric.",
        "Sort the four domains ascending by score.",
        "Assign competition ranks (ties share a rank, eps = 1e-9).",
        "Partition into a 'bottom' group (two lowest) and a 'top' group (two "
        "highest); ties are shuffled randomly so no domain is systematically "
        "favoured when scores are equal.",
        "For each domain set show_<domain>_high = 1 if it is in the top group, "
        "else 0. Survey flow then displays the domain's 'high' block when the flag "
        "is 1 and its 'low' block when 0.",
        "Advance automatically (3s safety-net timeout reveals the Next button if "
        "the script fails).",
    ],
    "groups": {"top": "two highest-scoring domains -> 'high' message",
               "bottom": "two lowest-scoring domains -> 'low' message"},
    "note": ("The four feedback domains are Threat, Betrayal/Abandonment, "
             "Fear/Pragmatism and Foreign-Power Admiration. The General Anchor is "
             "not used for feedback. Foreign-Power Admiration ('super') combines "
             "the Russia and China admiration items."),
}


def block_text(payload: dict) -> str:
    """Display text of a feedback block, lightly normalised to readable plain text."""
    t = payload.get("QuestionText") or ""
    t = re.sub(r"<br\s*/?>", "\n", t)
    t = re.sub(r"</p\s*>", "\n", t, flags=re.I)
    t = re.sub(r"<li\s*>", "\n• ", t, flags=re.I)
    t = re.sub(r"<[^>]+>", " ", t)
    t = html.unescape(t).replace(" ", " ")
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r" *\n *", "\n", t)
    return re.sub(r"\n{3,}", "\n\n", t).strip()


def main() -> int:
    if not QSF.exists():
        sys.exit(f"QSF not found: {QSF}")
    OUT.mkdir(parents=True, exist_ok=True)
    data = json.loads(QSF.read_text(encoding="utf-8"))
    # Some tags appear twice (an empty placeholder + the real block). Prefer the
    # payload carrying content (QuestionJS for the ranking block, QuestionText
    # for the message blocks).
    by_tag: dict[str, dict] = {}
    for el in data["SurveyElements"]:
        if el.get("Element") != "SQ":
            continue
        p = el["Payload"]
        tag = p.get("DataExportTag")
        prev = by_tag.get(tag)
        if prev is None:
            by_tag[tag] = p
            continue
        # Prefer JS when present; otherwise prefer the longer (real) display text.
        if p.get("QuestionJS") and not prev.get("QuestionJS"):
            by_tag[tag] = p
        elif not prev.get("QuestionJS") and len(p.get("QuestionText") or "") > len(prev.get("QuestionText") or ""):
            by_tag[tag] = p

    # ranking JS verbatim
    rank_payload = by_tag.get(RANK_JS_TAG)
    if not rank_payload or not rank_payload.get("QuestionJS"):
        sys.exit(f"FATAL: ranking JS block {RANK_JS_TAG!r} not found.")
    rank_js = rank_payload["QuestionJS"]

    domains = []
    for key, label, field, low_tag, high_tag in DOMAINS:
        low_p, high_p = by_tag.get(low_tag), by_tag.get(high_tag)
        if not low_p or not high_p:
            sys.exit(f"FATAL: feedback blocks for {key} not found ({low_tag} / {high_tag}).")
        domains.append({
            "key": key,
            "disinformeter_domain": label,
            "subscale_field": field,
            "show_flag": f"show_{('superior' if key == 'super' else key)}_high",
            "messages": {
                "low": {"lt": block_text(low_p), "en": EN[low_tag]},
                "high": {"lt": block_text(high_p), "en": EN[high_tag]},
            },
        })

    closing_p = by_tag.get(CLOSING_TAG)
    closing = {"lt": block_text(closing_p) if closing_p else "", "en": EN[CLOSING_TAG]}

    out = {
        "_meta": {
            "title": "DisInforMeter personalized-feedback intervention",
            "study": "S5 (Lithuania, Mar–Apr 2026)",
            "source": "docs/Personalized_Feedback_Qualtrics.qsf",
            "generated_by": "scripts/extract/extract_feedback.py",
            "deployed_language": "Lithuanian (lt) is the verbatim deployed text. "
                                 "English (en) is the project's official English "
                                 "wording (docs/DisInforMeter_feedback_intervention.docx); "
                                 "the study was fielded in Lithuanian.",
            "n_domains": len(domains),
        },
        "algorithm": ALGORITHM,
        "ranking_js": rank_js,
        "intro": INTRO,
        "domains": domains,
        "closing": closing,
    }
    (OUT / "feedback_logic.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")

    # report + self-check
    print(f"Extracted {len(domains)} feedback domains + closing block.")
    for d in domains:
        print(f"  {d['key']:7} -> {d['disinformeter_domain']:26} "
              f"low={len(d['messages']['low']['lt'])}c high={len(d['messages']['high']['lt'])}c")
    assert len(domains) == 4, "expected 4 feedback domains"
    for d in domains:
        for level in ("low", "high"):
            assert d["messages"][level]["lt"], f"missing LT text {d['key']}/{level}"
            assert d["messages"][level]["en"], f"missing EN text {d['key']}/{level}"
    assert "addOnReady" in rank_js, "ranking JS looks wrong"
    assert closing["lt"] and closing["en"], "missing closing text"
    assert INTRO["en"] and INTRO["lt"], "missing intro text"
    # anti-reactance guard: stigmatising vocabulary must never reach EN feedback.
    banned = ("vulnerable", "at-risk", "at risk", "high susceptibility", "susceptible")
    en_corpus = " ".join(
        [INTRO["en"], closing["en"]]
        + [d["messages"][lv]["en"] for d in domains for lv in ("low", "high")]
    ).lower()
    bad = [w for w in banned if w in en_corpus]
    assert not bad, f"stigmatising wording in EN feedback: {bad}"
    print("self-check OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
