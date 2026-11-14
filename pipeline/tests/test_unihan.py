from lzh_pipeline import unihan
from lzh_pipeline.schalmey import _int

import pytest


def test_variant_source_tags_and_self_reference_are_dropped():
    assert unihan.parse_value("kSemanticVariant", "U+4E79<kMorohashi:T U+4E81<kMorohashi:T", "乾") == ["乹", "亁"]
    assert unihan.parse_value("kTraditionalVariant", "U+4E7E", "乾") == []
    assert unihan.parse_value("kSimplifiedVariant", "U+4E7E U+5E72", "乾") == ["干"]


def test_supplementary_plane_variants():
    assert unihan.parse_value("kZVariant", "U+2A6A5", "x") == ["\U0002A6A5"]


def test_readings():
    assert unihan.parse_value("kHangul", "일:0E 이:N", "一") == ["일", "이"]
    assert unihan.parse_value("kJapanese", "イチ イツ ひと ひとつ", "一") == ["イチ", "イツ", "ひと", "ひとつ"]
    assert unihan.parse_value("kTotalStrokes", "4 5", "x") == 4
    assert unihan.parse_value("kRSUnicode", "120'.3 120.3", "x") == "120'.3"


def test_counts_must_be_integral():
    assert _int("12") == 12
    assert _int("12.0") == 12
    with pytest.raises(ValueError):
        _int("1.5")
