---
name: zeroshot
description: Autonomously implement a task with a multi-agent plan→implement→validate→iterate→ship loop. Use when the user says "/zeroshot", "run zeroshot", or asks to autonomously implement/fix an issue with independent validation. Accepts a GitHub issue number, a file path, or inline text; supports --pr to open a pull request.
---

# zeroshot

Drive an autonomous multi-agent workflow: classify the task, optionally plan it, implement it, validate it with independent blind validators, loop on rejection, and (with `--pr`) ship a pull request.

## When to use

- The user explicitly runs `/zeroshot ...`, or asks to autonomously implement/fix something with independent verification.
- The task has describable "done" criteria. If it is exploratory ("make it faster", "improve the code"), say so and ask for concrete acceptance criteria first — this workflow needs a verifiable target.

## Never do

- Never launch without the user's explicit request — this spawns many subagents and costs tokens.
- Never turn a vague task into a run. Confirm acceptance criteria exist first.

## Steps

1. **Parse the argument.** From the user's input extract the task reference and flags (`--pr`, `--base <branch>`).

2. **Resolve the task text:**
   - Pure integer (e.g. `123`) → run `gh issue view 123 --json title,body` and build `task` as `"<title>\n\n<body>"`. If `gh` fails, tell the user and stop.
   - A path that exists (e.g. `feature.md`) → read the file; `task` is its contents.
   - Anything else → treat the raw text as `task`.

3. **Decide workdir + PR mode:**
   - Default (no `--pr`): `workdir` = the absolute path of the current repo root (`git rev-parse --show-toplevel`), `pr` = false. Agents edit files in place; the user reviews.
   - `--pr`: create an isolated worktree so agents can commit safely:
     - `base` = the `--base` value or `main`.
     - slug = a short kebab-case name from the task.
     - `git worktree add ../zeroshot-<slug> -b zeroshot/<slug> <base>`
     - `workdir` = the absolute path of that new worktree; `pr` = true.

4. **Run the workflow.** The workflow script `zeroshot.js` lives in this skill's base
   directory (Claude Code announces "Base directory for this skill: <path>" when the skill
   loads). Call the Workflow tool with its absolute path:
   `Workflow({ scriptPath: "<skill-base-dir>/zeroshot.js", args: { task, workdir, pr, base } })`
   This is an explicit, user-requested multi-agent orchestration — the correct use of Workflow.

5. **Report the result** returned by the workflow, in this order:
   - Classification (complexity / taskType) and the route taken.
   - Whether it was **approved**, and in how many iterations.
   - If not approved: the outstanding rejections (validator, severity, message) so the user can decide next steps.
   - The implementation summary.
   - If `--pr`: the PR url/number and the verification result. If the push was blocked, surface `blockedReason`.
   - In `--pr` mode, remind the user the work is in the worktree `../zeroshot-<slug>` on branch `zeroshot/<slug>`.

## Notes

- Blind validation is automatic: each validator is a fresh subagent that never sees the implementer's reasoning — only the task, the plan/criteria, and the actual code on disk.
- To resume after an interruption, re-run with the same `scriptPath` and pass the prior run's id via the Workflow `resumeFromRunId` option (session-scoped).
- The git-safety hook (`ZS_GUARD`) blocks catastrophic git commands during the run.
