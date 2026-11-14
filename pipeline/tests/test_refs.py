"""`lzh-refs`: the read-only reference library client, against a stand-in relay that speaks the
routes of nabu's references relay (nabu `apps/references/src/relay.ts`, tested there)."""

from __future__ import annotations

import hashlib
import io
import json
import re
import threading
import unicodedata
import urllib.parse
from collections.abc import Iterator
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import pytest

from lzh_pipeline import refs
from lzh_pipeline.refs import Relay, RelayError

KEY = "test-key"
DOC = "application/vnd.google-apps.document"
KROLL = "books/ling/sit/zho/Kroll - 2017 - A Student\u2019s Dictionary of Classical and Medieval Chinese.pdf"
#: A name Drive might hold in NFD (as macOS writes it); the relay lists and matches it in NFC.
SCHUESSLER = "books/ling/sit/zho/Schu\u0308ssler - 2007 - ABC Etymological Dictionary of Old Chinese.pdf"


@dataclass
class Library:
    """path → (kind, mime type, content). Folders have no content."""

    items: dict[str, tuple[str, str, bytes]] = field(default_factory=lambda: {})
    corrupt: set[str] = field(default_factory=lambda: set[str]())
    #: (method, route, params) of every request the relay was sent.
    requests: list[tuple[str, str, dict[str, str]]] = field(default_factory=lambda: [])
    agents: set[str] = field(default_factory=lambda: set[str]())
    #: How many more reads answer `drive-rate-limited` before the relay recovers.
    rate_limited: int = 0

    def entry(self, path: str) -> dict[str, Any]:
        kind, mime, content = self.items[path]
        out: dict[str, Any] = {"name": path.rsplit("/", 1)[-1], "kind": kind, "mimeType": mime}
        if kind == "file":
            out |= {"size": len(content), "md5": hashlib.md5(content).hexdigest()}
        return out | {"modified": "2026-11-14T00:00:00.000Z"}

    def children(self, path: str) -> list[str]:
        prefix = f"{path}/" if path else ""
        return sorted(p for p in self.items if p.startswith(prefix) and "/" not in p[len(prefix) :])


def _library() -> Library:
    library = Library()
    for folder in ("books", "books/ling", "books/ling/sit", "books/ling/sit/zho"):
        library.items[folder] = ("folder", "application/vnd.google-apps.folder", b"")
    for folder in ("nabu", "nabu/notes", "nabu/notes/lzh"):
        library.items[folder] = ("folder", "application/vnd.google-apps.folder", b"")
    library.items[KROLL] = ("file", "application/pdf", b"%PDF-1.7 Kroll")
    library.items[unicodedata.normalize("NFC", SCHUESSLER)] = ("file", "application/pdf", b"%PDF")
    library.items["nabu/notes/lzh/readings.md"] = ("file", "text/markdown", "# 讀音\n說 yuè\n".encode())
    library.items["nabu/notes/lzh/draft"] = ("native", DOC, "# 草稿\n".encode())
    return library


