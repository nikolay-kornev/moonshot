---
name: moonshot
description: Autonomously implement a task with a multi-agent plan→implement→validate→iterate→ship loop. Use when the user says "/moonshot", "run moonshot", or asks to autonomously implement/fix an issue with independent validation. Accepts a GitHub, Linear, or Jira issue reference (number, key, or URL), a file path, or inline text; supports --pr to open a pull request and --auto to skip the interactive spec/plan gates.
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

1. **Parse the argument.** From the user's input extract the task reference and flags (`--pr`, `--base <branch>`, `--auto`).

2. **Resolve the task text.** Match the reference against these forms, first match wins; for every tracker build `task` as `"<title>\n\n<description>"`:
   - GitHub issue URL, `#N`, or pure integer (e.g. `123`) → run `gh issue view <N> --json title,body`.
   - Linear issue URL (`linear.app/<workspace>/issue/KEY-123...`) → fetch the issue via the connected Linear MCP tools (get issue by identifier).
   - Jira issue URL (`<site>.atlassian.net/browse/KEY-123`) → fetch via the connected Atlassian MCP tools (`getJiraIssue`).
   - Bare issue key (`KEY-123`, i.e. `[A-Z][A-Z0-9]+-\d+`) → Linear and Jira share this format. Check which connector is available (search for Linear/Atlassian tools): exactly one connected → use it; both connected → ask the user once which tracker the key belongs to; neither → tell the user to connect the Linear or Atlassian connector and stop. Never silently treat an unresolvable issue key as inline task text.
   - A path that exists (e.g. `feature.md`) → read the file; `task` is its contents.
   - Anything else → treat the raw text as `task`.

   If any lookup fails (not found, no permission, connector absent), tell the user and stop. (The workflow's subagents never ask questions; this pre-flight step in the main session may ask the one disambiguation question above.)

3. **Classify.** Spawn ONE read-only subagent via the Agent tool (subagent_type `general-purpose`) with this prompt, substituting the resolved task text:

   > You are a CLASSIFIER only: read-only — do NOT modify, create, or implement anything. Bias AWAY from higher complexity — most real tasks are SIMPLE or STANDARD. Reserve CRITICAL for auth, payments, security, data integrity, or irreversible operations.
   > COMPLEXITY: TRIVIAL (one file, mechanical) | SIMPLE (one concern, few files) | STANDARD (multi-file feature or refactor) | CRITICAL (security / payments / data-integrity / irreversible).
   > TASKTYPE: INQUIRY (read-only question) | TASK (build or change something) | DEBUG (fix broken behavior).
   > Reply with EXACTLY one JSON object and nothing else: {"complexity": "...", "taskType": "...", "reasoning": "..."}
   >
   > TASK: <resolved task text>

   Parse the reply as JSON and validate `complexity` ∈ {TRIVIAL, SIMPLE, STANDARD, CRITICAL} and `taskType` ∈ {INQUIRY, TASK, DEBUG}. If the agent fails or the reply does not validate, set `classification = null`, skip steps 4–5 and the document writing in step 7, and continue — the workflow classifies itself (today's behavior; never a hard stop).

4. **Decide formality.** `formal` = (`taskType` is `TASK`) and (`complexity` is `STANDARD` or `CRITICAL`). Non-formal tasks skip step 5 and the document writing in step 7.

5. **Brainstorm and draft (formal without `--auto`; with `--auto` skip this step entirely).**
   - Ask clarifying questions ONE at a time — purpose, constraints, success criteria; prefer multiple choice, and every multiple-choice question must also offer a free-form option ("Other — type your own answer"; when asking via AskUserQuestion this is built in, when asking in plain text list it explicitly). When you have a preferred answer, put it first and mark it "(Recommended)" with a one-line why. Stop when you can state the design (2–6 questions is typical).
   - If there is a genuine fork in the road, propose 2–3 approaches with trade-offs, leading with your recommendation and why.
   - Draft the **spec** in the conversation: Problem, Goals, Non-goals, Design decisions (chosen approach and why, including rejected alternatives), Acceptance criteria — each line `- [MUST|SHOULD|NICE] AC-n: <criterion> (verify: <how>)`; the MUSTs define "done". Ask the user to approve; revise until approved.
   - Draft the **plan**: ordered implementation steps, files affected per step, a verification check per step. Ask the user to approve; revise until approved.
   - If the user abandons, stop. Nothing has been created — no worktree, no files, no workflow run.

6. **Decide workdir + PR mode:**
   - Default (no `--pr`): `workdir` = the absolute path of the current repo root (`git rev-parse --show-toplevel`), `pr` = false. Agents edit files in place; the user reviews.
   - `--pr`: create an isolated worktree so agents can commit safely:
     - `base` = the `--base` value or `main`.
     - slug = a short kebab-case name from the task.
     - `git worktree add ../moonshot-<slug> -b moonshot/<slug> <base>`
     - `workdir` = the absolute path of that new worktree; `pr` = true.

7. **Write the documents (formal only).** Compute `<date>` with `date +%F` and a short kebab-case `<slug>` from the task. Paths, relative to `workdir`:
   - spec: `.claude/moonshot/specs/<date>-<slug>-spec.md`
   - plan: `.claude/moonshot/plans/<date>-<slug>-plan.md`

   If a path already exists, append `-2`, `-3`, … to the slug. In both modes, first ensure `.claude/moonshot/.gitignore` exists inside `workdir` containing `*` — the directory is self-ignoring, so the docs can never be committed (not even by the `--pr` pusher's `git add -A`). Then:
   - Interactive: write the approved spec and plan to those paths (create directories as needed). They are ephemeral working artifacts, never committed — the durable record of the approved spec is wherever the user keeps it (e.g. their issue tracker).
   - `--auto`: do NOT write the spec/plan files; just compute and pass the paths — the workflow's spec-writer and planner agents write them.

8. **Read config + run the workflow.** If `.claude/moonshot/config.json` exists at the current repo root (`git rev-parse --show-toplevel` — the original repo, not a worktree), read it and take its `models` and `effort` objects. Drop, and tell the user about, any entry that fails validation: stage key not in {`classify`, `spec`, `plan`, `implement`, `validate`, `ship`}, `models` value not in {`haiku`, `sonnet`, `opus`, `fable`}, `effort` value not in {`low`, `medium`, `high`, `xhigh`, `max`}. If the file is unreadable or not valid JSON, warn and proceed without it — never a hard stop.

   Call the Workflow tool on `moonshot.js` in this skill's base directory:
   `Workflow({ scriptPath: "<skill-base-dir>/moonshot.js", args: { task, workdir, pr, base, classification, spec, plan, specPath, planPath, auto, models, effort } })`
   Omit fields you do not have: `classification` when step 3 failed; `spec` and `plan` (the approved document contents, as strings) only on the interactive formal path; `specPath`/`planPath` only when formal; `auto: true` only when `--auto` was given; `models`/`effort` only when the config file provided surviving entries.

9. **Report the result** returned by the workflow, in this order:
   - Classification (complexity / taskType), whether it came from pre-flight or in-workflow, and the route taken.
   - Whether it was **approved**, and in how many iterations.
   - If not approved: the outstanding rejections (validator, severity, message) so the user can decide next steps.
   - The implementation summary.
   - For formal runs: the spec and plan document paths (in `--auto` mode, check the files exist before citing them — a dead planner agent may have left no plan doc). In `--pr` mode note they live in the worktree and disappear when it is removed.
   - If `--pr`: the PR url/number and the verification result. If the push was blocked, surface `blockedReason`.
   - In `--pr` mode, remind the user the work is in the worktree `../moonshot-<slug>` on branch `moonshot/<slug>`.

## Notes

- Blind validation is automatic: each validator is a fresh subagent that never sees the implementer's reasoning — only the task, the plan/criteria, and the actual code on disk.
- To resume after an interruption, re-run with the same `scriptPath` and pass the prior run's id via the Workflow `resumeFromRunId` option (session-scoped).
- The git-safety hook (`MOONSHOT_GUARD`) blocks catastrophic git commands during the run.
- Formal runs (STANDARD/CRITICAL TASK) follow a formal brainstorm → spec → plan → implement process: interactive gates by default, agent-written documents with `--auto`. The spec's acceptance criteria are what the blind validators enforce.
