"""Build ``public/data/*.json`` for the explorer site.

    uv run --project pipeline lzh-build          # from the repo root

Outputs (all UTF-8, deterministic, no timestamps):

``manifest.json``
    sources + attribution, corpora, per-text metadata (incl. token counts),
    Kangxi radical table, the Unicode blocks the characters fall in.
``chars.json`` / ``words.json``
    Sparse item × text count matrices::

        {"texts": [text ids, matrix column order],
         "items": ["之", "也", ...],          # sorted by overall frequency
         "cells": [[t, n, t, n, ...], ...]}   # (text index, count) pairs

    Everything else (frequencies over any sub-corpus, dispersion, keyness,
    coverage) is derived in the browser from these counts.
``unihan.json``
    ``{"之": {"rs": "4.3", "ts": 4, "cmn": ["zhī"], ...}, ...}``
"""

from __future__ import annotations

import argparse
import json
import sys
import tomllib
import unicodedata
from pathlib import Path

from . import schalmey, sources, unihan

ROOT = Path(__file__).resolve().parents[2]
PIPELINE = ROOT / "pipeline"


def dump(path: Path, obj: object) -> None:
    text = json.dumps(obj, ensure_ascii=False, separators=(",", ":"), sort_keys=False)
    path.write_text(text + "\n", encoding="utf-8")
    print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size / 1024:,.0f} KiB)", file=sys.stderr)


def matrix(table: schalmey.Table, title_to_index: dict[str, int]) -> tuple[list[str], list[list[int]]]:
    def total(item: tuple[str, dict[str, int]]) -> int:
        return sum(item[1].values())

    rows = sorted(table.counts.items(), key=lambda kv: (-total(kv), kv[0]))
    items, cells = [], []
    for key, per_text in rows:
        pairs = sorted((title_to_index[t], n) for t, n in per_text.items())
        items.append(unicodedata.normalize("NFC", key))
        cells.append([x for pair in pairs for x in pair])
    if len(set(items)) != len(items):
        raise ValueError("NFC normalization merged distinct keys; handle explicitly")
    return items, cells


def build(out_dir: Path, cache_dir: Path) -> None:
    zip_path = sources.fetch(sources.SCHALMEY_ZIP, cache_dir)
    src_texts, chars, words = schalmey.load(zip_path)

    curated = tomllib.loads((PIPELINE / "texts.toml").read_text(encoding="utf-8"))
    missing = set(src_texts) - set(curated)
    extra = set(curated) - set(src_texts)
    if missing or extra:
        raise ValueError(f"texts.toml out of sync: missing {missing}, unknown {extra}")

    order = list(curated)  # texts.toml order is the canonical column order
    title_to_index = {t: i for i, t in enumerate(order)}

    tokens = [0] * len(order)
    types = [0] * len(order)
    for per_text in chars.counts.values():
        for title, n in per_text.items():
            tokens[title_to_index[title]] += n
            types[title_to_index[title]] += 1

    texts = []
    for i, source_title in enumerate(order):
        meta = curated[source_title]
        src = src_texts[source_title]
        entry: dict[str, object] = {
            "id": meta["id"],
            "title": meta["title"],
            "sourceTitle": source_title,
            "pinyin": meta["pinyin"],
            "en": meta["en"],
            "corpora": src.corpora,
            "tokens": tokens[i],
            "types": types[i],
        }
        year = meta.get("year", src.year)
        if src.year is not None and year != src.year:
            raise ValueError(f"{source_title}: year {year} disagrees with dataset ({src.year})")
        if year is not None:
            entry["year"] = year
        if src.origin:
            entry["origin"] = src.origin
        if "note" in meta:
            entry["note"] = meta["note"]
        texts.append(entry)

    char_items, char_cells = matrix(chars, title_to_index)
    word_items, word_cells = matrix(words, title_to_index)
    text_ids = [t["id"] for t in texts]

    # Every character used in a word should also be in the character table.
    stray = {c for w in word_items for c in w} - set(char_items)
    if stray:
        print(f"note: {len(stray)} characters occur only inside words: {''.join(sorted(stray))}", file=sys.stderr)

    radicals = unihan.load_radicals(sources.fetch(sources.CJK_RADICALS, cache_dir))
    all_blocks = unihan.load_blocks(sources.fetch(sources.BLOCKS, cache_dir))
    wanted = set(char_items) | stray
    han = unihan.load(sources.fetch(sources.UNIHAN_ZIP, cache_dir), wanted)

    used_blocks = []
    for start, end, name in all_blocks:
        if any(start <= ord(c) <= end for c in wanted):
            used_blocks.append({"first": start, "last": end, "name": name})

    corpora = [
        {"id": c, "texts": [t["id"] for t in texts if c in t["corpora"]], "source": "schalmey2021"}
        for c in schalmey.CORPORA
    ]

    out_dir.mkdir(parents=True, exist_ok=True)
    dump(
        out_dir / "manifest.json",
        {
            "schema": 1,
            "unicodeVersion": sources.UNICODE_VERSION,
            "sources": sources.ATTRIBUTION,
            "corpora": corpora,
            "texts": texts,
            "blocks": used_blocks,
            "radicals": radicals,
        },
    )
    dump(out_dir / "chars.json", {"texts": text_ids, "items": char_items, "cells": char_cells})
    dump(out_dir / "words.json", {"texts": text_ids, "items": word_items, "cells": word_cells})
    dump(out_dir / "unihan.json", {c: han[c] for c in sorted(han, key=ord)})

    no_unihan = sorted(wanted - set(han), key=ord)
    print(
        f"{len(texts)} texts, {sum(tokens):,} tokens, {len(char_items):,} characters, "
        f"{len(word_items):,} words; {len(no_unihan)} characters without Unihan data: "
        + " ".join(f"{c} U+{ord(c):04X}" for c in no_unihan),
        file=sys.stderr,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--out", type=Path, default=ROOT / "public" / "data")
    parser.add_argument("--cache", type=Path, default=PIPELINE / ".cache")
    args = parser.parse_args()
    build(args.out, args.cache)


if __name__ == "__main__":
    main()
