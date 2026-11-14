"""Read-only access to the owner's reference library, a private Google Drive folder.

The library is reached through nabu's references relay, a Cloudflare Worker
(https://github.com/iwsfutcmd/nabu, `apps/references`; ADRs 0079 and 0090 there).
Paths start with one of the relay's roots:
- `books/` is the library, sorted by subject and language family;
- `nabu/` is nabu's work folder, with its Classical Chinese notes in `nabu/notes/lzh/`.

Everything else in the Drive is out of reach.

The books are copyrighted. Nothing fetched from here may be committed:
- `pull` refuses to write inside a git work tree;
- copies go to NABU_REFS_DIR, or ~/nabu-references, the folder nabu's own client uses.

lzh-explorer only reads (the owner's decision, 2026-11-14). This client sends GET requests and
nothing else: it has no upload, mkdir, move or trash.

Adapted from nabu's `pipeline/src/nabu/refs/client.py` and `cli.py` (commit e7d40b9;
MIT OR Apache-2.0, copyright the Nabu contributors). Changes:
- read-only;
- argparse instead of Typer, so the pipeline keeps no dependencies;
- reads retry when Drive or Cloudflare rate-limits them, as bookshelf's copy does;
- a user agent of its own.

The relay's address and key come from the environment only:
- NABU_REFS_URL is the address.
- In a cloud session, the network proxy adds the key for the relay's host, and the client sends
  none. Elsewhere, set NABU_REFS_KEY.

Never write the key into a file, a commit or a chat.

    uv run lzh-refs status
    uv run lzh-refs find kroll dictionary
    uv run lzh-refs ls nabu/notes/lzh
    uv run lzh-refs cat nabu/notes/lzh/readings.md
    uv run lzh-refs pull "books/…/Kroll - 2017 - ….pdf"
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable, Iterator, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import IO, Any, Literal, NoReturn, cast

#: The most `pull` copies at once unless told otherwise: a session's disk is small.
DEFAULT_MAX_PULL = 2 * 1024**3

#: What a Google-native file comes down as, and the extension it is given.
NATIVE_EXPORTS: dict[str, tuple[str, str]] = {
    "application/vnd.google-apps.document": ("text/markdown", ".md"),
    "application/vnd.google-apps.spreadsheet": ("text/csv", ".csv"),
    "application/vnd.google-apps.presentation": ("text/plain", ".txt"),
}

_CHUNK = 1024 * 1024
_TIMEOUT = 120
#: Cloudflare refuses Python-urllib's default user agent (error 1010) in front of Workers.
_USER_AGENT = "lzh-refs/0 (+https://github.com/iwsfutcmd/lzh-explorer)"
#: Waits before retrying a rate-limited read, in seconds.
_BACKOFF = (2, 4, 8, 16)
_RATE_LIMITED = {"drive-rate-limited", "rate-limited"}

Kind = Literal["folder", "file", "native", "shortcut"]


@dataclass(frozen=True)
class Entry:
    """One file or folder, as the relay lists it."""

    name: str
    kind: Kind
    mime_type: str
    size: int | None = None
    modified: str | None = None
    md5: str | None = None

    @staticmethod
    def of(raw: dict[str, Any]) -> Entry:
        size = raw.get("size")
        return Entry(
            name=unicodedata.normalize("NFC", str(raw["name"])),
            kind=cast(Kind, raw["kind"]),
            mime_type=str(raw.get("mimeType", "")),
            size=int(size) if size is not None else None,
            modified=cast("str | None", raw.get("modified")),
            md5=cast("str | None", raw.get("md5")),
        )


class RelayError(Exception):
    """A failure the relay reported: its HTTP status and error code."""

    def __init__(self, status: int, error: str, detail: str | None = None) -> None:
        self.status = status
        self.error = error
        self.detail = detail
        super().__init__(f"{status} {error}" + (f": {detail}" if detail else ""))


@dataclass
class PullReport:
    downloaded: list[str] = field(default_factory=lambda: list[str]())
    unchanged: list[str] = field(default_factory=lambda: list[str]())
    skipped: list[tuple[str, str]] = field(default_factory=lambda: list[tuple[str, str]]())


def nfc(path: str) -> str:
    return unicodedata.normalize("NFC", path).strip("/")


def join(*parts: str) -> str:
    return "/".join(p for p in (nfc(part) for part in parts) if p)


def default_local_dir() -> Path:
    """NABU_REFS_DIR, or ~/nabu-references: outside every repository."""
    configured = os.environ.get("NABU_REFS_DIR")
    return Path(configured).expanduser() if configured else Path.home() / "nabu-references"


def inside_git_work_tree(path: Path) -> Path | None:
    """The work tree `path` would be inside, if any. References never go into one."""
    here = path.expanduser().resolve()
    for folder in (here, *here.parents):
        if (folder / ".git").exists():
            return folder
    return None


def _md5_of(path: Path) -> str:
    digest = hashlib.md5(usedforsecurity=False)
    with path.open("rb") as file:
        while chunk := file.read(_CHUNK):
            digest.update(chunk)
    return digest.hexdigest()


def _safe_name(name: str) -> bool:
    """Whether a Drive name can be a local file name and a relay path segment."""
    return name not in ("", ".", "..") and "/" not in name and "\0" not in name


@dataclass(frozen=True)
class Relay:
    url: str
    key: str | None = None
    opener: urllib.request.OpenerDirector = field(default_factory=urllib.request.build_opener)
    sleep: Callable[[float], None] = time.sleep

    def _get(self, route: str, params: dict[str, str] | None = None) -> Any:
        """The only request this client makes: a GET, retried while rate-limited."""
        query = f"?{urllib.parse.urlencode(params)}" if params else ""
        request = urllib.request.Request(
            f"{self.url.rstrip('/')}{route}{query}",
            method="GET",
            headers={"User-Agent": _USER_AGENT},
        )
        if self.key:
            request.add_header("Authorization", f"Bearer {self.key}")
        for attempt in range(len(_BACKOFF) + 1):
            try:
                return self.opener.open(request, timeout=_TIMEOUT)
            except urllib.error.HTTPError as error:
                failure = _failure(error)
                if failure.error in _RATE_LIMITED and attempt < len(_BACKOFF):
                    self.sleep(_BACKOFF[attempt])
                    continue
                raise failure from None
        raise AssertionError("unreachable")

    def _json(self, route: str, params: dict[str, str] | None = None) -> Any:
        with self._get(route, params) as response:
            return json.loads(response.read())

    def status(self) -> dict[str, Any]:
        return cast("dict[str, Any]", self._json("/v1/status"))

    def list(self, path: str = "") -> list[Entry]:
        raw = cast("dict[str, Any]", self._json("/v1/list", {"path": nfc(path)}))
        return [Entry.of(cast("dict[str, Any]", e)) for e in cast("list[Any]", raw["entries"])]

    def stat(self, path: str) -> Entry:
        return Entry.of(cast("dict[str, Any]", self._json("/v1/stat", {"path": nfc(path)})))

    def walk(self, path: str = "") -> Iterator[tuple[str, Entry]]:
        """Every entry under a folder, depth first, with its path."""
        for entry in self.list(path):
            if not _safe_name(entry.name):
                continue
            inner = join(path, entry.name)
            yield inner, entry
            if entry.kind == "folder":
                yield from self.walk(inner)

    def find(self, words: Sequence[str], inside: str = "") -> tuple[list[tuple[str, Entry]], bool]:
        """Files and folders whose names hold every word (each matching the start of a word in
        the name, in any case), with their paths; and whether the relay stopped early
        (`truncated`: add a word or give `inside`)."""
        params = {
            "q": " ".join(nfc(word) for word in words),
            **({"in": nfc(inside)} if inside else {}),
        }
        raw = cast("dict[str, Any]", self._json("/v1/find", params))
        found = [
            (nfc(str(r["path"])), Entry.of(r))
            for r in (cast("dict[str, Any]", item) for item in cast("list[Any]", raw["results"]))
        ]
        return found, bool(raw.get("truncated"))

    def read_bytes(self, path: str, export: str | None = None) -> bytes:
        params = {"path": nfc(path), **({"export": export} if export else {})}
        with self._get("/v1/file", params) as response:
            return cast(bytes, response.read())

    def download(self, path: str, target: Path, export: str | None = None) -> None:
        """Streams a file to `target` through a .part file, checking Drive's MD5 if it has one."""
        work_tree = inside_git_work_tree(target.parent)
        if work_tree is not None:
            raise RelayError(400, "inside-git", f"{target} is inside {work_tree}")
        target.parent.mkdir(parents=True, exist_ok=True)
        partial = target.with_name(target.name + ".part")
        params = {"path": nfc(path), **({"export": export} if export else {})}
        digest = hashlib.md5(usedforsecurity=False)
        with self._get("/v1/file", params) as response, partial.open("wb") as out:
            expected = cast("str | None", response.headers.get("x-md5"))
            while chunk := cast(bytes, response.read(_CHUNK)):
                digest.update(chunk)
                out.write(chunk)
        if expected and digest.hexdigest() != expected:
            partial.unlink()
            raise RelayError(502, "checksum-mismatch", path)
        partial.replace(target)

    def pull(self, path: str, into: Path, max_bytes: int = DEFAULT_MAX_PULL) -> PullReport:
        """Copies a file or a folder's tree into `into`, keeping its path; unchanged files stay.
        Refuses, before downloading anything, a pull into a git work tree or one larger than
        `max_bytes`."""
        if not nfc(path):
            raise RelayError(400, "no-path", "name a file or folder (find it with `find`)")
        work_tree = inside_git_work_tree(into)
        if work_tree is not None:
            raise RelayError(400, "inside-git", f"{into} is inside {work_tree}")
        report = PullReport()
        root = self.stat(path)
        if root.kind != "folder":
            entries: list[tuple[str, Entry]] = [(nfc(path), root)]
        else:
            entries = list(self.walk(path))
        total = sum(entry.size or 0 for _, entry in entries)
        if total > max_bytes:
            raise RelayError(413, "too-big", f"{total:,} bytes under {nfc(path)}")
        for remote, entry in entries:
            self._pull_one(remote, entry, into, report)
        return report

    def _pull_one(self, remote: str, entry: Entry, into: Path, report: PullReport) -> None:
        segments = remote.split("/")
        if not all(_safe_name(segment) for segment in segments):
            report.skipped.append((remote, "unsafe name"))
            return
        local = into.joinpath(*segments)
        if entry.kind == "folder":
            local.mkdir(parents=True, exist_ok=True)
        elif entry.kind == "shortcut":
            report.skipped.append((remote, "shortcut"))
        elif entry.kind == "native":
            export = NATIVE_EXPORTS.get(entry.mime_type)
            if export is None:
                report.skipped.append((remote, f"no export for {entry.mime_type}"))
                return
            self.download(remote, local.with_name(local.name + export[1]), export[0])
            report.downloaded.append(remote)
        elif local.exists() and entry.md5 is not None and _md5_of(local) == entry.md5:
            report.unchanged.append(remote)
        else:
            self.download(remote, local)
            report.downloaded.append(remote)


