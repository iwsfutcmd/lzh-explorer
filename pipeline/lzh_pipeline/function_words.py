"""The curated function-word list (pipeline/function_words.toml).

    uv run python -m lzh_pipeline.function_words --check

prints, for every listed character, how the UD Kyoto treebank tags it, and
flags entries whose tokens are mostly content words. Use it when editing the
list.
"""

from __future__ import annotations

import argparse
import tomllib
import unicodedata
from pathlib import Path

CATEGORIES = ["pron", "dem", "interr", "neg", "prep", "conj", "final", "initial", "struct", "adv", "aux", "copula"]

# UPOS tags counted as grammatical for --check.
FUNCTION_UPOS = {"PRON", "DET", "ADP", "AUX", "CCONJ", "SCONJ", "PART", "ADV"}


def load(path: Path) -> dict[str, dict[str, object]]:
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    items: dict[str, dict[str, object]] = {}
    for section in ("chars", "words"):
        for key, entry in data.get(section, {}).items():
            key = unicodedata.normalize("NFC", key)
            n = len(key)
            if (section == "chars") != (n == 1):
                raise ValueError(f"{key!r} is in [{section}] but has {n} characters")
            if key in items:
                raise ValueError(f"duplicate entry {key!r}")
            cats = entry["cat"]
            bad = [c for c in cats if c not in CATEGORIES]
            if bad or not cats:
                raise ValueError(f"{key!r}: unknown or missing categories {bad}")
            out: dict[str, object] = {"cat": cats}
            if entry.get("vernacular"):
                out["vernacular"] = True
            items[key] = out
    return items


def to_json(items: dict[str, dict[str, object]]) -> dict[str, object]:
    return {"categories": CATEGORIES, "items": items}


def main() -> None:
    from . import sources, ud
    from .build import PIPELINE

    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--check", action="store_true", help="compare the list with the UD Kyoto treebank")
    parser.add_argument("--cache", type=Path, default=PIPELINE / ".cache")
    args = parser.parse_args()
    items = load(PIPELINE / "function_words.toml")
    print(f"{len(items)} entries")
    if not args.check:
        return
    prof = ud.read(sources.fetch(r, args.cache) for r in sources.UD_KYOTO)
    rows = []
    for key, entry in items.items():
        counts = prof.upos.get(key)
        n = sum(counts.values()) if counts else 0
        share = sum(v for t, v in counts.items() if t in FUNCTION_UPOS) / n if n else float("nan")
        top = " ".join(f"{t} {v * 100 // n}%" for t, v in counts.most_common(3)) if counts else "—"
        rows.append((share if n else 2.0, key, entry, n, top))
    for share, key, entry, n, top in sorted(rows, key=lambda r: r[0]):
        flag = "  ← mostly content uses" if n >= 20 and share < 0.25 else ""
        vern = "V" if entry.get("vernacular") else " "
        shown = "  n/a" if share > 1 else f"{share:5.2f}"
        print(f"{key}\t{','.join(entry['cat']):18} {vern} n={n:<6} grammatical={shown}  {top}{flag}")


if __name__ == "__main__":
    main()
