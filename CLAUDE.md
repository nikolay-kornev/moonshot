# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm test` — full suite via Node's built-in runner (`node --test tests/*.test.ts`, Node 23.6+ native type stripping, no build step)
- `node --test tests/routing.test.ts` — run a single test file
- `npm run typecheck` — `tsc --noEmit` over `lib/`, `tests/`, and `moonshot/` (also typechecks `moonshot.js` via `checkJs`)
- Hook tests shell out to `python3`, so Python 3 must be on PATH

## What this is

A Claude Code plugin: `/moonshot <issue|file|text> [--pr] [--base <branch>] [--auto]` runs an autonomous multi-agent classify → plan → implement → blind-validate → iterate → ship loop. The repo root is a plugin *marketplace* (`.claude-plugin/marketplace.json`) pointing at the plugin in `moonshot/`.

## Architecture

Judgment lives in subagents; control flow is deterministic code. Three artifacts:

1. **Skill** (`moonshot/skills/moonshot/SKILL.md`) — interactive pre-flight in the main session: resolves the task reference (GitHub via `gh`; Linear/Jira via MCP connectors; bare `KEY-123` must resolve or error — never falls through to inline text), refuses tasks without verifiable done-criteria, classifies pre-flight and, for STANDARD/CRITICAL tasks, runs an interactive brainstorm → spec → plan dialogue (skipped by `--auto`) whose approved documents pass into the workflow, sets up an isolated worktree for `--pr`, then invokes the Workflow tool on `moonshot.js`.
2. **Workflow script** (`moonshot/skills/moonshot/moonshot.js`) — the orchestrator. A classifier agent rates Complexity × TaskType; a deterministic `route()` table maps that to run shape (plan?, which validators, max iterations); Formal routes accept pre-approved `spec`/`plan` args (skipping the planner) or, with `auto`, run a spec-writer agent that writes `.claude/moonshot/specs/…` (a self-gitignoring dir — the docs are never committed) before planning; then implement → parallel blind validators → unanimous-consensus `evaluate()` → feed rejections back to the implementer → optional transport-only git-pusher plus an independent PR-existence check. Validators are blind by construction: fresh subagents that see only the task, plan, and code on disk. All agent outputs are JSON-Schema-constrained. Optional per-stage `args.models`/`args.effort` (read by the skill from `.claude/moonshot/config.json`) override each `agent()` call's model/effort via the `tune()` helper.
3. **Hook** (`moonshot/hooks/block-dangerous-git.py`) — PreToolUse(Bash) guard blocking `reset --hard`, force-push, `clean -f`, destructive checkout, `branch -D`, `stash`. Inert unless `MOONSHOT_GUARD=1`; fails open on bad input.

## Critical constraint: the duplicated logic is deliberate

`moonshot.js` must stay **plain JavaScript** — the Workflow runtime does not strip types and scripts cannot import modules. Therefore `route()` and `evaluate()` exist twice: canonical typed versions in `lib/routing.ts` / `lib/consensus.ts` (what the tests import), mirrored inline in `moonshot.js` (marked `ponytail: keep in sync`). **Any change to one copy must be made in both.** One intentional divergence: `lib/routing.ts` throws on unknown enum values; the inline copy falls back to the STANDARD route (mid-workflow, a safe default beats a crash).

`moonshot.js` is typechecked anyway via `// @ts-check` + JSDoc against `workflow-globals.d.ts` (ambient declarations of the Workflow runtime's injected globals: `agent`, `parallel`, `phase`, `log`, `args`, …).

The script runs in the Workflow dialect — an async function scope where top-level `await`/`return` are valid. `tests/workflow-syntax.test.ts` enforces this by constructing an `AsyncFunction` from the source (plain `node --check` would reject it) and asserts the body is not wrapped in an IIFE (that would swallow the top-level `return result`). Keep `tsconfig.json`'s `erasableSyntaxOnly` — it guarantees the `.ts` files stay runnable via type stripping.

## Testing conventions

- Tests never invoke the Workflow runtime; they test `lib/` logic directly and the hook by spawning `python3` with JSON on stdin.
- The classifier's outputs arrive untyped at runtime, which is why `lib/routing.ts` keeps runtime guards despite the TypeScript types.
