# db-driver

> **A CLI that lets AI agents safely query MySQL / PostgreSQL.**
> AST-level permission checks via `node-sql-parser`, with a one-liner skill install to `~/.agents/skills/db-driver/`.

[![npm version](https://img.shields.io/npm/v/db-driver.svg)](https://www.npmjs.com/package/db-driver)
[![npm downloads](https://img.shields.io/npm/dm/db-driver.svg)](https://www.npmjs.com/package/db-driver)
[![license](https://img.shields.io/npm/l/db-driver.svg)](https://github.com/668mt/db-driver)
[![node](https://img.shields.io/node/v/db-driver.svg)](https://www.npmjs.com/package/db-driver)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![GitHub stars](https://img.shields.io/github/stars/668mt/db-driver.svg)](https://github.com/668mt/db-driver/stargazers)

[English](#) · [简体中文](./README.md)

---

## Why

Letting an AI agent write raw SQL is risky:

- Comment-splitting tricks like `U/**/PDATE` sneak past naive regex filters
- Stored procedures (`CALL proc()`) can do almost anything
- One bad query can wreck production data

`db-driver` pipes every SQL statement through a real **AST parser** (`node-sql-parser`), enforces per-connection permission bits, and emits structured JSON for agents. Result: **minimal context, maximum control, fail-safe by default**.

## Features

- 🛡️ **AST-level permission checks** — 4 bits (query / update / delete / ddl); any parse failure → reject
- 🔐 **Encrypted at rest** — AES-256-GCM binary, master key managed by OS keyring (Windows DPAPI / macOS Keychain / Linux Secret Service)
- 🤖 **AI-agent native** — `db-driver install` drops a skill into `~/.agents/skills/db-driver/` so every agent auto-discovers the commands
- 🗃️ **MySQL & PostgreSQL** — PG multi-schema, MySQL partitioned tables, `EXPLAIN` / `EXPLAIN ANALYZE`
- 💻 **Two config modes** — Web console (React UI) or CLI flags (script-friendly)
- 📝 **Usage notes** — Markdown snippets tied to one or more `dbId`s, stored in plaintext SQLite (no passwords, safe to share)
- 🔁 **Backup & migrate** — Encrypted export (PBKDF2 / AES-256-GCM), restorable on any machine

## 📑 Table of Contents

- [30-Second Quickstart](#30-second-quickstart)
- [For AI Agents: Skill Workflow](#for-ai-agents-skill-workflow)
- [Permission Model](#permission-model)
- [Configuration](#configuration)
- [Command Reference](#command-reference)
- [Localized Error Messages](#localized-error-messages)
- [Troubleshooting](#troubleshooting)
- [Architecture](#architecture)
- [Development](#development)
- [Release](#release)
- [License](#license)

## ⚡ One-Liner Skill Install (No `db-driver` Required)

Want your AI agent to learn the db-driver workflow right away, before committing to a full install? Drop the skill into `~/.agents/skills/db-driver/` with a single command — **no global `db-driver` install required**:

```bash
npx -y db-driver@latest install
```

Good for:

- 🤖 An AI agent's first appearance on a user's machine — let local agent tools (Claude Code, IDE agents, …) discover the commands immediately
- 🧪 Previewing `SKILL.md` before deciding to install for real
- 🚀 CI / scripted environments where you don't want `npm install -g` polluting global state

> After running this, agents will recognize the `db-driver ...` commands. Install the full CLI with `npm install -g db-driver` whenever you actually need to run SQL.

## 30-Second Quickstart

```bash
# 1. Install
npm install -g db-driver

# 2. Configure a DB connection (a read-only account is recommended)
db-driver config --dbId my-app \
  --type mysql --host 127.0.0.1 --port 3306 \
  --user reader --password secret --database mydb

# 3. Install the skill for AI agents (skip if you already ran the npx command above)
db-driver install

# 4. AI can now query
db-driver schema my-app
db-driver execute my-app "SELECT * FROM users LIMIT 5" --json
```

## For AI Agents: Skill Workflow

`db-driver install` writes `skill/SKILL.md` into `~/.agents/skills/db-driver/`. Any agent that supports skills (Claude Code, IDE agents, …) auto-discovers the commands.

**Standard workflow when an AI receives a task:**

1. `db-driver list` → find available `dbId`s
2. `db-driver schema <dbId>` → list tables (lightweight, low-context)
3. `db-driver schema <dbId> --table <name>` → columns + indexes for a specific table
4. `db-driver sample <dbId> <table>` / `count <dbId> <table>` → sample / count rows
5. `db-driver execute <dbId> "<SQL>" --json` → run a query
6. Need DDL? → `db-driver execute <dbId> "<DDL>"` (requires `ddl` permission)

**Best practices for AI:**

- **Always pass `--json`** — agents parse JSON more reliably than tables
- **Always pass `--limit`** — default 50 rows, prevents context blowups
- **Schema first** — don't guess column or table names
- **Count before writing** — confirm blast radius before UPDATE / DELETE

## Permission Model

**Core design: every connection is bound to 4 permission bits at config time. Every SQL execution is checked against those bits.**

| Bit | Default | Allowed SQL |
|-----|---------|-------------|
| `dmlQuery` | ✅ true | `SELECT` / `SHOW` / `DESCRIBE` / `EXPLAIN` |
| `dmlUpdate` | ❌ false | `INSERT` / `UPDATE` / `REPLACE` / `MERGE` |
| `dmlDelete` | ❌ false | `DELETE` |
| `ddl` | ❌ false | `CREATE` / `ALTER` / `DROP` / `TRUNCATE` / `RENAME` … |

Every SQL statement goes through this pipeline:

```
SQL text
   ↓
node-sql-parser → AST
   ↓
Parse failed? → ❌ reject (blocks comment-splitting / conditional comments)
   ↓
AST type → maps to one of the 4 permission bits
   ↓
Bit enabled? → ✅ execute
Bit disabled? → ❌ reject with "<op> has been disabled"
```

### What it blocks

| Attack | How it's blocked |
|--------|------------------|
| `UPDATE users SET ...` | AST identifies `update` + `dmlUpdate` is off |
| `U/**/PDATE users ...` | Comment-splitting → parser fails → reject |
| `/*! UPDATE */ users ...` | MySQL conditional comment → parser fails → reject |
| `CALL dangerous_proc()` | AST identifies `call` → requires `ddl` |
| `LOAD DATA INFILE ...` | AST identifies `load` → requires `ddl` |
| `PREPARE stmt FROM '...'` | AST identifies `prepare` → requires `ddl` |
| Multi-statement `SELECT 1; DROP TABLE x` | Parser returns multiple statements → reject |
| Syntax error / parse failure | Always `dangerous` → reject |

### What it does NOT block (defense in depth: use a least-privilege DB user)

- Database triggers — `SELECT` can fire hidden `INSERT` / `UPDATE`
- `root` / `superuser` accounts — any tool is bypassed by direct `psql` / `mysql`
- AI using a different channel (direct psql, SSH, web console)

**👉 Bottom line: configure db-driver with a least-privilege DB account.**

```sql
-- MySQL read-only example
CREATE USER 'reader'@'%' IDENTIFIED BY 'xxx';
GRANT SELECT ON mydb.* TO 'reader'@'%';

-- Write account (use with care)
CREATE USER 'writer'@'%' IDENTIFIED BY 'yyy';
GRANT SELECT, INSERT, UPDATE ON mydb.* TO 'writer'@'%';
```

Wire `reader` into db-driver for daily queries; create a separate `writer` connection when you really need writes.

## Configuration

Two ways — pick one.

### Method A: CLI flags (script-friendly)

```bash
db-driver config \
  --dbId my-app \
  --type mysql \
  --host 127.0.0.1 --port 3306 \
  --user root --password secret \
  --database app \
  --dml-query --dml-update --ddl \
  --test     # ping before saving
```

Required: `--dbId --type --host --user --password --database`
Optional: `--port` (defaults per type), permission flags, `--test`, `--schema` (PG), `--description`

### PostgreSQL multi-schema

A PG catalog can contain many schemas (e.g. `public`, `tenant_1`). `db-driver` defaults to `public`:

```bash
db-driver config --dbId my-app \
  --type postgres --host ... --database mydb \
  --schema tenant_1              # default public, override here
  --description "Prod - tenant 1"   # optional, helps tell environments apart
```

The `schema` command can override per-call:

```bash
db-driver schema my-app --schema tenant_1
db-driver schema my-app --schema tenant_1 --table orders
```

### Method B: Web console (human-friendly)

```bash
db-driver console
```

Opens `http://127.0.0.1:7842` in your browser — visually manage connections, toggle permissions, browse tables, edit SQL usage notes, test connections. Ctrl+C to exit.

### On-disk format (encrypted)

Connection configs are stored as **AES-256-GCM** encrypted binary; the **master key is managed by the OS keyring** (Windows DPAPI / macOS Keychain / Linux Secret Service).

- No plaintext JSON on disk; passwords cannot be extracted in isolation
- Config file path is intentionally not disclosed
- After OS reinstall / user change, the keyring key is lost — configs must be re-entered (by design: keys never migrate across machines)
- No manual edit path — always go through `db-driver config` (CLI) or `db-driver console` (web)

```jsonc
// Example shape (the real file is encrypted binary) — for reference only
{
  "version": 1,
  "connections": [
    {
      "dbId": "my-app",
      "type": "mysql",
      "host": "127.0.0.1",
      "port": 3306,
      "user": "reader",
      "password": "...",
      "database": "mydb",
      "schema": null,           // PG only, optional
      "description": null,      // optional
      "permissions": {
        "dmlQuery": true,
        "dmlUpdate": false,
        "dmlDelete": false,
        "ddl": false
      },
      "createdAt": "2026-09-19T...",
      "updatedAt": "2026-09-19T..."
    }
  ]
}
```

## Command Reference

### Connection management

| Command | Purpose |
|---------|---------|
| `db-driver console [--port N]` | Open web console (connections + usage, default port 7842) |
| `db-driver config --dbId x --type ...` | Save a connection from CLI (script-friendly) |
| `db-driver list` | List all `dbId`s |
| `db-driver show <dbId>` | Show connection details (password masked; `--reveal-password` to display) |
| `db-driver test <dbId>` | Test connectivity |
| `db-driver remove <dbId> --yes` | Delete a connection |
| `db-driver export <file> [--passphrase <pwd>]` | Export all connections (no passphrase → plaintext JSON; ≥8 chars → encrypted `.exp`) |
| `db-driver import <file> [--passphrase <pwd>] [--replace]` | Import from file (same `dbId` skipped by default; `--replace` overwrites) |

### Data exploration

| Command | Purpose |
|---------|---------|
| `db-driver schema <dbId>` | List tables (always start here) |
| `db-driver schema <dbId> --table <t>` | Columns + indexes + comments |
| `db-driver schema <dbId> --table <t> --show-partitions` | Also show MySQL partition sub-tables |
| `db-driver schema <dbId> --search <p>` | Fuzzy-filter table names |
| `db-driver schema <dbId> --schema <s>` | PG: temporarily switch schema (overrides config) |
| `db-driver schema <dbId> --limit N --offset M` | Paginate the list (total / offset / limit in output) |
| `db-driver sample <dbId> <table>` | Sample rows (default 10) |
| `db-driver count <dbId> <table>` | Row count |
| `db-driver execute <dbId> "<SQL>" --json` | Run a query (with JSON output) |
| `db-driver explain <dbId> "<SQL>"` | Query plan (no execution) |
| `db-driver explain <dbId> "<SQL>" --analyze` | Actually execute and return timing |

### Usage notes (plaintext Markdown; a note can bind to multiple `dbId`s)

| Command | Purpose |
|---------|---------|
| `db-driver usage list` | List notes (default: title + first-line preview only) |
| `db-driver usage list --dbId a,b` | Filter by `dbId` (comma-separated, OR match) |
| `db-driver usage list --search <kw>` | Keyword search (title / dbIds / content) |
| `db-driver usage list --limit N --offset M` | Paginate |
| `db-driver usage detail <index>` | View one note in full Markdown |
| `db-driver usage save --dbId a,b --title "..." --content "..."` | Create (multiple `dbId`s comma-separated) |
| `db-driver usage save --dbId a --title "..." --content-file ./note.md` | Read content from a file |
| `db-driver usage save --dbId a --title "..." --content-file -` | Read content from stdin |
| `db-driver usage update <index> --title/--content/--dbIds` | Update (agent-friendly; any field may be omitted) |
| `db-driver usage update <index> --content-file ./new.md` | Read new content from a file |
| `db-driver usage bind --add prd` | Add `prd` tag to all notes |
| `db-driver usage bind --remove staging` | Remove `staging` tag from all notes |
| `db-driver usage bind --entries 1,2,3 --add a` | Add tag to a subset of notes |
| `db-driver usage rm <index>` | Delete one note |
| `db-driver usage clear [--dbId <id>] --yes` | Clear all (optionally for a specific `dbId`) |

### Install / self-update

| Command | Purpose |
|---------|---------|
| `db-driver install` | Install the skill into `~/.agents/skills/db-driver/` |
| `db-driver update` | Self-update from npm (refuses source-link installs) |
| `db-driver update --check` | Only check whether a newer version exists |

### Global options

- `--json` — supported on every read command; for AI parsing
- `--limit N` — `execute` / `sample` row cap (defaults 50 / 10); also pagination for `schema` / `usage list`
- `--offset M` — pagination for `schema` / `usage list` (combine with `--limit`)
- `--where <expr>` — append a WHERE clause to `sample` / `count`

## Localized Error Messages

All DB errors are translated to human-friendly text in the format `<friendly message> (<raw message>)`, so the original error stays visible for debugging.

### MySQL error codes

| Code | Message |
|------|---------|
| 1044 | Access denied: current user lacks privileges on this database |
| 1045 | Access denied: invalid username or password |
| 1049 | Database does not exist |
| 1054 | Unknown column |
| 1062 | Duplicate entry (unique-key conflict) |
| 1064 | SQL syntax error |
| 1141 / 1142 | Insufficient privileges |
| 1146 | Table does not exist |
| 1205 | Lock wait timeout |
| 1213 | Deadlock — please retry |
| 2002 | Cannot connect to DB host (connection refused) |
| 2003 | Cannot connect to DB host (port unreachable) |
| 2013 | Lost connection (network issue or query timeout) |
| ECONNREFUSED | Connection refused: check host / port and that the DB server is running |

### PostgreSQL SQLSTATE

| SQLSTATE | Message |
|----------|---------|
| 08000 / 08001 / 08003 / 08006 | Connection exception / failure |
| 23502 | Not-null violation |
| 23503 | Foreign-key violation |
| 23505 | Duplicate entry (unique-key conflict) |
| 28P01 | Authentication failed: invalid username or password |
| 3D000 | Database (catalog) does not exist |
| 40P01 | Deadlock — please retry |
| 42501 | Insufficient privileges |
| 42601 | SQL syntax error |
| 42703 | Column does not exist |
| 42P01 | Table or view does not exist |
| 55P03 | Lock wait timeout — please retry later |

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Command not found | `npm install -g db-driver` didn't run / PATH issue |
| Connection does not exist | `db-driver list` to see available `dbId`s |
| Permission denied ("has been disabled") | `db-driver show <dbId>` to inspect bits; the error includes `SELECT=... UPDATE=... DELETE=... DDL=...`. **Adjust manually with `db-driver config`** — never let an AI auto-elevate |
| SELECT denied but should be allowed | Confirm `dmlQuery=true`; the SQL may have been typed by the AST as something else (debug with `--json` + `node-sql-parser`) |
| Table / column missing | `db-driver schema <dbId> --search <keyword>` |
| PG schema can't find tables | `db-driver show <dbId>` to confirm schema; pass `--schema` to override per call |
| Too many results — need pagination | `schema` / `usage list` add `--limit N --offset M` |
| Need MySQL partition sub-tables | `schema <dbId> --table <t> --show-partitions` |
| SQL not parseable | Contains comment-splitting / conditional comment tricks — rejected by design |
| Bulk-add `dbId` to all notes | `usage bind --add <dbId>` (applies to all notes) |
| Update single note's `dbId` / title | `usage update <index> --title ... --dbIds a,b` (agent-friendly, non-blocking) |
| Process hangs | MySQL / PG pool issue; try `db-driver update` to grab the latest version; `npm run dev:stop` to clean up |

## Red Lines for AI Agents

If you're an AI agent driving this tool:

- **Never self-elevate permissions** — when a query is denied, do NOT run `db-driver config` to open up new bits
- **Elevation requires explicit user consent** — only suggest a new `config` command after the user clearly says "open INSERT permission", "enable DDL", etc.
- **Stop and report on any failure** — don't try a second path to sneak around a denied / failed query
- **Never edit config files directly** — let the user run `db-driver config` themselves

Full version: `skill/SKILL.md` (the entry point actually loaded by agents).

## Architecture

```
db-driver/
├── src/
│   ├── cli.ts                       # commander entry
│   ├── commands/                    # one file per subcommand
│   │   ├── config.ts                # config (web + CLI dual mode)
│   │   ├── list/show/test/remove.ts # connection management
│   │   ├── schema/sample/count.ts   # data exploration
│   │   ├── execute.ts               # SQL execution + AST permission check
│   │   ├── explain.ts               # EXPLAIN / EXPLAIN ANALYZE
│   │   ├── export.ts / import.ts    # encrypted export / import
│   │   ├── usage.ts                 # usage notes
│   │   └── install/update.ts        # skill install / npm self-update
│   ├── db/
│   │   ├── index.ts                 # DbDriver interface + createDriver factory
│   │   ├── mysql.ts                 # MySQL (mysql2/promise pool)
│   │   ├── postgres.ts              # PostgreSQL (pg.Client)
│   │   ├── pool.ts                  # in-process pool (30s TTL)
│   │   ├── permissions.ts           # AST parsing + permission check
│   │   └── types.ts                 # DbConnectionConfig etc.
│   ├── store/
│   │   ├── configStore.ts           # AES-256-GCM encrypted connection config
│   │   └── usageStore.ts            # usage notes (plaintext SQLite)
│   ├── utils/
│   │   ├── paths.ts                 # config / skill paths
│   │   ├── crypto.ts                # AES-256-GCM helpers
│   │   ├── ident.ts                 # table / column identifier quoting
│   │   └── errors.ts                # localized error mapping
│   └── web/                         # db-driver console web UI (React + Vite)
│       ├── server.ts                # local HTTP server (connections + usage API)
│       ├── index.html
│       └── src/                     # React components
├── skill/SKILL.md                   # entry point for AI agents
├── README.md / README.en.md         # this file / Chinese version
└── AGENTS.md                        # architecture & contributor guidelines
```

## Development

```bash
git clone https://github.com/668mt/db-driver.git
cd db-driver
npm install
npm run build         # compile to dist/
npm link              # global link → db-driver is on PATH
```

After modifying code, always run:

```bash
npm run build                   # compile
db-driver install               # re-sync skill (required when commands change)
```

Full contributor guide: [AGENTS.md](./AGENTS.md).

## Release

```bash
# bump version + compile + publish
npm run release:patch           # 0.1.0 → 0.1.1
# or minor / major

# push code + tag
git push --follow-tags
```

After publishing, users upgrade via `db-driver update`.

## Contributing

PRs and issues are welcome:

- 🐛 **Bug reports** — include `db-driver --version`, the failing command, and the full error output
- 💡 **Feature requests** — open an Issue first to align on design before sending a PR
- 🔧 **Code changes** — run `npm run build` + `db-driver install`, and keep `README.md` / `README.en.md` / `SKILL.md` / `AGENTS.md` in sync

Full release flow (including npm publishing): [AGENTS.md](./AGENTS.md).

## License

MIT © [668mt](https://github.com/668mt) — see [`package.json`](./package.json) (`"license": "MIT"`)
