#!/usr/bin/env python3
"""Build the consolidated DisInforMeter item bank for the demonstrator.

Combines the harmonised cross-wave item map (the authoritative source behind the
policy-report supplement's construct-reference page) with the extracted
short-module set, and tags every item with:

  - its construct architecture (section, scale, plain-language domain),
  - the wave(s) it was fielded in (S1–S5 canonical variable names),
  - which scale VERSION(s) it belongs to: long / short / ultra-brief, and
  - for the FIMI criterion, source origin and Short-FIMI membership.

Source of truth
---------------
- disinformeter-scale-development/outputs/item_mapping_overview.csv
    (resolved relative to this repo; a copy is also staged in
     resources/item-bank/ for portability).
- resources/translations/short_module_translations.json
    (defines the recommended 27-item short module; produced by
     extract_translations.py — run that first).

Run:  python3 scripts/extract/build_item_bank.py
Outputs (resources/item-bank/):  item_bank.json, item_bank.csv
"""
from __future__ import annotations
import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "resources" / "item-bank"
TRANSLATIONS = ROOT / "resources" / "translations" / "short_module_translations.json"

# Prefer the staged copy (portable); fall back to the scale-dev repo.
OVERVIEW_CANDIDATES = [
    OUT / "item_mapping_overview.csv",
    ROOT.parent / "disinformeter-scale-development" / "outputs" / "item_mapping_overview.csv",
]

WAVES = ["S1", "S2", "S3", "S4", "S5"]
LONG_WAVES = ["S2", "S3", "S5"]   # the long-form validation waves
SHORT_FIMI = {"news2", "news5", "news7", "news8"}

# Map the overview's higher-order scale_display -> short policy-domain label.
DOMAIN_LABELS = {
    "Threat (affective)": "Threat",
    "Distrust / betrayal / abandonment": "Betrayal / Abandonment",
    "Fear / pragmatic-accommodation affect": "Fear / Pragmatism",
    "Superiority (affective admiration)": "Foreign-Power Admiration",
    "General / global DisInformeter items": "General Anchor",
}


def has(v: str | None) -> bool:
    return v not in (None, "", "—", "-", "NA", "na")


