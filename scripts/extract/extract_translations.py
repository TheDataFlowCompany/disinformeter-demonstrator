#!/usr/bin/env python3
"""Extract the multilingual DisInforMeter short module from the S4 Qualtrics export.

The policy-report supplement ships only a STUB language matrix
(`short_disinformeter_languages.csv`) — the English wording is authoritative and
every other-language column is empty, with a note that the verified translations
"will be available with D5.2 the DisInforMeter demonstrator". This script makes
good on that promise: it pulls the translator-confirmed wording for all 27
short-module items, in every language carried in the S4 deployment, straight out
of the Qualtrics survey file.

Source of truth
---------------
- docs/Multilingual_short_version.qsf   (the S4 Qualtrics export)
- The 27 canonical short-module items + harmonised codes/wording come from the
  supplement stub `short_disinformeter_languages.csv` (read for codes/constructs).

Why an explicit item->choice map (below) rather than text matching: the *deployed*
English in the QSF differs slightly from the *harmonised* analysis wording for a
handful of items (e.g. "international community" vs "international allies",
"worried by" vs "worried about"). Fuzzy matching is fragile across that gap, so
the mapping is curated and auditable. The deployed English is what the
translations actually correspond to, so we keep BOTH wordings.

Run:  python3 scripts/extract/extract_translations.py
Outputs (resources/translations/):
  short_module_translations.json          nested, app-ready (all languages)
  short_module_translations_long.csv      tidy long format (one row per item x lang)
  short_disinformeter_languages_filled.csv drop-in fill of the supplement stub (primary langs)
  response_scales.json                     1-7 Likert + FIMI anchors per language
"""
from __future__ import annotations
import csv
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
QSF = ROOT / "docs" / "Multilingual_short_version.qsf"
OUT = ROOT / "resources" / "translations"

# ---------------------------------------------------------------------------
# Canonical short-module items (harmonised codes + wording + construct/origin).
# This is the supplement's authoritative 27-item list. Kept inline so the script
# is self-contained and the output is reproducible without the scale-dev repo.
# ---------------------------------------------------------------------------
ITEMS = [
    # code, construct, origin, harmonised English, (QSF question DataExportTag, choice id)
    ("gen1",  "GEN",    None, "I have a very negative feeling about how my state handles external threats.", ("Q8.1", "1")),
    ("gen2",  "GEN",    None, "I dislike the actions of our international allies in ensuring the safety of my state.", ("Q8.1", "2")),
    ("gen3",  "GEN",    None, "I fear the consequences of provoking countries like Russia or China", ("Q8.1", "3")),
    ("gen5",  "GEN",    None, "I like Russia.", ("Q8.1", "4")),
    ("gen7",  "GEN",    None, "I like China.", ("Q8.1", "5")),
    ("th6",   "THREAT", None, "I am angry when I think about how my country is being used by foreign countries.", ("Q8.2", "3")),
    ("th9",   "THREAT", None, "I am worried about the spread of LGBT+ propaganda.", ("Q8.2", "6")),
    ("ab2",   "ABAND",  None, "I feel disappointed by the actions of the international allies in protecting my country.", ("Q8.3", "2")),
    ("ab4",   "ABAND",  None, "I’m angry at my state for failing to protect the interests of its citizens.", ("Q8.3", "4")),
    ("ab7",   "ABAND",  None, "I feel angry because the knowledge I want to access is being censored in my state.", ("Q8.3", "5")),
    ("pa1",   "FEAR",   None, "I feel tense when thinking about potential conflicts with countries like Russia or China.", ("Q8.4", "1")),
    ("pa2",   "FEAR",   None, "I would feel safer if peace with countries like Russia or China is struck at any cost", ("Q8.4", "3")),
    ("pa4",   "FEAR",   None, "I’m anxious about the consequences of a conflict with countries like Russia or China", ("Q8.4", "4")),
    ("fru1",  "SUPF",   None, "To a certain extent, I admire Russia.", ("Q8.5", "1")),
    ("fru2",  "SUPF",   None, "Sometimes, I feel inspired by the actions of Russia.", ("Q8.5", "2")),
    ("fru3",  "SUPF",   None, "Russia gives me hope.", ("Q8.5", "3")),
    ("fch1",  "SUPFCH", None, "To a certain extent, I admire China.", ("Q8.6", "1")),
    ("fch2",  "SUPFCH", None, "Sometimes, I feel inspired by the actions of China.", ("Q8.6", "2")),
    ("fch3",  "SUPFCH", None, "China gives me hope.", ("Q8.6", "3")),
    ("news1", "FIMI", "Russian-origin", "Zelensky bought a British mansion from King Charles for 20 million pounds", ("news1", None)),
    ("news2", "FIMI", "Russian-origin", "France asked Russia not to touch the French military in Ukraine", ("news2", None)),
    ("news3", "FIMI", "Russian-origin", "The 2026 Milan–Cortina d'Ampezzo Olympics and Paralympics will be openly LGBT++", ("news3", None)),
    ("news4", "FIMI", "Russian-origin", "Ukrainian army is looking for a mentor on tolerance working for front lines", ("news4", None)),
    ("news5", "FIMI", "Russian-origin", "Gays and transvestites in Kiev are invited to join LGBT brigades", ("news5", None)),
    ("news6", "FIMI", "Chinese-origin", "Li-Meng Yan, a Chinese virologist who alleges that the COVID-19 virus originated from a Chinese government laboratory is a complete rumor maker", ("news6", None)),
    ("news7", "FIMI", "Chinese-origin", "CGTN: Closer People-to-People Bonds foster China-Vietnam Friendship", ("news7", None)),
    ("news8", "FIMI", "Chinese-origin", "The plague-like rule of extreme right-wing religious leader Li Hongzhi who is banned in China", ("news8", None)),
]

