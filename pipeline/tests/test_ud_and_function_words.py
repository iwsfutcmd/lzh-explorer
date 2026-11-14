from pathlib import Path

import pytest

from lzh_pipeline import function_words, ud

CONLLU = """\
# newdoc id = KR1h0004_001
# sent_id = s1
# text = 學而時習之
1\t學\t學\tVERB\tv\t_\t0\troot\t_\tGloss=study|SpaceAfter=No
2\t而\t而\tCCONJ\tp\t_\t4\tcc\t_\tGloss=and|SpaceAfter=No
3\t時\t時\tNOUN\tn\t_\t4\tobl\t_\tGloss=time|SpaceAfter=No
4\t習\t習\tVERB\tv\t_\t1\tconj\t_\tGloss=practise|SpaceAfter=No
5\t之\t之\tPRON\tn\t_\t4\tobj\t_\tGloss=[3PRON]|SpaceAfter=No

# sent_id = s2
# text = 學之道
1\t學\t學\tNOUN\tn\t_\t3\tnmod\t_\tGloss=learning|SpaceAfter=No
2\t之\t之\tSCONJ\tp\t_\t1\tcase\t_\tGloss='s|SpaceAfter=No
3\t道\t道\tNOUN\tn\t_\t0\troot\t_\tGloss=way|SpaceAfter=No
"""


def test_ud_profiles(tmp_path: Path):
    f = tmp_path / "t.conllu"
    f.write_text(CONLLU, encoding="utf-8")
    prof = ud.read([f])
    assert prof.tokens == 8
    assert prof.docs["KR1h0004"] == 8
    assert prof.upos["之"] == {"PRON": 1, "SCONJ": 1}
    out = ud.to_json(prof)
    noun, verb = ud.UPOS.index("NOUN"), ud.UPOS.index("VERB")
    assert sorted(out["items"]["學"]) == sorted([[verb, 1], [noun, 1]])
    assert out["gloss"]["學"] == [["learning", 1], ["study", 1]]
    assert out["docs"] == [{"id": "KR1h0004", "title": "論語", "tokens": 8}]


def test_ud_rejects_unknown_documents(tmp_path: Path):
    f = tmp_path / "t.conllu"
    f.write_text(CONLLU.replace("KR1h0004", "KR9z9999"), encoding="utf-8")
    with pytest.raises(ValueError, match="unknown treebank document"):
        ud.read([f])


def test_function_word_list_validation(tmp_path: Path):
    good = tmp_path / "fw.toml"
    good.write_text('[chars]\n"之" = { cat = ["struct", "pron"] }\n[words]\n"是以" = { cat = ["conj"], vernacular = false }\n', encoding="utf-8")
    assert function_words.load(good) == {"之": {"cat": ["struct", "pron"]}, "是以": {"cat": ["conj"]}}
    bad = tmp_path / "bad.toml"
    bad.write_text('[chars]\n"是以" = { cat = ["conj"] }\n', encoding="utf-8")
    with pytest.raises(ValueError, match="characters"):
        function_words.load(bad)
    bad.write_text('[chars]\n"之" = { cat = ["particle"] }\n', encoding="utf-8")
    with pytest.raises(ValueError, match="categories"):
        function_words.load(bad)


def test_shipped_list_is_valid():
    items = function_words.load(Path(__file__).parents[1] / "function_words.toml")
    assert "之" in items and "是以" in items