def _handler(library: Library) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args: Any) -> None:
            pass

        def _send(self, status: int, body: Any, headers: dict[str, str] | None = None) -> None:
            data = body if isinstance(body, bytes) else json.dumps(body).encode()
            self.send_response(status)
            for name, value in (headers or {}).items():
                self.send_header(name, value)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _record(self) -> tuple[str, dict[str, str]]:
            url = urllib.parse.urlsplit(self.path)
            params = {k: v[0] for k, v in urllib.parse.parse_qs(url.query).items()}
            library.requests.append((self.command, url.path, params))
            library.agents.add(self.headers.get("User-Agent", ""))
            return url.path, params

        def _refuse(self) -> None:
            self._record()
            self._send(405, {"error": "method"})

        do_PUT = do_POST = do_DELETE = do_PATCH = _refuse

        def do_GET(self) -> None:
            route, params = self._record()
            if self.headers.get("Authorization") != f"Bearer {KEY}":
                return self._send(401, {"error": "unauthorized"})
            if library.rate_limited > 0:
                library.rate_limited -= 1
                return self._send(429, {"error": "drive-rate-limited"})
            path = params.get("path", "")
            if route == "/v1/status":
                roots = [{"name": n, "folder": library.entry(n)} for n in ("nabu", "books")]
                return self._send(200, {"account": "owner@example.org", "roots": roots})
            if route == "/v1/list":
                if path and path not in library.items:
                    return self._send(404, {"error": "not-found", "detail": path})
                entries = [library.entry(p) for p in library.children(path)]
                if path == "books/ling/sit/zho":
                    # A name no path can address: the client must never follow it.
                    entries.append({"name": "..", "kind": "folder", "mimeType": "x"})
                return self._send(200, {"entries": entries})
            if route == "/v1/stat":
                if path not in library.items:
                    return self._send(404, {"error": "not-found", "detail": path})
                return self._send(200, library.entry(path))
            if route == "/v1/file":
                if path not in library.items:
                    return self._send(404, {"error": "not-found", "detail": path})
                kind, mime, content = library.items[path]
                if kind == "native":
                    if params.get("export") != "text/markdown":
                        return self._send(400, {"error": "export"})
                    return self._send(200, content, {"Content-Type": "text/markdown"})
                headers = {"Content-Type": mime, "x-md5": hashlib.md5(content).hexdigest()}
                body = content + b"!" if path in library.corrupt else content
                return self._send(200, body, headers)
            if route == "/v1/find":
                words = params.get("q", "").casefold().split()
                inside = params.get("in", "")
                found = [
                    library.entry(p) | {"path": p}
                    for p in sorted(library.items)
                    if (not inside or p.startswith(f"{inside}/"))
                    and all(
                        re.search(rf"(^|\W){re.escape(w)}", p.rsplit("/", 1)[-1].casefold())
                        for w in words
                    )
                ]
                return self._send(200, {"query": params.get("q"), "results": found, "truncated": False})
            self._send(404, {"error": "no-route"})

    return Handler


@pytest.fixture
def served() -> Iterator[tuple[str, Library]]:
    library = _library()
    server = ThreadingHTTPServer(("127.0.0.1", 0), _handler(library))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}", library
    finally:
        server.shutdown()
        server.server_close()


@pytest.fixture
def relay(served: tuple[str, Library]) -> Relay:
    return Relay(url=served[0], key=KEY, sleep=lambda _: None)