CONSTRUCT_LABELS = {
    "GEN": "General Anchor",
    "THREAT": "Threat",
    "ABAND": "Betrayal / Abandonment",
    "FEAR": "Fear / Pragmatism",
    "SUPF": "Foreign-Power Admiration — Russia",
    "SUPFCH": "Foreign-Power Admiration — China",
    "FIMI": "FIMI detection criterion",
}

# Qualtrics 2-letter (and custom) codes -> English language name + ISO-ish tag.
LANG_NAMES = {
    "EN": "English", "BG": "Bulgarian", "DE": "German", "ET": "Estonian",
    "FR": "French", "HU": "Hungarian", "IT": "Italian", "LT": "Lithuanian",
    "LV": "Latvian", "NL": "Dutch", "PL": "Polish", "RU": "Russian",
    "SR": "Serbian", "TR": "Turkish", "AR": "Arabic", "FA": "Persian (Farsi)",
    "ZH-S": "Chinese (Simplified)", "KAT": "Georgian", "UK": "Ukrainian",
}
# Primary deployment languages (S4 n >= 50) per the supplement stub. EN is source.
PRIMARY = {"EN", "BG", "DE", "ET", "FR", "HU", "IT", "LT", "LV", "NL", "PL", "RU", "SR", "TR"}
# Column order for the drop-in stub fill (matches the supplement's stub header).
STUB_COLS = ["BG", "DE", "EN", "ET", "FR", "HU", "IT", "LT", "LV", "NL", "PL", "RU", "SR", "TR"]


def clean(text: str | None) -> str:
    """Strip HTML tags, unescape entities, collapse whitespace."""
    if not text:
        return ""
    t = re.sub(r"<[^>]+>", " ", text)
    t = html.unescape(t).replace(" ", " ").replace("\t", " ")
    return re.sub(r"\s+", " ", t).strip()


def load_questions(qsf_path: Path) -> dict[str, dict]:
    """Index the QSF survey questions by DataExportTag.

    Several tags appear more than once (inactive duplicate blocks). The
    authoritative receptivity block (Q8.x) carries real ChoiceDataExportTags;
    the duplicate (Q10.x) carries `false`. For the tags we map below the first
    occurrence with a usable payload is correct, but we prefer the one whose
    payload has Language data and (for matrices) real ChoiceDataExportTags.
    """
    data = json.loads(qsf_path.read_text(encoding="utf-8"))
    by_tag: dict[str, dict] = {}
    for el in data["SurveyElements"]:
        if el.get("Element") != "SQ":
            continue
        p = el["Payload"]
        tag = p.get("DataExportTag")
        if not tag:
            continue
        has_lang = isinstance(p.get("Language"), dict)
        prev = by_tag.get(tag)
        # Prefer a payload that actually carries translations.
        if prev is None or (has_lang and not isinstance(prev.get("Language"), dict)):
            by_tag[tag] = p
    return by_tag


