# Consolidated item bank

Every DisInforMeter item carried in the programme, tagged with its construct
architecture, the wave(s) it was fielded in, and which scale version(s) it
belongs to.

Regenerate: `python3 scripts/extract/build_item_bank.py`
(requires `../translations/short_module_translations.json` — run
`extract_translations.py` first).

## Generated files

| File | Use |
|---|---|
| `item_bank.json` | App-ready. `_meta` documents waves, versions, counts, and the scoring direction; `items[]` carries every item. |
| `item_bank.csv` | Flat table of the same. |

### Per-item fields (`item_bank.json`)
- `section` — First-order construct items / Higher-order composite indicators / FIMI news items.
- `scale`, `domain_label` — construct grouping and plain-language domain.
- `item_text` — full English wording.
- `waves` — canonical variable name per wave (`S1`–`S5`), or `null` if not fielded.
- `versions` — any of `long`, `short`, `ultra_brief`.
- `short_module_code` — harmonised code linking to the translations (e.g. `gen1`, `news2`).
- `fimi` — for criterion items: `origin` (Russian/Chinese) + `short_fimi` flag.

### Counts
151 items total — long = 118, short = 27, ultra-brief = 5, FIMI criterion = 15.

## Vendored source maps (copied, not generated)
| File | Source |
|---|---|
| `item_mapping_overview.csv` | scale-dev `outputs/` — the authoritative harmonised cross-wave map (drives `build_item_bank.py`). |
| `item_mapping.csv`, `item_mapping_master_long.csv`, `item_mapping.xlsx` | scale-dev `outputs/` — fuller master maps for reference. |
| `construct_reference_card.csv` | D5.3 supplement — plain-language construct dictionary with reliability ranges. |

## Scoring direction
Domain items: higher = more receptivity-relevant endorsement. FIMI items: higher
= better detection. **Never average the two together.** See
[`../scoring/scoring_guide.md`](../scoring/scoring_guide.md).