@pytest.fixture
def cli(served: tuple[str, Library], monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    monkeypatch.setenv("NABU_REFS_URL", served[0])
    monkeypatch.setenv("NABU_REFS_KEY", KEY)
    monkeypatch.setenv("NABU_REFS_DIR", str(tmp_path / "refs"))

    def run(*argv: str) -> str:
        out = io.StringIO()
        refs.main(list(argv), out)
        return out.getvalue()

    return run


def test_find_names_paths_wherever_books_are_filed(relay: Relay) -> None:
    found, truncated = relay.find(["kroll", "dictionary"])
    assert [path for path, _ in found] == [KROLL]
    assert found[0][1].kind == "file" and not truncated
    assert [path for path, _ in relay.find(["readings"], inside="nabu/notes")[0]] == [
        "nabu/notes/lzh/readings.md"
    ]


def test_pull_copies_the_file_and_leaves_it_when_unchanged(relay: Relay, tmp_path: Path) -> None:
    into = tmp_path / "refs"
    first = relay.pull(KROLL, into)
    assert first.downloaded == [KROLL]
    assert into.joinpath(*KROLL.split("/")).read_bytes() == b"%PDF-1.7 Kroll"
    again = relay.pull(KROLL, into)
    assert again.downloaded == [] and again.unchanged == [KROLL]


def test_pull_copies_a_folder_and_exports_google_docs(relay: Relay, tmp_path: Path) -> None:
    into = tmp_path / "refs"
    report = relay.pull("nabu/notes/lzh", into)
    assert sorted(report.downloaded) == ["nabu/notes/lzh/draft", "nabu/notes/lzh/readings.md"]
    assert (into / "nabu/notes/lzh/draft.md").read_text("utf-8") == "# 草稿\n"


def test_pull_never_writes_into_a_git_work_tree(relay: Relay, tmp_path: Path) -> None:
    (tmp_path / ".git").mkdir()
    with pytest.raises(RelayError) as raised:
        relay.pull(KROLL, tmp_path / "references")
    assert raised.value.error == "inside-git"
    with pytest.raises(RelayError):
        relay.download(KROLL, tmp_path / "Kroll.pdf")
    assert not list(tmp_path.rglob("*.pdf"))


def test_pull_refuses_more_than_it_may_copy_and_the_whole_library(
    relay: Relay, tmp_path: Path
) -> None:
    with pytest.raises(RelayError) as raised:
        relay.pull("books", tmp_path / "refs", max_bytes=10)
    assert raised.value.error == "too-big"
    with pytest.raises(RelayError) as raised:
        relay.pull("", tmp_path / "refs")
    assert raised.value.error == "no-path"
    assert not (tmp_path / "refs").exists()


def test_names_no_path_can_address_are_never_followed(relay: Relay, tmp_path: Path) -> None:
    paths = [path for path, _ in relay.walk("books")]
    assert KROLL in paths and not any(".." in path.split("/") for path in paths)
    relay.pull("books", tmp_path / "refs")
    assert sorted(p.name for p in tmp_path.iterdir()) == ["refs"]


def test_a_corrupted_download_leaves_nothing(
    served: tuple[str, Library], relay: Relay, tmp_path: Path
) -> None:
    served[1].corrupt.add(KROLL)
    with pytest.raises(RelayError) as raised:
        relay.pull(KROLL, tmp_path / "refs")
    assert raised.value.error == "checksum-mismatch"
    assert [p for p in (tmp_path / "refs").rglob("*") if p.is_file()] == []


def test_paths_go_out_in_nfc(served: tuple[str, Library], relay: Relay) -> None:
    entry = relay.stat(SCHUESSLER)
    nfc_name = unicodedata.normalize("NFC", SCHUESSLER)
    assert entry.name == nfc_name.rsplit("/", 1)[-1]
    assert served[1].requests[-1][2]["path"] == nfc_name


def test_rate_limited_reads_wait_and_retry(served: tuple[str, Library]) -> None:
    waits: list[float] = []
    relay = Relay(url=served[0], key=KEY, sleep=waits.append)
    served[1].rate_limited = 2
    assert [e.name for e in relay.list("")] == ["books", "nabu"]
    assert waits == [2, 4]
    served[1].rate_limited = 99
    with pytest.raises(RelayError) as raised:
        relay.list("")
    assert raised.value.error == "drive-rate-limited"


def test_the_client_only_reads(served: tuple[str, Library], cli: Any) -> None:
    for name in ("upload", "mkdir", "move", "trash"):
        assert not hasattr(Relay, name)
    cli("status")
    cli("ls", "-r", "nabu")
    cli("find", "kroll")
    cli("cat", "nabu/notes/lzh/readings.md")
    cli("pull", KROLL)
    methods = {method for method, _, _ in served[1].requests}
    assert methods == {"GET"}
    # Cloudflare refuses urllib's default user agent (error 1010).
    assert all(agent.startswith("lzh-refs/") for agent in served[1].agents)


def test_the_cli(cli: Any, tmp_path: Path, capsysbinary: pytest.CaptureFixture[bytes]) -> None:
    status = cli("status")
    assert "root:    nabu/ (nabu)" in status and "root:    books/ (books)" in status
    assert cli("find", "kroll").rstrip().endswith(KROLL)
    assert "readings.md" in cli("ls", "nabu/notes/lzh")
    pulled = cli("pull", KROLL)
    assert f"pulled     {KROLL}" in pulled and "1 pulled" in pulled
    assert (tmp_path / "refs").joinpath(*KROLL.split("/")).is_file()
    refs.main(["cat", "nabu/notes/lzh/draft"])
    assert capsysbinary.readouterr().out.decode("utf-8") == "# 草稿\n"


def test_the_cli_explains_a_refused_key(
    served: tuple[str, Library], monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("NABU_REFS_URL", served[0])
    monkeypatch.delenv("NABU_REFS_KEY", raising=False)
    with pytest.raises(SystemExit) as exited:
        refs.main(["status"], io.StringIO())
    assert exited.value.code == 1
    err = capsys.readouterr().err
    assert "401 unauthorized" in err and "network secret" in err


def test_the_relay_address_comes_from_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("NABU_REFS_URL", raising=False)
    with pytest.raises(RelayError) as raised:
        refs.relay_from_env()
    assert raised.value.error == "no-url"