def matrix_text(payload: dict, choice_id: str, lang: str | None) -> str | None:
    """English (lang=None) or translated text for one matrix row (Choice)."""
    if lang is None:
        choices = payload.get("Choices") or {}
    else:
        choices = ((payload.get("Language") or {}).get(lang) or {}).get("Choices") or {}
    cell = choices.get(choice_id)
    return clean(cell.get("Display")) if cell else None


def question_text(payload: dict, lang: str | None) -> str | None:
    """English or translated full question text (used for FIMI headlines)."""
    if lang is None:
        return clean(payload.get("QuestionText"))
    block = (payload.get("Language") or {}).get(lang) or {}
    return clean(block.get("QuestionText"))


def get_text(payload: dict, choice_id: str | None, lang: str | None) -> str | None:
    return matrix_text(payload, choice_id, lang) if choice_id else question_text(payload, lang)


def discover_languages(by_tag: dict[str, dict]) -> list[str]:
    langs: set[str] = set()
    for code, *_rest, (tag, _cid) in ITEMS:
        p = by_tag.get(tag)
        if p and isinstance(p.get("Language"), dict):
            langs.update(p["Language"].keys())
    # EN is the base survey language (not stored under Language).
    ordered = ["EN"] + sorted(langs, key=lambda x: LANG_NAMES.get(x, x))
    return ordered


def extract_response_scales(by_tag: dict[str, dict], languages: list[str]) -> dict:
    """1-7 Likert anchors (from a receptivity matrix) and FIMI anchors per language."""
    scales: dict[str, dict] = {}

    def anchors_from_answers(payload: dict, lang: str | None) -> dict[str, str]:
        if lang is None:
            answers = payload.get("Answers") or {}
            return {k: clean(v.get("Display")) for k, v in answers.items()}
        block = (payload.get("Language") or {}).get(lang) or {}
        answers = block.get("Answers") or {}
        return {k: clean(v.get("Display")) for k, v in answers.items()}

    def anchors_from_choices(payload: dict, lang: str | None) -> dict[str, str]:
        if lang is None:
            choices = payload.get("Choices") or {}
        else:
            choices = ((payload.get("Language") or {}).get(lang) or {}).get("Choices") or {}
        return {k: clean(v.get("Display")) for k, v in choices.items()}

    likert = by_tag.get("Q8.1")   # receptivity 1-7 agreement scale (Answers)
    fimi = by_tag.get("news1")    # FIMI 1-7 manipulation scale (Choices)
    for lang in languages:
        L = None if lang == "EN" else lang
        scales[lang] = {
            "language": LANG_NAMES.get(lang, lang),
            "likert_agreement": anchors_from_answers(likert, L) if likert else {},
            "fimi_detection": anchors_from_choices(fimi, L) if fimi else {},
        }
    return scales


