---
name: moonshot
description: Autonomously implement a task with a multi-agent plan→implement→validate→iterate→ship loop. Use when the user says "/moonshot", "run moonshot", or asks to autonomously implement/fix an issue with independent validation. Accepts a GitHub, Linear, or Jira issue reference (number, key, or URL), a file path, or inline text; supports --pr to open a pull request.
---

# moonshot

Drive an autonomous multi-agent workflow: classify the task, optionally plan it, implement it, validate it with independent blind validators, loop on rejection, and (with `--pr`) ship a pull request.

## When to use

- The user explicitly runs `/moonshot ...`, or asks to autonomously implement/fix something with independent verification.
- The task has describable "done" criteria. If it is exploratory ("make it faster", "improve the code"), say so and ask for concrete acceptance criteria first — this workflow needs a verifiable target.

## Never do

- Never launch without the user's explicit request — this spawns many subagents and costs tokens.
- Never turn a vague task into a run. Confirm acceptance criteria exist first.

## Steps

1. **Parse the argument.** From the user's input extract the task reference and flags (`--pr`, `--base <branch>`).

2. **Resolve the task text.** Match the reference against these forms, first match wins; for every tracker build `task` as `"<title>\n\n<description>"`:
   - GitHub issue URL, `#N`, or pure integer (e.g. `123`) → run `gh issue view <N> --json title,body`.
   - Linear issue URL (`linear.app/<workspace>/issue/KEY-123...`) → fetch the issue via the connected Linear MCP tools (get issue by identifier).
   - Jira issue URL (`<site>.atlassian.net/browse/KEY-123`) → fetch via the connected Atlassian MCP tools (`getJiraIssue`).
   - Bare issue key (`KEY-123`, i.e. `[A-Z][A-Z0-9]+-\d+`) → Linear and Jira share this format. Check which connector is available (search for Linear/Atlassian tools): exactly one connected → use it; both connected → ask the user once which tracker the key belongs to; neither → tell the user to connect the Linear or Atlassian connector and stop. Never silently treat an unresolvable issue key as inline task text.
   - A path that exists (e.g. `feature.md`) → read the file; `task` is its contents.
   - Anything else → treat the raw text as `task`.

   If any lookup fails (not found, no permission, connector absent), tell the user and stop. (The workflow's subagents never ask questions; this pre-flight step in the main session may ask the one disambiguation question above.)

3. **Decide workdir + PR mode:**
   - Default (no `--pr`): `workdir` = the absolute path of the current repo root (`git rev-parse --show-toplevel`), `pr` = false. Agents edit files in place; the user reviews.
   - `--pr`: create an isolated worktree so agents can commit safely:
     - `base` = the `--base` value or `main`.
     - slug = a short kebab-case name from the task.
     - `git worktree add ../moonshot-<slug> -b moonshot/<slug> <base>`
     - `workdir` = the absolute path of that new worktree; `pr` = true.

4. **Run the workflow.** The workflow script `moonshot.js` lives in this skill's base
   directory (Claude Code announces "Base directory for this skill: <path>" when the skill
   loads). Call the Workflow tool with its absolute path:
   `Workflow({ scriptPath: "<skill-base-dir>/moonshot.js", args: { task, workdir, pr, base } })`
   This is an explicit, user-requested multi-agent orchestration — the correct use of Workflow.

5. **Report the result** returned by the workflow, in this order:
   - Classification (complexity / taskType) and the route taken.
   - Whether it was **approved**, and in how many iterations.
   - If not approved: the outstanding rejections (validator, severity, message) so the user can decide next steps.
   - The implementation summary.
   - If `--pr`: the PR url/number and the verification result. If the push was blocked, surface `blockedReason`.
   - In `--pr` mode, remind the user the work is in the worktree `../moonshot-<slug>` on branch `moonshot/<slug>`.

## Notes

- Blind validation is automatic: each validator is a fresh subagent that never sees the implementer's reasoning — only the task, the plan/criteria, and the actual code on disk.
- To resume after an interruption, re-run with the same `scriptPath` and pass the prior run's id via the Workflow `resumeFromRunId` option (session-scoped).
- The git-safety hook (`MOONSHOT_GUARD`) blocks catastrophic git commands during the run.
