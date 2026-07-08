# Formal brainstorm → spec → plan → implement workflow for moonshot

- **Date:** 2026-07-08
- **Status:** approved design
- **Inspiration:** [obra/superpowers](https://github.com/obra/superpowers) brainstorming → spec → plan → implementation process

## Problem

moonshot jumps from a task reference straight into an autonomous classify → plan →
implement loop. The plan exists only as in-memory prompt text; there is no
brainstorming step, no durable spec, and no human checkpoint between "task resolved"
and "code written". The superpowers process (interactive brainstorm, approved spec
document, approved plan document, then implementation) produces better-scoped work
and a durable design record. moonshot should follow the same formal process.

## Goals

- STANDARD/CRITICAL tasks get a formal brainstorm → spec → plan → implement flow.
- Default mode is interactive: the user answers brainstorming questions and approves
  the spec and the plan before any implementation starts.
- A `--auto` flag runs the same pipeline fully autonomously: agents write the spec
  and plan documents with no user gates.
- Spec and plan are durable Markdown documents written into the target repo and
  carried with the work (committed via the PR in `--pr` mode; left as reviewable
  new files otherwise).
- Validators enforce the spec's acceptance criteria.

## Non-goals

- No dependency on the superpowers plugin. moonshot embeds its own equivalent
  protocol; the plugin stays self-contained and installable on its own.
- No formal process for TRIVIAL, SIMPLE, DEBUG, or INQUIRY tasks — they keep
  today's fast paths byte-for-byte.
- No mid-workflow user interaction. Workflow subagents remain forbidden from
  asking questions; all interactivity lives in the SKILL.md pre-flight.
- No new gates in `--auto` mode; it is gate-free by definition.

## Design decisions

1. **Human-in-the-loop model:** interactive brainstorm in the main session by
   default; `--auto` switches to fully autonomous with artifacts on disk.
   (Rejected: approval gates between autonomous phases — triples orchestration
   for gates the interactive path gives for free.)
2. **Routing:** formality is routed by the classifier like everything else.
   `formal = taskType === 'TASK' && complexity ∈ {STANDARD, CRITICAL}`.
   (Rejected: always-formal — a brainstorming dialogue plus two documents for a
   one-line fix is unjustifiable overhead.)
3. **Self-contained:** SKILL.md embeds its own brainstorm/spec/plan protocol
   modeled on superpowers; moonshot.js gets agent prompts for the `--auto` path.
   (Rejected: invoking superpowers skills directly — breaks the plugin for users
   without superpowers installed, and the `--auto` path needs agent-side prompts
   anyway since subagents cannot run interactive skills.)
4. **Artifacts in-repo and committed:** `docs/moonshot/specs/` and
   `docs/moonshot/plans/` in the target repo/worktree. In `--pr` mode the existing
   pusher's `git add -A` sweeps them into the PR (zero new code); in non-PR mode
   moonshot never commits, so they sit as new files the user commits with the work.
5. **Classification happens once, in pre-flight.** The skill spawns one classifier
   subagent (same rubric/schema as the in-workflow classifier) and passes the
   result into the workflow, which then skips its classify agent. This resolves
   the chicken-and-egg between "brainstorm must precede the workflow" and
   "complexity is decided inside the workflow", with a single source of truth.
   (Rejected: main-session eyeballing — non-deterministic, can disagree with the
   workflow's own classifier.)
6. **Spec/plan pass into the workflow as inline strings** (`args.spec`,
   `args.plan`), not just paths: workflow scripts have no filesystem access, and
   deterministic prompt interpolation (today's `planText` mechanism) is safer than
   trusting each agent to read a file. Paths travel alongside for citation.

## Architecture

### SKILL.md pre-flight (main session, interactive)

New steps between "resolve the task" and "run the workflow":

1. **Classify early** via one classifier subagent (Agent tool, same rubric and
   JSON shape as the in-workflow classifier). On failure: launch the workflow
   exactly as today (it classifies itself) — graceful degradation, never a hard stop.
2. **Decide formality** with the routing rule above.
3. **Formal + default mode:** run the embedded protocol:
   - *Brainstorm:* questions one at a time (purpose, constraints, success
     criteria; multiple-choice preferred); propose approaches with a
     recommendation when there is a real fork.
   - *Spec:* draft in conversation — problem, goals, non-goals, design decisions,
     acceptance criteria (each MUST/SHOULD/NICE with a verification method).
     User approves.
   - *Plan:* ordered steps, files affected, verification per step. User approves.
   - *Then:* set up the workdir (worktree creation moves after the gates so an
     abandoned brainstorm leaves no trace), write both docs into it, launch the
     workflow with `{task, workdir, pr, base, classification, spec, plan,
     specPath, planPath}`.
4. **Formal + `--auto`:** skip the dialogue; launch immediately with
   `{..., classification, auto: true}`.
5. **Not formal:** launch as today, passing `classification` so the workflow
   skips one agent.

### moonshot.js workflow

New optional args — all backward-compatible; absent args reproduce today's
behavior exactly (old callers and `resumeFromRunId` unaffected):

| arg | type | effect |
|---|---|---|
| `classification` | `{complexity, taskType, reasoning}` | enum-validated; if valid, skip the classify agent; else classify as today |
| `spec`, `plan` | string | approved doc contents; skip the planner, `planText` = spec acceptance criteria + plan |
| `specPath`, `planPath` | string | cited in prompts |
| `auto` | boolean | workflow must produce spec/plan docs itself on formal routes |

**Plan phase becomes three-way:**

1. `plan` provided (interactive path) → no planner agent; use provided text.
2. No `plan`, `route.formal && auto` → **Spec phase**: a spec-writer agent
   explores the code, writes the spec doc to disk in the workdir, and returns
   structured content (schema mirrors the doc sections). Then the planner runs
   as today but additionally writes the plan doc. Structured output remains the
   source of truth for prompts; files are the durable record.
3. Otherwise → today's planner, unchanged, no doc files.

**Downstream phases untouched:** implementer, validators, `evaluate()` consensus,
iteration loop, and ship phase already consume `planText` and do not change.

### lib/routing.ts (and inline mirror)

`Route` gains `formal: boolean` — true exactly for STANDARD/CRITICAL TASK routes;
false for TRIVIAL, SIMPLE, all DEBUG. Change lands in **both** copies per the
repo's keep-in-sync constraint; the inline mirror keeps its fall-back-to-STANDARD
divergence (`formal: true` on the fallback route).

## Artifact formats

**Spec** — `docs/moonshot/specs/YYYY-MM-DD-<slug>-spec.md`:

```markdown
# <Title>
Date, task source (issue ref / file / inline), classification
## Problem
## Goals / Non-goals
## Design decisions        ← chosen and why, incl. rejected approaches
## Acceptance criteria     ← - [MUST|SHOULD|NICE] AC-1: <criterion> (verify: <how>)
```

**Plan** — `docs/moonshot/plans/YYYY-MM-DD-<slug>-plan.md`: links back to the
spec, then ordered steps, each with files affected and a verification check.

Interactive and `--auto` paths produce the same two shapes. On filename
collision the skill appends `-2`, `-3`, …

## Error handling

- Pre-flight classifier dies/returns garbage → launch workflow as today; worst
  case a missed brainstorm, never a hard failure.
- Spec/plan rejected at a gate → revise and re-present; abandonment leaves no
  worktree, files, or workflow run.
- `--auto` spec-writer fails mid-workflow → degrade to the plain planner (no
  spec doc, plan still produced); if the planner also fails with a spec present,
  `planText` falls back to the spec text alone (safe default over crash).

## Testing

- `tests/routing.test.ts`: `formal` true exactly for STANDARD/CRITICAL × TASK;
  false for all DEBUG, TRIVIAL, SIMPLE; unknown-value fallback covered.
- `tests/workflow-syntax.test.ts`: re-validates the edited moonshot.js dialect
  for free.
- `npm run typecheck`: covers new args handling and schema JSDoc.
- `evaluate()`/consensus: unchanged, no new tests.
- `SMOKE.md`: add two rows — one formal interactive run, one `--auto` run.
