# zeroshot-cc

zeroshot-cc reproduces zeroshot's autonomous multi-agent implement→validate→iterate→ship loop using only Claude Code primitives (skill + Workflow script + subagents + one hook). No Docker, no daemon, no external dependencies.

## How it works

A classifier subagent picks Complexity (TRIVIAL/SIMPLE/STANDARD/CRITICAL) × TaskType (INQUIRY/TASK/DEBUG). A deterministic router maps that pair to a run shape: whether to plan, which validators to run, and how many retries are allowed. The workflow then runs planner → implementer → parallel blind validators → consensus → reject-loop → optional git-pusher, each a fresh-context, schema-constrained subagent. Blind validation is free: validators never see the implementer's reasoning — only the task, the plan/acceptance criteria, and the actual code on disk.

## Install

**As a plugin (recommended):**

```
/plugin marketplace add <owner>/zeroshot-cc
/plugin install zeroshot@zeroshot-cc
```

(`<owner>` is a literal placeholder — this repo has no remote yet.)

**In-repo:** clone the repo, start `claude` inside it, and trust it when prompted.

## Usage

```
/zeroshot <issue-reference | file-path | inline text> [--pr] [--base <branch>]
```

Issue references: a GitHub issue number or URL (`123`, `#123`), a Linear or Jira issue key or URL (`KEY-123`, `linear.app/.../issue/KEY-123`, `<site>.atlassian.net/browse/KEY-123`). GitHub resolves via `gh`; Linear and Jira via their Claude Code connectors (MCP) — connect the one you use. A bare `KEY-123` uses whichever of the two is connected, and asks once if both are. All forms resolve to `"<title>\n\n<description>"` as the task.

Examples:

- `/zeroshot 123` — resolve GitHub issue 123 (`gh issue view 123`) as the task.
- `/zeroshot NPK-42` — resolve Linear/Jira issue NPK-42 via the connected tracker.
- `/zeroshot feature.md` — read `feature.md` from disk as the task.
- `/zeroshot "add input validation to the signup form"` — use the text itself as the task.
- `/zeroshot 123 --pr --base develop` — same as above, but ship a pull request based on `develop`.

`--pr` requires `gh` and `git`, and runs in an isolated worktree at `../zeroshot-<slug>` (branch `zeroshot/<slug>`) so the agents can commit safely without touching your working tree.

## Git-safety guard

A PreToolUse hook blocks catastrophic git commands before they run: `reset --hard`, force-push, `clean -f`, destructive `checkout`, `branch -D`, and `stash`. It is **inert until armed** — add `"env": { "ZS_GUARD": "1" }` to your settings.json to arm it.

## Non-goals

- No durable cross-session daemon — resume is session-scoped via `resumeFromRunId`.
- No Docker isolation.
- No cryptographic command proofs — validators report `{command, exitCode, output}` evidence instead.
- Claude Code only (no codex/gemini).
- No SQLite ledger/message bus — replaced by Workflow control flow.

## Development

Run `npm test` (Node 18+, built-in test runner, zero dependencies). `lib/` holds the canonical routing/consensus logic, which is deliberately mirrored inline in `zeroshot/skills/zeroshot/zeroshot.js` (Workflow scripts are sandboxed and cannot `require`). Python 3 is needed for the hook and its tests.

## Layout

```
zeroshot-cc/
├── .claude-plugin/marketplace.json   # marketplace manifest (this repo)
├── zeroshot/                         # the plugin
│   ├── .claude-plugin/plugin.json    # plugin manifest
│   ├── skills/zeroshot/              # SKILL.md + zeroshot.js (Workflow script)
│   └── hooks/                        # hooks.json + block-dangerous-git.py
├── lib/                              # canonical routing.js / consensus.js (dev reference)
└── tests/                            # node --test suite for lib/ and the hook
```
