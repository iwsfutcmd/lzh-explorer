"""Extract the Unihan fields the explorer displays.

Only the characters actually attested in the corpora are kept. Field values
are lightly normalized (source tags stripped, lists split) but otherwise
passed through unchanged, so the site shows Unihan's own data.
"""

from __future__ import annotations

import io
import re
import zipfile
from collections.abc import Iterable
from pathlib import Path

# Unihan field -> short key in unihan.json
SCALAR_FIELDS = {
    "kRSUnicode": "rs",  # radical.residual-strokes (first value)
    "kTotalStrokes": "ts",  # total strokes (first value, an int)
    "kDefinition": "def",  # English gloss
    "kGSR": "gsr",  # Karlgren, Grammata Serica Recensa
    "kUnihanCore2020": "core",
}

LIST_FIELDS = {
    "kMandarin": "cmn",
    "kCantonese": "yue",
    "kJapanese": "jpn",  # kana (Unicode 15.1+)
    "kHangul": "kor",
    "kVietnamese": "vie",
    "kTang": "tang",  # Tang-dynasty reconstruction
    "kFanqie": "fq",  # 反切 spellings (Unicode 16.0+)
}

VARIANT_FIELDS = {
    "kTraditionalVariant": "trad",
    "kSimplifiedVariant": "simp",
    "kSemanticVariant": "sem",
    "kSpecializedSemanticVariant": "spec",
    "kZVariant": "z",
    "kCompatibilityVariant": "compat",
}

_CP = re.compile(r"U\+([0-9A-F]{4,6})")


def _chars(value: str) -> list[str]:
    """``U+4E79<kMorohashi:T U+4E81`` -> ['乹', '亁'] (source tags dropped)."""
    return [chr(int(m, 16)) for m in _CP.findall(value)]


def _dedupe(items: Iterable[str]) -> list[str]:
    return list(dict.fromkeys(items))


def parse_value(field: str, value: str, char: str) -> object:
    if field == "kTotalStrokes":
        return int(value.split()[0])
    if field == "kRSUnicode":
        return value.split()[0]
    if field in SCALAR_FIELDS:
        return value
    if field == "kHangul":
        # "일:0E" -> "일"
        return _dedupe(v.split(":")[0] for v in value.split())
    if field in LIST_FIELDS:
        return _dedupe(value.split())
    if field in VARIANT_FIELDS:
        # A character listed as its own variant (e.g. 乾 kTraditionalVariant
        # 乾) carries no information for the UI.
        return [c for c in _dedupe(_chars(value)) if c != char]
    raise KeyError(field)


def load(zip_path: Path, wanted: set[str]) -> dict[str, dict[str, object]]:
    fields = SCALAR_FIELDS | LIST_FIELDS | VARIANT_FIELDS
    out: dict[str, dict[str, object]] = {}
    with zipfile.ZipFile(zip_path) as zf:
        for name in sorted(zf.namelist()):
            if not name.endswith(".txt"):
                continue
            with zf.open(name) as raw:
                for line in io.TextIOWrapper(raw, encoding="utf-8"):
                    if line.startswith("#") or not line.strip():
                        continue
                    cp, field, value = line.rstrip("\n").split("\t", 2)
                    if field not in fields:
                        continue
                    char = chr(int(cp[2:], 16))
                    if char not in wanted:
                        continue
                    parsed = parse_value(field, value, char)
                    if parsed in ([], ""):
                        continue
                    out.setdefault(char, {})[fields[field]] = parsed
    return out


def load_radicals(path: Path) -> dict[str, str]:
    """CJKRadicals.txt -> {"85": "水", "120'": "纟", ...} (unified ideographs).

    Keys match the radical part of kRSUnicode, including the apostrophes that
    mark simplified (') and non-Chinese simplified ('') radical forms.
    """
    radicals: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        number, _radical, unified = (part.strip() for part in line.split(";"))
        if unified:
            radicals[number] = chr(int(unified, 16))
    return radicals


def load_blocks(path: Path) -> list[tuple[int, int, str]]:
    blocks = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        span, name = (part.strip() for part in line.split(";"))
        start, end = (int(x, 16) for x in span.split(".."))
        blocks.append((start, end, name))
    return blocks