def _failure(error: urllib.error.HTTPError) -> RelayError:
    raw = error.read()
    try:
        payload = cast("dict[str, Any]", json.loads(raw))
    except ValueError:
        payload = {"error": "http", "detail": raw.decode("utf-8", "replace")[:300]}
    return RelayError(
        error.code,
        str(payload.get("error", "http")),
        cast("str | None", payload.get("detail")),
    )


def relay_from_env(url: str | None = None) -> Relay:
    """The relay at `url` or NABU_REFS_URL, with NABU_REFS_KEY if set (else the proxy's)."""
    resolved = url or os.environ.get("NABU_REFS_URL")
    if not resolved:
        raise RelayError(0, "no-url", "set NABU_REFS_URL to the relay's address (or pass --url)")
    return Relay(url=resolved, key=os.environ.get("NABU_REFS_KEY") or None)


# --------------------------------------------------------------------- CLI ----

_HINTS = {
    "unauthorized": "The relay refused the key: in a cloud session, the environment needs a network "
    "secret for the relay's host; elsewhere, set NABU_REFS_KEY.",
    "not-signed-in": "The relay is not signed in to Google: see nabu's apps/references/README.md.",
    "sign-in-expired": "The relay's Google sign-in lapsed: the owner signs in again "
    "(nabu's apps/references/README.md).",
    "inside-git": "References never go inside a git work tree: choose another --to or NABU_REFS_DIR.",
    "too-big": "That is more than --max-gb: pull a narrower path (find it with `find`).",
    "no-path": "Name a file or folder: the top of the relay is a whole library.",
}


