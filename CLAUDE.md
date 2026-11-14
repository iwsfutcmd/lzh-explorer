# CLAUDE.md: lzh-explorer

Corpus and NLP tools for Classical Chinese (`lzh`), published as a static site. The repository is public.
- `src/`: Svelte 5 and TypeScript.
- `pipeline/`: a stdlib-only Python data pipeline, run with uv.

[README.md](README.md) covers the data, its licenses, i18n and the layout.

## Commands

- `npm install` · `npm run dev` · `npm run check` · `npm test` · `npm run build`
- `npm run data`: rebuilds `public/data/` from the checksum-pinned sources.
- `cd pipeline && uv run --group dev pytest`
- `cd pipeline && uv run lzh-refs status|ls|find|cat|pull`: the reference library (below).

## Reference library

The owner keeps grammars, dictionaries and notes in a private Google Drive. Sessions here reach it
**read-only** through nabu's references relay:
- the relay is in iwsfutcmd/nabu, `apps/references` (ADRs 0079 and 0090 there);
- the client is `pipeline/lzh_pipeline/refs.py`.

- **The books are copyrighted.** Never commit a book, a page image or text extracted from one. The
  same goes for `public/data/`, issues and commit messages.
- **What the site ships is licensed data** (`public/data/LICENSE.md`).
  - A reference informs the work and is cited by author, title, year and page.
  - Its tables, glosses and readings never become shipped data unless its license allows it.
- **Read only** (the owner's decision, 2026-11-14).
  - `lzh-refs` sends GET requests and nothing else.
  - Never upload, move or trash through the relay any other way (curl, nabu's client).
  - Notes made here stay out of Drive.
- **Two roots.** Nothing else in the Drive is reachable.
  - `books/` is the library, sorted by subject and language family. Chinese is under
    `books/ling/sit/zho/`, but the sorting is still going on.
  - `nabu/` is nabu's work folder. Its Classical Chinese notes are in `nabu/notes/lzh/`: Kroll 2017,
    Pulleyblank 1995 and readings. Read them first.
- **Find books by name, never by a remembered path:** `uv run lzh-refs find pulleyblank grammar`.
  - Every word must start a word of the name.
  - `--in books/ling/sit` narrows the search.
  - Cite books by author, title and year, never by path.
- **Copies go to `NABU_REFS_DIR`** (default `~/nabu-references`, the folder nabu's client uses).
  - `pull` refuses a git work tree, the top of the library, and more than `--max-gb` (default 2).
  - Extract text and page images there, not here.
  - The container's disk is small: delete a copy when you are done with it.
- **Access.**
  - `NABU_REFS_URL` is the relay's address, an environment variable. Never write it into the repository.
  - In a cloud session, the network proxy adds the key for the relay's host from a network secret on
    the environment, and the client sends none. Locally, set `NABU_REFS_KEY`.
  - Never put the key in chat, files or commits.
  - `401 unauthorized` means the session's environment lacks the secret.
- **Reading the PDFs.**
  - Kroll's text layer is clean: printed page = PDF page − 16.
  - Pulleyblank's is a scan: run OCR, then read page images. Printed page = PDF page − 11.
  - Check any Han character you rely on against a page image (`pdftoppm -png -f N -l N`).
- Changes to the relay belong in nabu's `apps/references`, not here.