def norm(text: str) -> str:
    """Normalise English wording for cross-source matching."""
    t = (text or "").lower().replace("’", "'").replace("‘", "'")
    t = re.sub(r"[^a-z0-9 ]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def find_overview() -> Path:
    for c in OVERVIEW_CANDIDATES:
        if c.exists():
            return c
    sys.exit("item_mapping_overview.csv not found in resources/item-bank/ or scale-dev outputs.")


def load_short_index() -> tuple[dict, dict]:
    """Return (norm_english -> short_code) for receptivity, and news_code -> origin."""
    if not TRANSLATIONS.exists():
        sys.exit("Run extract_translations.py first (short_module_translations.json missing).")
    data = json.loads(TRANSLATIONS.read_text(encoding="utf-8"))
    recv, fimi = {}, {}
    for it in data["items"]:
        if it["construct"] == "FIMI":
            fimi[it["item_code"]] = it["origin"]
        else:
            recv[norm(it["english_harmonised"])] = it["item_code"]
            recv[norm(it["english_deployed"])] = it["item_code"]
    return recv, fimi


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    overview = find_overview()
    recv_index, fimi_origin = load_short_index()

    items = []
    matched_short_recv = set()
    for row in csv.DictReader(overview.open(encoding="utf-8")):
        section = row["section"].strip()
        scale_display = row["scale_display"].strip()
        text = row["item_text"].strip()
        waves = {w: (row[w].strip() if has(row[w]) else None) for w in WAVES}

        is_fimi = section == "FIMI news items"
        is_higher = section == "Higher-order composite indicators"
        is_first = section == "First-order construct items"

        domain_label = DOMAIN_LABELS.get(scale_display) if is_higher else None

        versions = []
        # Long version: domain content fielded in the long-form waves.
        if (is_first or is_higher) and any(waves[w] for w in LONG_WAVES):
            versions.append("long")

        short_code = None
        fimi_meta = None
        if is_fimi:
            # FIMI criterion: short-module member if fielded in S4; news code from S4 tag.
            s4 = waves["S4"]
            code = s4 if (s4 and s4.startswith("news")) else None
            if code and code in fimi_origin:
                short_code = code
                versions.append("short")
                fimi_meta = {"origin": fimi_origin[code], "short_fimi": code in SHORT_FIMI}
        elif is_higher:
            code = recv_index.get(norm(text))
            if code:
                short_code = code
                versions.append("short")
                matched_short_recv.add(code)
                # Ultra-brief index = the validated General Anchor items in the
                # short module (the cross-cutting higher-order factor).
                if scale_display == "General / global DisInformeter items":
                    versions.append("ultra_brief")

        items.append({
            "section": section,
            "scale": scale_display,
            "domain_label": domain_label,
            "item_text": text,
            "waves": waves,
            "versions": versions,
            "short_module_code": short_code,
            "fimi": fimi_meta,
        })

    # --- JSON -------------------------------------------------------------
    n_long = sum("long" in i["versions"] for i in items)
    n_short = sum("short" in i["versions"] for i in items)
    n_ultra = sum("ultra_brief" in i["versions"] for i in items)
    n_fimi = sum(i["section"] == "FIMI news items" for i in items)
    out = {
        "_meta": {
            "title": "DisInforMeter consolidated item bank",
            "source": "item_mapping_overview.csv (harmonised cross-wave map) + "
                      "short_module_translations.json",
            "generated_by": "scripts/extract/build_item_bank.py",
            "waves": {
                "S1": "Lithuania, Dec 2024 (n=681) — item-pool generation",
                "S2": "Lithuania, Mar 2025 (n=582) — refinement; first full FIMI battery",
                "S3": "Germany, May 2025 (n=782) — cross-national replication",
                "S4": "13 countries, Dec 2025 (n=7,783 report cut) — multinational deployment",
                "S5": "Lithuania, Mar–Apr 2026 (n=248) — external validation + feedback intervention",
            },
            "versions": {
                "long": "Full validated item pool (first- and higher-order), fielded in S2/S3/S5.",
                "short": "Recommended 27-item monitoring module fielded in S4 "
                         "(19 receptivity items + 8 FIMI). Translations in resources/translations/.",
                "ultra_brief": "General Anchor index — the cross-cutting higher-order items.",
            },
            "counts": {"total": len(items), "long": n_long, "short": n_short,
                       "ultra_brief": n_ultra, "fimi_criterion": n_fimi},
            "scoring_note": "Domain items: higher = more receptivity-relevant endorsement. "
                            "FIMI items: higher = better detection. Never average the two together.",
        },
        "items": items,
    }
    (OUT / "item_bank.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")

    # --- CSV --------------------------------------------------------------
    with (OUT / "item_bank.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["section", "scale", "domain_label", "item_text",
                    *WAVES, "versions", "short_module_code", "fimi_origin", "short_fimi"])
        for i in items:
            w.writerow([i["section"], i["scale"], i["domain_label"] or "", i["item_text"],
                        *[i["waves"][x] or "" for x in WAVES],
                        ";".join(i["versions"]), i["short_module_code"] or "",
                        (i["fimi"] or {}).get("origin", ""),
                        "yes" if (i["fimi"] or {}).get("short_fimi") else ""])

    # --- report + self-check ---------------------------------------------
    print(f"Item bank: {len(items)} items "
          f"(long={n_long}, short={n_short}, ultra_brief={n_ultra}, fimi={n_fimi})")
    print(f"Short-module receptivity items matched into bank: {len(matched_short_recv)}/19")
    expected_recv = set(recv_index.values())
    missed = expected_recv - matched_short_recv
    if missed:
        print(f"  WARNING: short receptivity codes not matched in overview: {sorted(missed)}")
    assert len(matched_short_recv) == 19, \
        f"expected 19 short receptivity items matched, got {len(matched_short_recv)}"
    assert n_short == 27, f"expected 27 short-module items total, got {n_short}"
    assert n_ultra == 5, f"expected 5 ultra-brief General Anchor items, got {n_ultra}"
    print("self-check OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