def _size(size: int | None) -> str:
    return "-" if size is None else f"{size:,}"


def _status(relay: Relay, args: argparse.Namespace, out: IO[str]) -> None:
    status = relay.status()
    print(f"account: {status['account']}", file=out)
    if "folder" in status:
        print(f"folder:  {status['folder']['name']}", file=out)
    for root in status.get("roots", []):
        held = root["folder"]["name"] if "folder" in root else f"error: {root.get('error')}"
        print(f"root:    {root['name']}/ ({held})", file=out)


def _ls(relay: Relay, args: argparse.Namespace, out: IO[str]) -> None:
    listed = relay.walk(args.path) if args.recursive else ((e.name, e) for e in relay.list(args.path))
    for name, entry in listed:
        suffix = "/" if entry.kind == "folder" else ""
        modified = (entry.modified or "")[:10]
        print(f"{entry.kind:<8} {_size(entry.size):>14} {modified:<10} {name}{suffix}", file=out)


def _find(relay: Relay, args: argparse.Namespace, out: IO[str]) -> None:
    found, truncated = relay.find(args.words, args.inside)
    for path, entry in found:
        suffix = "/" if entry.kind == "folder" else ""
        print(f"{entry.kind:<8} {_size(entry.size):>14} {path}{suffix}", file=out)
    if truncated:
        print("(more may match: add a word or --in)", file=sys.stderr)
    if not found:
        print("nothing found", file=sys.stderr)


