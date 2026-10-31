<div align="center">
[简体中文](README.zh_cn.md)
</div>

# Pouch · Learning Record Dashboard

> "He, with always a young servant accompanying him, rode a donkey, carrying an old brocade pouch, and whenever he gained something, he wrote it down and put it in the pouch." — *Biography of Li He*

![Java](https://img.shields.io/badge/Java-21-ED8B00?style=flat-square&logo=openjdk&logoColor=white)
![Local Only](https://img.shields.io/badge/Local%20Only-127.0.0.1-success?style=flat-square)
![Version](https://img.shields.io/badge/Version-1.3.0-success?style=flat-square)

---

People often jot down many things, only to forget them later. These records are often scattered across various places or forgotten in some corner. They may be inspirations, questions, knowledge, or to-do items. Pouch is a single-user, locally-run learning record dashboard where data is persisted as plain JSON files. Zero build tools, zero frontend frameworks, zero runtime external requests. Pouch aims to help you better organize and manage these records. Pouch also includes a wishlist system for managing wish income and expenditure.

## Environment Requirements

- JDK 21

## Quick Start

```powershell
# Compile and start
powershell -ExecutionPolicy Bypass -File server\start.ps1
```

After starting, open <http://127.0.0.1:8787> in your browser. Listens on loopback address only.

```powershell
# Compile only
powershell -ExecutionPolicy Bypass -File server\build.ps1

# Compile + replace version badge + package distributable zip
powershell -ExecutionPolicy Bypass -File server\build.ps1 -Version 2.0.0

# Start in background (does not occupy current terminal)
powershell -ExecutionPolicy Bypass -File server\run-bg.ps1
```

### Start Parameters

`start.ps1` supports three parameters to override defaults, useful for testing with temporary data without polluting real data:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `-Data` | `<repo>\data` | Data root directory (where 5 JSON files reside) |
| `-Web` | `<repo>\web` | Static resource root directory |
| `-Port` | `8787` | Listening port (localhost only) |

```powershell
powershell -ExecutionPolicy Bypass -File server\start.ps1 -Data D:\tmp\pouch-test -Port 9000
```

Equivalent to: `java -cp server\out;server\lib\* com.pouch.PouchServer --data=… --web=… --port=…`

## Data Directory

Default is `data/`, containing 5 JSON files (UTF-8, pretty-printed):

| File | Content |
|------|---------|
| `inspirations.json` / `questions.json` / `knowledge.json` / `todos.json` | Four record categories (shared record model, distinguished by `type`) |
| `wishlist.json` | Wishlist entries (independent model) |

Each file contains `version` and file-level `updatedAt`. **Write backup**: before each write, a snapshot is saved in `data/.backup/` (keeps about 50 snapshots per file). Data file names are declared only in `server/src/com/pouch/model/Category.java`, not hardcoded elsewhere.

## Four Pages

| Page | Content |
|------|---------|
| `/` | Dashboard: category counts, todo completion rate ring, wishlist summary, random recall, knowledge composition ring, stale reminder |
| `/list.html?type=<category>` | List page: browse by category, filter (subject/tag/status/keyword/date/sort/pagination), inline status toggle, quick new record |
| `/detail.html?id=<uuid>` | Detail page: Markdown read/edit, append-only notes, tag management, category change, status switch |
| `/wishlist.html` | Wishlist: add/delete, mark purchased, ↑/↓ adjacent sorting, three-item summary |

## Common Troubleshooting

| Symptom | Cause / Fix |
|---------|-------------|
| Page shows "Unable to connect to local server" | Backend not started → run `start.ps1`; or opened with `file://` |
| `Unable to bind port 8787` | Port occupied, change with `-Port 9000` |
| `package com.google.gson does not exist` | `server/lib/*.jar` missing, or classpath separator wrong (Windows uses `;`) |
| `error: invalid target release: 21` | `JAVA_HOME` points to old JDK, explicitly specify JDK 21's `javac` |
| Startup prints `[WARN] xxx.json parse failed, attempting to restore from backup…` | Data file corrupted, auto-restored from `.backup/`, original saved as `xxx.json.corrupt`; orange warning banner at top of page |
| Modified data file but page not changed | Memory is the query source, restart server |
| Chinese characters garbled in console | Run `chcp 65001` before starting |

## Constraint Checks

```powershell
# Reverse search all constraints in the repository (innerHTML / color literals / fetch / data file names / CSS variables)
powershell -ExecutionPolicy Bypass -File scripts\check-constraints.ps1
```

These constraints come from the spec's Testing Decisions: `innerHTML` is only allowed in `web/js/dom.js` after DOMPurify sanitization; color literals are only allowed in `web/css/tokens.css`; `fetch` is only allowed in `web/js/api.js`.

## Directory Structure

```
server/            Java source code (PouchServer → Handler → Service → Store layered architecture)
web/               Frontend (pages / js / css / vendor)
data/              5 JSON data files + .backup/ backups
scripts/           Constraint check scripts
```

## Third-Party Dependencies

Pouch uses the following third-party open-source libraries, see `NOTICE` file for details:

- Gson 2.11.0 — Apache License 2.0 (backend JSON serialization)
- Chart.js — MIT License (frontend charts)
- marked — MIT License (frontend Markdown rendering)
- DOMPurify — Mozilla Public License 2.0 (frontend HTML sanitization)

## Contributing

See `CONTRIBUTING.md` for how to report issues, submit pull requests, and follow coding conventions.

---

Thank you for using Pouch! 🎉












