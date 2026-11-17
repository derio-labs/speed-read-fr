# Speed Read for VS Code

A structure-aware speed reader for Markdown files. Prose is streamed in chunks; lists are read
item by item; code, tables, math and Mermaid diagrams are shown as exhibits beside the stage;
headings are stops. Everything is bundled: the reader makes no network request.

## Commands

- **Speed Read: Read File** — the whole file.
- **Speed Read: Read Selection** — the selected lines.
- **Speed Read: Read From Cursor** — from the start of the block holding the cursor.
- **▶ Read section** (CodeLens above each heading) — that heading's section.
- **▶ Speed read from here** (hover on a heading or paragraph) — from that block.

`Alt+Shift+R` in a Markdown editor reads the selection when there is one, else the file.

The editor cursor follows the block being read and stays there when the reader is paused or
closed. Settings are under `speedRead.*`.

## Known limits

The Copilot and Claude Code chat panels cannot be read: the text must be in a file or a
selection. Non-Markdown files are read as plain prose. Remote (`http(s)`) images are not loaded
and are shown as a placeholder with their alt text.
