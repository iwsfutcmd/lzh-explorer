"""Part-of-speech profiles from the UD Classical Chinese-Kyoto treebank.

For every word form (mostly single characters; some names and compounds are
multi-character words) we count its Universal POS tags and its English
glosses (the treebank's MISC `Gloss=` field) over the whole treebank.

Documents are identified by the Kanripo ID at the start of `# newdoc id`.
"""

from __future__ import annotations

import unicodedata
from collections import Counter, defaultdict
from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path

# The full UD v2 tag set, in a fixed order (indices are used in pos.json).
UPOS = [
    "NOUN", "PROPN", "VERB", "ADJ", "ADV", "PRON", "DET", "NUM", "ADP",
    "AUX", "CCONJ", "SCONJ", "PART", "INTJ", "SYM", "PUNCT", "X",
]

# Kanripo / project IDs of the treebank's source texts.
DOCS = {
    "KR1h0004": "論語",
    "KR1h0001": "孟子",
    "KR1d0052": "禮記",
    "KR2b0041": "十八史略",
    "KR2e0003": "戰國策",
    "KR4a0001": "楚辭",
    "KR4h0169": "唐詩三百首",
    "KR6c0023": "金剛般若波羅蜜經",
    "KR6f0082": "佛說阿彌陀經",
    "KR6c0127": "摩訶般若波羅蜜大明呪經",
}

GLOSSES_KEPT = 5


@dataclass
class Profiles:
    upos: dict[str, Counter[str]] = field(default_factory=lambda: defaultdict(Counter))
    gloss: dict[str, Counter[str]] = field(default_factory=lambda: defaultdict(Counter))
    docs: Counter[str] = field(default_factory=Counter)
    tokens: int = 0


def read(paths: Iterable[Path]) -> Profiles:
    prof = Profiles()
    for path in paths:
        doc = None
        with open(path, encoding="utf-8") as f:
            for line in f:
                if line.startswith("# newdoc id"):
                    doc = line.split("=", 1)[1].strip().split("_")[0]
                    if doc not in DOCS:
                        raise ValueError(f"{path.name}: unknown treebank document {doc!r}; add it to DOCS")
                    continue
                if not line.strip() or line.startswith("#"):
                    continue
                cols = line.rstrip("\n").split("\t")
                if "-" in cols[0] or "." in cols[0]:
                    continue  # multiword-token ranges and empty nodes
                form = unicodedata.normalize("NFC", cols[1])
                upos = cols[3]
                if upos not in UPOS:
                    raise ValueError(f"{path.name}: unexpected UPOS {upos!r}")
                prof.upos[form][upos] += 1
                prof.tokens += 1
                if doc is None:
                    raise ValueError(f"{path.name}: token before any newdoc")
                prof.docs[doc] += 1
                for kv in cols[9].split("|"):
                    if kv.startswith("Gloss="):
                        prof.gloss[form][kv[6:]] += 1
    return prof


def to_json(prof: Profiles) -> dict[str, object]:
    index = {tag: i for i, tag in enumerate(UPOS)}
    items = {}
    glosses = {}
    for form in sorted(prof.upos, key=lambda f: (-sum(prof.upos[f].values()), f)):
        counts = prof.upos[form]
        items[form] = [[index[t], n] for t, n in sorted(counts.items(), key=lambda kv: (-kv[1], index[kv[0]]))]
        g = prof.gloss.get(form)
        if g:
            glosses[form] = [[s, n] for s, n in sorted(g.items(), key=lambda kv: (-kv[1], kv[0]))[:GLOSSES_KEPT]]
    return {
        "source": "ud-kyoto",
        "upos": UPOS,
        "tokens": prof.tokens,
        "docs": [{"id": d, "title": DOCS[d], "tokens": prof.docs[d]} for d in DOCS if prof.docs[d]],
        "items": items,
        "gloss": glosses,
    }
