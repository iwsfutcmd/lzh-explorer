"""Reader for Schalmey (2021), "Raw frequency data: Thoughts on 'Reliable'
Learner's Vocabularies for Classical and Literary Chinese" (Zenodo,
doi:10.5281/zenodo.5638882, CC BY 4.0).

The archive has one folder per corpus (``loewe``, ``zhengshi``,
``xiaoshuo``), each holding:

* ``<c>_corpus.csv``   – one row per text (title, romanizations, source, sizes)
* ``<c>_freq_1-1.csv`` – character counts: key, total, a few derived columns,
  then one count column per text
* ``<c>_freq_2-4.csv`` – the same for 2–4-character strings that are
  headwords of the *Hanyu da cidian*. These are overlapping n-gram counts,
  not the output of word segmentation.

The derived columns differ between files (``sum`` / ``sums`` / ``added`` /
an unnamed column, or none at all), but every file has a ``normalized``
column immediately before the per-text columns, which is what we key on.

The files are read straight out of the zip; nothing is extracted to disk.
"""

from __future__ import annotations

import csv
import io
import zipfile
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path

CORPORA = ("loewe", "zhengshi", "xiaoshuo")


@dataclass
class SourceText:
    source_title: str
    corpora: list[str] = field(default_factory=list)
    filename: str = ""
    origin: str = ""  # where Schalmey obtained the e-text
    year: int | None = None


@dataclass
class Table:
    """Sparse key × text count table, merged across corpora."""

    # key -> source_title -> count
    counts: dict[str, dict[str, int]] = field(default_factory=dict)

    def add(self, key: str, title: str, n: int) -> None:
        row = self.counts.setdefault(key, {})
        prev = row.get(title)
        if prev is not None and prev != n:
            raise ValueError(
                f"conflicting counts for {key!r} in {title!r}: {prev} vs {n} "
                "(a text shared between corpora differs between copies)"
            )
        row[title] = n


def _open_csv(zf: zipfile.ZipFile, name: str) -> Iterator[list[str]]:
    with zf.open(name) as raw:
        text = io.TextIOWrapper(raw, encoding="utf-8-sig", newline="")
        yield from csv.reader(text)


def _int(cell: str) -> int:
    # Counts are written both as "12" and "12.0".
    value = float(cell)
    if value != int(value):
        raise ValueError(f"non-integral count {cell!r}")
    return int(value)


def read_texts(zf: zipfile.ZipFile) -> dict[str, SourceText]:
    texts: dict[str, SourceText] = {}
    for corpus in CORPORA:
        rows = _open_csv(zf, f"{corpus}/{corpus}_corpus.csv")
        header = next(rows)
        col = {name: i for i, name in enumerate(header)}
        for row in rows:
            if not row or not row[0].strip():
                continue
            title = row[col["title"]]
            t = texts.setdefault(title, SourceText(source_title=title))
            t.corpora.append(corpus)
            t.filename = t.filename or row[col["filename"]]
            if "source" in col:
                t.origin = t.origin or row[col["source"]].strip()
            if "year" in col and row[col["year"]].strip():
                t.year = int(row[col["year"]])
    return texts


def read_table(zf: zipfile.ZipFile, kind: str, table: Table | None = None) -> Table:
    """Read and merge ``<corpus>_freq_<kind>.csv`` for all corpora."""
    table = table or Table()
    for corpus in CORPORA:
        rows = _open_csv(zf, f"{corpus}/{corpus}_freq_{kind}.csv")
        header = next(rows)
        first = header.index("normalized") + 1
        titles = header[first:]
        for row in rows:
            key = row[0]
            if not key:
                continue
            for title, cell in zip(titles, row[first:], strict=True):
                if cell and (n := _int(cell)):
                    table.add(key, title, n)
    return table


def load(zip_path: Path) -> tuple[dict[str, SourceText], Table, Table]:
    """Return (texts by source title, character table, 2–4-char word table)."""
    with zipfile.ZipFile(zip_path) as zf:
        texts = read_texts(zf)
        chars = read_table(zf, "1-1")
        words = read_table(zf, "2-4")
    return texts, chars, words