def main() -> int:
    if not QSF.exists():
        sys.exit(f"QSF not found: {QSF}")
    OUT.mkdir(parents=True, exist_ok=True)
    by_tag = load_questions(QSF)
    languages = discover_languages(by_tag)

    records = []          # nested per item
    coverage = {lang: 0 for lang in languages}
    missing = []          # (item_code, lang) with no translation

    for code, construct, origin, harmonised, (tag, cid) in ITEMS:
        payload = by_tag.get(tag)
        if payload is None:
            sys.exit(f"FATAL: QSF question tag {tag!r} (item {code}) not found.")
        deployed_en = get_text(payload, cid, None)
        if not deployed_en:
            sys.exit(f"FATAL: no English text for {code} ({tag}/{cid}).")
        translations = {}
        for lang in languages:
            txt = get_text(payload, cid, None if lang == "EN" else lang)
            if txt:
                translations[lang] = txt
                coverage[lang] += 1
            else:
                missing.append((code, lang))
        records.append({
            "item_code": code,
            "construct": construct,
            "construct_label": CONSTRUCT_LABELS[construct],
            "origin": origin,
            "version": "short",
            "english_harmonised": harmonised,
            "english_deployed": deployed_en,
            "qsf_question": tag,
            "qsf_choice_id": cid,
            "translations": translations,
        })

    # --- JSON (app-ready) -------------------------------------------------
    payload_json = {
        "_meta": {
            "title": "DisInforMeter short module — multilingual item matrix",
            "source": "docs/Multilingual_short_version.qsf (S4 deployment, Dec 2025)",
            "generated_by": "scripts/extract/extract_translations.py",
            "note": ("Translations are the translator-confirmed wording fielded in S4. "
                     "english_deployed is the exact S4 wording the translations correspond to; "
                     "english_harmonised is the harmonised analysis wording used in the "
                     "scale-development paper and policy-report supplement."),
            "n_items": len(records),
            "languages": [{"code": c, "name": LANG_NAMES.get(c, c), "primary": c in PRIMARY}
                          for c in languages],
        },
        "items": records,
    }
    (OUT / "short_module_translations.json").write_text(
        json.dumps(payload_json, ensure_ascii=False, indent=2), encoding="utf-8")

    # --- tidy long CSV ----------------------------------------------------
    with (OUT / "short_module_translations_long.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["item_code", "construct", "construct_label", "origin",
                    "lang", "language_name", "primary", "text"])
        for r in records:
            for lang in languages:
                if lang in r["translations"]:
                    w.writerow([r["item_code"], r["construct"], r["construct_label"],
                                r["origin"] or "", lang, LANG_NAMES.get(lang, lang),
                                "yes" if lang in PRIMARY else "no", r["translations"][lang]])

    # --- drop-in stub fill (matches supplement Annex B header) ------------
    with (OUT / "short_disinformeter_languages_filled.csv").open("w", newline="", encoding="utf-8") as fh:
        fh.write("# Short DisInforMeter language matrix (Annex B) — FILLED from S4 Qualtrics deployment.\n")
        fh.write("# Generated by disinformeter-demonstrator/scripts/extract/extract_translations.py\n")
        fh.write("# english column = harmonised analysis wording; language columns = deployed S4 translations.\n")
        w = csv.writer(fh)
        w.writerow(["item_code", "construct", "origin", "english"] + STUB_COLS)
        for r in records:
            row = [r["item_code"], r["construct"], r["origin"] or "", r["english_harmonised"]]
            for lang in STUB_COLS:
                row.append(r["translations"].get(lang, ""))
            w.writerow(row)

    # --- response scales --------------------------------------------------
    scales = extract_response_scales(by_tag, languages)
    (OUT / "response_scales.json").write_text(
        json.dumps(scales, ensure_ascii=False, indent=2), encoding="utf-8")

    # --- report -----------------------------------------------------------
    print(f"Extracted {len(records)} items in {len(languages)} languages.")
    print("Per-language coverage (items with a translation present):")
    for lang in languages:
        flag = "primary" if lang in PRIMARY else "extra  "
        print(f"  {lang:4} {LANG_NAMES.get(lang, lang):22} {flag}  {coverage[lang]:2}/{len(records)}")
    if missing:
        print(f"\n{len(missing)} item x language cells missing a translation:")
        for code, lang in missing:
            print(f"  - {code} [{lang}]")

    # --- self-check (ponytail: one runnable check) ------------------------
    assert len(records) == 27, "expected 27 short-module items"
    assert coverage["EN"] == 27, "every item must have English (deployed) wording"
    # Every primary language must cover all 27 items (these were fully fielded).
    for lang in PRIMARY:
        if lang in languages:
            assert coverage[lang] == 27, f"primary language {lang} incomplete: {coverage[lang]}/27"
    # FIMI source split sanity.
    rus = [r for r in records if r["origin"] == "Russian-origin"]
    chn = [r for r in records if r["origin"] == "Chinese-origin"]
    assert len(rus) == 5 and len(chn) == 3, "FIMI origin split must be 5 Russian / 3 Chinese"
    print("\nself-check OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
