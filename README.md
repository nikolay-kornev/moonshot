# moonshot

moonshot reproduces the [zeroshot](https://github.com/the-open-engine/zeroshot) harness's autonomous multi-agent implement→validate→iterate→ship loop using only Claude Code primitives (skill + Workflow script + subagents + one hook). No Docker, no daemon, no external dependencies.

## How it works

A classifier subagent picks Complexity (TRIVIAL/SIMPLE/STANDARD/CRITICAL) × TaskType (INQUIRY/TASK/DEBUG). A deterministic router maps that pair to a run shape: whether to plan, which validators to run, and how many retries are allowed. The workflow then runs planner → implementer → parallel blind validators → consensus → reject-loop → optional git-pusher, each a fresh-context, schema-constrained subagent. Blind validation is free: validators never see the implementer's reasoning — only the task, the plan/acceptance criteria, and the actual code on disk.

## Install

**From a local clone:**

```
git clone <this-repo> moonshot
/plugin marketplace add /path/to/moonshot
/plugin install moonshot@moonshot
```

**From GitHub** (once the repo has a remote): `/plugin marketplace add <owner>/moonshot`, then install as above.

Note: cloning and trusting the repo is NOT enough by itself — the skill lives in the plugin, not in `.claude/skills/`, so it only appears after `/plugin install`. The repo's own `.claude/settings.json` arms only the dev git-safety hook.

## Usage

```
/moonshot <issue-reference | file-path | inline text> [--pr] [--base <branch>]
```

Issue references: a GitHub issue number or URL (`123`, `#123`), a Linear or Jira issue key or URL (`KEY-123`, `linear.app/.../issue/KEY-123`, `<site>.atlassian.net/browse/KEY-123`). GitHub resolves via `gh`; Linear and Jira via their Claude Code connectors (MCP) — connect the one you use. A bare `KEY-123` uses whichever of the two is connected, and asks once if both are. All forms resolve to `"<title>\n\n<description>"` as the task.

Examples:

- `/moonshot 123` — resolve GitHub issue 123 (`gh issue view 123`) as the task.
- `/moonshot NPK-42` — resolve Linear/Jira issue NPK-42 via the connected tracker.
- `/moonshot feature.md` — read `feature.md` from disk as the task.
- `/moonshot "add input validation to the signup form"` — use the text itself as the task.
- `/moonshot 123 --pr --base develop` — same as above, but ship a pull request based on `develop`.

`--pr` requires `gh` and `git`, and runs in an isolated worktree at `../moonshot-<slug>` (branch `moonshot/<slug>`) so the agents can commit safely without touching your working tree.

> **Trust warning:** the resolved issue text is interpolated verbatim into the prompts of autonomous, non-interactive agents with shell access. Only run against issues from sources you trust, and prefer `--pr` (isolated worktree) for anything third-party.

## Git-safety guard

A PreToolUse hook blocks catastrophic git commands before they run: `reset --hard`, force-push, `clean -f`, destructive `checkout`, `branch -D`, and `stash`. It is **inert until armed** — add `"env": { "MOONSHOT_GUARD": "1" }` to your settings.json to arm it.

## Non-goals

- No durable cross-session daemon — resume is session-scoped via `resumeFromRunId`.
- No Docker isolation.
- No cryptographic command proofs — validators report `{command, exitCode, output}` evidence instead.
- Claude Code only (no codex/gemini).
- No SQLite ledger/message bus — replaced by Workflow control flow.

## Development

`lib/` and `tests/` are TypeScript, run directly via Node's native type stripping: `npm test` (Node 23.6+, built-in test runner, no build step). `npm run typecheck` runs `tsc --noEmit` (`typescript` and `@types/node` are the only devDependencies; runtime has none). `lib/` holds the canonical routing/consensus logic, deliberately mirrored inline in `moonshot/skills/moonshot/moonshot.js` — that file must stay plain JavaScript, because the Workflow runtime does not strip types; it is typechecked anyway via `// @ts-check` + JSDoc against `workflow-globals.d.ts` (ambient declarations of the Workflow dialect's injected globals). Python 3 is needed for the hook and its tests.

## Credits

moonshot is an independent reimplementation of [zeroshot](https://github.com/the-open-engine/zeroshot) by The Open Engine Company (MIT License, Copyright (c) 2026 The Open Engine Company) — its classify→plan→implement→validate→iterate→ship design and prompt discipline are the direct inspiration for this project. The git-safety hook (`moonshot/hooks/block-dangerous-git.py`) is ported from zeroshot's `cluster-hooks/block-dangerous-git.py`. moonshot ports these ideas to Claude Code primitives; it is not affiliated with or endorsed by The Open Engine Company.

## Layout

```
moonshot/
├── .claude-plugin/marketplace.json   # marketplace manifest (this repo)
├── moonshot/                         # the plugin
│   ├── .claude-plugin/plugin.json    # plugin manifest
│   ├── skills/moonshot/              # SKILL.md + moonshot.js (Workflow script)
│   └── hooks/                        # hooks.json + block-dangerous-git.py
├── lib/                              # canonical routing.ts / consensus.ts (dev reference)
└── tests/                            # node --test suite (TypeScript) for lib/ and the hook
```
