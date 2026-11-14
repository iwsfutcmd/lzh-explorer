"""Upstream data sources, pinned by URL and checksum.

Every file the pipeline reads from the network is listed here, so that a
build is reproducible and a changed upstream file fails loudly instead of
silently changing the site's numbers.
"""

from __future__ import annotations

import hashlib
import sys
import urllib.request
from dataclasses import dataclass
from pathlib import Path

UNICODE_VERSION = "18.0.0"


@dataclass(frozen=True)
class Remote:
    url: str
    filename: str
    sha256: str


SCHALMEY_ZIP = Remote(
    url=(
        "https://zenodo.org/api/records/5638882/files/"
        "classical_chinese_learners_vocabularies_raw_frequencies.zip/content"
    ),
    filename="schalmey2021_raw_frequencies.zip",
    sha256="06ce867e5661edef5adea23787766f2dd6a9f8753d6008926c9b757d6e064629",
)

UNIHAN_ZIP = Remote(
    url=f"https://www.unicode.org/Public/{UNICODE_VERSION}/ucd/Unihan.zip",
    filename=f"Unihan-{UNICODE_VERSION}.zip",
    sha256="4c93ea9c1f636451729a840978f1667a53886af37ba854fdcce109721c63d43e",
)

CJK_RADICALS = Remote(
    url=f"https://www.unicode.org/Public/{UNICODE_VERSION}/ucd/CJKRadicals.txt",
    filename=f"CJKRadicals-{UNICODE_VERSION}.txt",
    sha256="689e2e5852699e7115823dc0b6d3e615eb767c7f477b615678f4f989d1f06105",
)

BLOCKS = Remote(
    url=f"https://www.unicode.org/Public/{UNICODE_VERSION}/ucd/Blocks.txt",
    filename=f"Blocks-{UNICODE_VERSION}.txt",
    sha256="a58f8d322f3c5e254f9f97b1cbf76a454a7e02de6ac35619a5e4f27aaabfd553",
)


# Attribution metadata, shipped to the site in manifest.json and shown on the
# About page. Keep in sync with data/README.md.
ATTRIBUTION = [
    {
        "id": "schalmey2021",
        "creator": "Tilman Schalmey",
        "title": (
            'Raw frequency data: Thoughts on "Reliable" Learner\'s '
            "Vocabularies for Classical and Literary Chinese"
        ),
        "publisher": "Zenodo",
        "year": 2021,
        "doi": "10.5281/zenodo.5638882",
        "url": "https://doi.org/10.5281/zenodo.5638882",
        "license": "CC-BY-4.0",
        "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
        "changes": (
            "Texts shared between corpora (史記, 漢書) are stored once; text "
            "titles normalized (see pipeline/texts.toml); character and "
            "2–4-character word counts re-encoded per text; derived "
            "statistics are computed in the browser."
        ),
    },
    {
        "id": "unihan",
        "creator": "Unicode, Inc.",
        "title": f"Unicode Han Database (Unihan), Unicode {UNICODE_VERSION}",
        "publisher": "Unicode, Inc.",
        "year": 2026,
        "url": "https://www.unicode.org/reports/tr38/",
        "license": "Unicode-3.0",
        "licenseUrl": "https://www.unicode.org/license.txt",
        "changes": "Subset of fields for the characters attested in the corpora.",
    },
]


def fetch(remote: Remote, cache_dir: Path) -> Path:
    """Download `remote` into `cache_dir` (once) and verify its checksum."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = cache_dir / remote.filename
    if not path.exists():
        print(f"downloading {remote.url}", file=sys.stderr)
        tmp = path.with_suffix(path.suffix + ".part")
        req = urllib.request.Request(remote.url, headers={"User-Agent": "lzh-pipeline"})
        with urllib.request.urlopen(req) as resp, open(tmp, "wb") as out:
            while chunk := resp.read(1 << 16):
                out.write(chunk)
        tmp.rename(path)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != remote.sha256:
        raise RuntimeError(
            f"checksum mismatch for {path.name}: expected {remote.sha256}, got {digest}. "
            "Upstream changed; inspect it and update sources.py deliberately."
        )
    return path