def _pull(relay: Relay, args: argparse.Namespace, out: IO[str]) -> None:
    into = cast("Path | None", args.to) or default_local_dir()
    report = relay.pull(args.path, into, int(args.max_gb * 1024**3))
    for remote in report.downloaded:
        print(f"pulled     {remote}", file=out)
    for remote, why in report.skipped:
        print(f"skipped    {remote} ({why})", file=out)
    print(
        f"{len(report.downloaded)} pulled, {len(report.unchanged)} unchanged, "
        f"{len(report.skipped)} skipped, in {into}",
        file=out,
    )


def _cat(relay: Relay, args: argparse.Namespace, out: IO[str]) -> None:
    entry = relay.stat(args.path)
    export = NATIVE_EXPORTS.get(entry.mime_type, (None, ""))[0] if entry.kind == "native" else None
    data = relay.read_bytes(args.path, export)
    out.flush()
    buffer = getattr(out, "buffer", None)
    if buffer is not None:
        buffer.write(data)
        buffer.flush()
    else:
        out.write(data.decode("utf-8", "replace"))


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="lzh-refs",
        description="The reference library (read-only): grammars, dictionaries and notes in the "
        "owner's Drive, through nabu's references relay at NABU_REFS_URL.",
    )
    parser.add_argument("--url", help="the relay's address (default: NABU_REFS_URL)")
    commands = parser.add_subparsers(dest="command", required=True, metavar="command")

    status = commands.add_parser("status", help="the account the relay acts as, and its roots")
    status.set_defaults(run=_status)

    ls = commands.add_parser("ls", help="list a folder: kind, size, last change, name")
    ls.add_argument("path", nargs="?", default="", help="a folder ('' lists the roots)")
    ls.add_argument("-r", "--recursive", action="store_true", help="everything below")
    ls.set_defaults(run=_ls)

    find = commands.add_parser("find", help="find books and notes by name, wherever filed")
    find.add_argument("words", nargs="+", help="words of the name: author, title, year…")
    find.add_argument("--in", dest="inside", default="", help="only under this path")
    find.set_defaults(run=_find)

    pull = commands.add_parser("pull", help="copy a file or folder down, keeping its path")
    pull.add_argument("path", help="a file or folder in the library")
    pull.add_argument(
        "--to", type=Path, help="where copies go (default: NABU_REFS_DIR or ~/nabu-references)"
    )
    pull.add_argument(
        "--max-gb",
        type=float,
        default=DEFAULT_MAX_PULL / 1024**3,
        help="refuse to copy more than this (default: %(default)s)",
    )
    pull.set_defaults(run=_pull)

    cat = commands.add_parser("cat", help="print a file (a note, say; Google Docs as Markdown)")
    cat.add_argument("path", help="a file in the library")
    cat.set_defaults(run=_cat)
    return parser


def _fail(error: RelayError) -> NoReturn:
    print(f"error: {error}", file=sys.stderr)
    hint = _HINTS.get(error.error)
    if hint:
        print(hint, file=sys.stderr)
    raise SystemExit(1)


def main(argv: Sequence[str] | None = None, out: IO[str] | None = None) -> None:
    args = _parser().parse_args(argv)
    run = cast("Callable[[Relay, argparse.Namespace, IO[str]], None]", args.run)
    try:
        run(relay_from_env(args.url), args, out or sys.stdout)
    except RelayError as error:
        _fail(error)


if __name__ == "__main__":
    main()
