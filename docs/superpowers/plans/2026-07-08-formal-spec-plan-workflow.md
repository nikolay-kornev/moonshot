# Formal brainstorm → spec → plan → implement Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** STANDARD/CRITICAL tasks get a superpowers-style brainstorm → spec → plan → implement flow — interactive by default, fully autonomous with `--auto` — with spec and plan committed as in-repo documents.

**Architecture:** The `/moonshot` SKILL.md pre-flight classifies early (one subagent), runs an embedded brainstorm/spec/plan dialogue for formal tasks, then passes `classification`/`spec`/`plan` into the workflow, which skips its classify/plan agents when given them. In `--auto` mode the workflow itself runs a new spec-writer agent plus the planner, both writing docs to disk. Spec: `docs/superpowers/specs/2026-07-08-formal-spec-plan-workflow-design.md`.

**Tech Stack:** TypeScript (Node 23.6+ native type stripping, `node --test`), plain-JS Workflow dialect for `moonshot.js`, Markdown skill instructions.

## Global Constraints

- `moonshot/skills/moonshot/moonshot.js` must stay **plain JavaScript** (Workflow runtime does not strip types; no imports). It is typechecked via `// @ts-check` + JSDoc.
- `route()` exists twice: `lib/routing.ts` (canonical, throws on unknown values) and inline in `moonshot.js` (falls back to STANDARD). **Every routing change lands in both copies.**
- All new workflow args are optional; absent args must reproduce today's behavior byte-for-byte (backcompat + `resumeFromRunId`).
- No new dependencies (dev or runtime). Keep `tsconfig.json`'s `erasableSyntaxOnly`.
- `Date.now()` / `new Date()` are **unavailable inside Workflow scripts** — dates for doc paths are computed in the SKILL.md pre-flight (`date +%F`) or by agents via the `date` command, never in `moonshot.js`.
- Verification commands: `npm test` and `npm run typecheck`, run from the repo root.

---

### Task 1: Add `formal` to `route()` (both copies, TDD)

**Files:**
- Modify: `lib/routing.ts`
- Modify: `moonshot/skills/moonshot/moonshot.js:115-131` (inline `route()` mirror)
- Test: `tests/routing.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Route.formal: boolean` — `true` exactly when `taskType === 'TASK'` and complexity is `STANDARD` or `CRITICAL`. Task 3 reads `plan.formal` in `moonshot.js`.

- [ ] **Step 1: Write the failing tests**

In `tests/routing.test.ts`, replace the first test (its `deepEqual` must learn the new field) and append a new test at the end of the file:

```ts
test('TRIVIAL TASK → 1 worker, no validators, 1 iteration', () => {
  assert.deepEqual(route('TRIVIAL', 'TASK'), {
    plan: false, debug: false, formal: false, validators: [], maxIterations: 1,
  });
});
```

```ts
test('formal is true exactly for STANDARD/CRITICAL TASK', () => {
  assert.equal(route('STANDARD', 'TASK').formal, true);
  assert.equal(route('CRITICAL', 'TASK').formal, true);
  assert.equal(route('TRIVIAL', 'TASK').formal, false);
  assert.equal(route('SIMPLE', 'TASK').formal, false);
  assert.equal(route('STANDARD', 'DEBUG').formal, false);
  assert.equal(route('CRITICAL', 'DEBUG').formal, false);
  assert.equal(route('TRIVIAL', 'DEBUG').formal, false);
  assert.equal(route('STANDARD', 'INQUIRY').formal, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/routing.test.ts`
Expected: FAIL — the `deepEqual` reports a missing `formal` property and the new test gets `undefined !== true`.

- [ ] **Step 3: Implement in `lib/routing.ts`**

Add `formal` to the interface:

```ts
export interface Route {
  plan: boolean;
  debug: boolean;
  formal: boolean;
  validators: string[];
  maxIterations: number;
}
```

Replace the body of `route()` after the two runtime guards with:

```ts
  // DEBUG at non-trivial complexity → investigate/fix/behavioral-test loop.
  if (taskType === 'DEBUG' && complexity !== 'TRIVIAL') {
    return { plan: true, debug: true, formal: false, validators: ['tester'], maxIterations: 10 };
  }

  // formal: the superpowers-style spec→plan pipeline; only real build work at
  // STANDARD/CRITICAL earns the document overhead.
  const formal = taskType === 'TASK';

  switch (complexity) {
    case 'TRIVIAL':
      return { plan: false, debug: false, formal: false, validators: [], maxIterations: 1 };
    case 'SIMPLE':
      return { plan: false, debug: false, formal: false, validators: ['generic'], maxIterations: 3 };
    case 'STANDARD':
      return { plan: true, debug: false, formal, validators: ['requirements', 'code'], maxIterations: 5 };
    case 'CRITICAL':
      return {
        plan: true, debug: false, formal,
        validators: ['requirements', 'code', 'security', 'tester'], maxIterations: 5,
      };
  }
```

- [ ] **Step 4: Mirror in `moonshot.js`**

Replace the inline `route()` (the block under `// ---------- routing (ponytail: mirror of lib/routing.ts — keep in sync) ----------`) with:

```js
/**
 * @param {string} complexity
 * @param {string} taskType
 */
function route(complexity, taskType) {
  if (taskType === 'DEBUG' && complexity !== 'TRIVIAL') {
    return { plan: true, debug: true, formal: false, validators: ['tester'], maxIterations: 10 };
  }
  const formal = taskType === 'TASK';
  switch (complexity) {
    case 'TRIVIAL': return { plan: false, debug: false, formal: false, validators: [], maxIterations: 1 };
    case 'SIMPLE': return { plan: false, debug: false, formal: false, validators: ['generic'], maxIterations: 3 };
    case 'STANDARD': return { plan: true, debug: false, formal, validators: ['requirements', 'code'], maxIterations: 5 };
    case 'CRITICAL': return { plan: true, debug: false, formal, validators: ['requirements', 'code', 'security', 'tester'], maxIterations: 5 };
    default: return { plan: true, debug: false, formal, validators: ['requirements', 'code'], maxIterations: 5 };
  }
}
```

(The `default:` fallback keeps `formal` derived from `taskType` — an unknown complexity mid-workflow degrades to the STANDARD route, per the file's safe-default divergence.)

- [ ] **Step 5: Run full verification**

Run: `npm test && npm run typecheck`
Expected: all tests PASS (one new test), typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add lib/routing.ts moonshot/skills/moonshot/moonshot.js tests/routing.test.ts
git commit -m "feat: add formal flag to route() — STANDARD/CRITICAL TASK gets spec→plan pipeline

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: New workflow args + pre-classification skip in `moonshot.js`

**Files:**
- Modify: `moonshot/skills/moonshot/moonshot.js` (args block at top; `CLASSIFY_SCHEMA`; the `phase('Classify')` block)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: consts `AUTO: boolean`, `PRE_SPEC: string|null`, `PRE_PLAN: string|null`, `SPEC_PATH: string|null`, `PLAN_PATH: string|null`, and arrays `COMPLEXITY`, `TASK_TYPES` — Task 3 uses `AUTO`/`PRE_*`/`*_PATH`.

- [ ] **Step 1: Extend the args block**

Replace the args block (currently lines 14–23) with:

```js
// args: { task, workdir, pr, base, classification?, spec?, plan?, specPath?, planPath?, auto? }
// — some callers deliver args as a JSON-encoded string
let ARGS = args;
if (typeof args === 'string') {
  try { ARGS = JSON.parse(args); } catch (e) { throw new Error('moonshot: args must be an object or a JSON-encoded string'); }
}
const TASK = ARGS?.task;
const WORKDIR = ARGS?.workdir || '.';
const WANT_PR = !!ARGS?.pr;
const BASE = ARGS?.base || 'main';
const AUTO = !!ARGS?.auto;
const PRE_SPEC = typeof ARGS?.spec === 'string' && ARGS.spec.trim() ? ARGS.spec : null;
const PRE_PLAN = typeof ARGS?.plan === 'string' && ARGS.plan.trim() ? ARGS.plan : null;
const SPEC_PATH = typeof ARGS?.specPath === 'string' && ARGS.specPath ? ARGS.specPath : null;
const PLAN_PATH = typeof ARGS?.planPath === 'string' && ARGS.planPath ? ARGS.planPath : null;
if (!TASK) throw new Error('moonshot: args.task is required');
```

- [ ] **Step 2: Hoist the enums and reuse them in `CLASSIFY_SCHEMA`**

Directly above `const CLASSIFY_SCHEMA = {`, add:

```js
const COMPLEXITY = ['TRIVIAL', 'SIMPLE', 'STANDARD', 'CRITICAL'];
const TASK_TYPES = ['INQUIRY', 'TASK', 'DEBUG'];
```

and inside `CLASSIFY_SCHEMA` change the two enum lines to:

```js
    complexity: { enum: COMPLEXITY },
    taskType: { enum: TASK_TYPES },
```

- [ ] **Step 3: Skip the classify agent when pre-classified**

Replace the current classify block:

```js
phase('Classify');
const cls = await agent(classifyPrompt(), { label: 'classify', phase: 'Classify', schema: CLASSIFY_SCHEMA });
if (!cls) throw new Error('classification failed');
log(`Classified: ${cls.complexity} / ${cls.taskType} — ${cls.reasoning}`);
```

with:

```js
phase('Classify');
/** @type {{complexity: string, taskType: string, reasoning?: string} | null} */
let cls = null;
const pre = ARGS?.classification;
if (pre && COMPLEXITY.includes(pre.complexity) && TASK_TYPES.includes(pre.taskType)) {
  cls = pre;
  log(`Pre-classified: ${cls.complexity} / ${cls.taskType} — ${cls.reasoning || 'from pre-flight'}`);
} else {
  cls = await agent(classifyPrompt(), { label: 'classify', phase: 'Classify', schema: CLASSIFY_SCHEMA });
  if (!cls) throw new Error('classification failed');
  log(`Classified: ${cls.complexity} / ${cls.taskType} — ${cls.reasoning}`);
}
```

- [ ] **Step 4: Verify**

Run: `npm test && npm run typecheck`
Expected: all tests PASS (`tests/workflow-syntax.test.ts` re-validates the dialect), typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add moonshot/skills/moonshot/moonshot.js
git commit -m "feat: accept pre-flight classification and formal-run args in workflow

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Three-way plan phase — pre-approved plan, auto spec-writer, or today's planner

**Files:**
- Modify: `moonshot/skills/moonshot/moonshot.js` (schemas; `planPrompt`; new `specPrompt` and `formatCriteria`; the `let planText` block)

**Interfaces:**
- Consumes: `plan.formal` (Task 1); `AUTO`, `PRE_SPEC`, `PRE_PLAN`, `SPEC_PATH`, `PLAN_PATH` (Task 2).
- Produces: no new exports; `planText` semantics extended (spec + plan on formal runs). Downstream implementer/validator prompts are untouched.

- [ ] **Step 1: Factor the criteria schema and add `SPEC_SCHEMA`**

Directly above `const PLAN_SCHEMA = {`, add:

```js
const CRITERIA = {
  type: 'array',
  minItems: 1,
  items: {
    type: 'object',
    required: ['id', 'criterion', 'verification', 'priority'],
    properties: {
      id: { type: 'string' },
      criterion: { type: 'string' },
      verification: { type: 'string' },
      priority: { enum: ['MUST', 'SHOULD', 'NICE'] },
    },
  },
};

const SPEC_SCHEMA = {
  type: 'object',
  required: ['problem', 'decisions', 'acceptanceCriteria', 'specFileWritten'],
  properties: {
    problem: { type: 'string' },
    goals: { type: 'array', items: { type: 'string' } },
    nonGoals: { type: 'array', items: { type: 'string' } },
    decisions: { type: 'string' },
    acceptanceCriteria: CRITERIA,
    specFileWritten: { type: 'string' },
  },
};
```

In `PLAN_SCHEMA`, replace the whole inline `acceptanceCriteria: { ... }` object with:

```js
    acceptanceCriteria: CRITERIA,
```

- [ ] **Step 2: Add `formatCriteria` and `specPrompt`; extend `planPrompt`**

Below the `// ---------- prompt builders ----------` `RULES` block, add:

```js
/** @param {Array<{id: string, criterion: string, verification: string, priority: string}>} criteria */
function formatCriteria(criteria) {
  return (criteria || [])
    .map((c) => `- [${c.priority}] ${c.id}: ${c.criterion} (verify: ${c.verification})`)
    .join('\n');
}

function specPrompt() {
  const specPath = SPEC_PATH
    || 'docs/moonshot/specs/<YYYY-MM-DD>-<short-kebab-slug>-spec.md — derive the date with `date +%F` and the slug from the task';
  return `${RULES}

You are the SPEC WRITER. Explore the codebase enough to understand the task in context, then produce a spec:
- problem: what is wrong or missing, in this codebase's terms.
- goals / nonGoals: bullet lists; nonGoals fence the scope.
- decisions: the chosen approach and why, including rejected alternatives.
- acceptanceCriteria: testable checks, each with a verification method and a MUST/SHOULD/NICE priority. The MUSTs define "done".

Write the same content as a Markdown document to ${specPath} inside the workdir (create directories as needed), and report that path as specFileWritten. Do NOT implement anything — spec and file only.

TASK:
${TASK}`;
}
```

Replace `planPrompt` with (signature gains `specText`; the sole call site is updated in Step 3):

```js
/**
 * @param {boolean} debug
 * @param {string | null} specText
 */
function planPrompt(debug, specText) {
  const specBlock = specText
    ? `\nAPPROVED SPEC (plan against it; adopt its acceptance criteria verbatim, same ids, unless one is untestable):\n${specText}\n\nAlso write your plan as a Markdown document to ${PLAN_PATH || "docs/moonshot/plans/<YYYY-MM-DD>-<slug>-plan.md — match the spec file's date and slug"} inside the workdir (create directories as needed), linking back to the spec file.\n`
    : '';
  return `${RULES}

You are the ${debug ? 'INVESTIGATOR' : 'PLANNER'}. Produce exactly ONE concrete plan — no options, no "we could", no phased deferral. ${debug
    ? 'Identify the root cause(s) and EVERY location in the codebase that shares the same defect (scan for the pattern). The fix plan must cover all of them plus a regression test.'
    : 'Explore only enough to plan; do NOT implement anything.'}
Output acceptance criteria as testable checks, each with a verification method and a MUST/SHOULD/NICE priority. The MUSTs define "done". Keep the plan under ~2500 characters.
${specBlock}
TASK:
${TASK}`;
}
```

- [ ] **Step 3: Rewrite the plan-phase block**

Replace the current block:

```js
let planText = null;
if (plan.plan) {
  phase('Plan');
  const p = await agent(planPrompt(plan.debug), {
    label: plan.debug ? 'investigate' : 'plan', phase: 'Plan', schema: PLAN_SCHEMA,
  });
  if (p) {
    planText = `${p.plan}\n\nAcceptance criteria:\n${(p.acceptanceCriteria || [])
      .map((/** @type {{id: string, criterion: string, verification: string, priority: string}} */ c) =>
        `- [${c.priority}] ${c.id}: ${c.criterion} (verify: ${c.verification})`)
      .join('\n')}`;
  }
}
```

with:

```js
let planText = null;
if (PRE_PLAN) {
  // Interactive formal path: spec and plan were brainstormed with the user pre-flight.
  planText = PRE_SPEC ? `SPEC:\n${PRE_SPEC}\n\nPLAN:\n${PRE_PLAN}` : PRE_PLAN;
  log(`Using pre-approved plan${PLAN_PATH ? ` (${PLAN_PATH})` : ''}`);
} else if (plan.plan) {
  phase('Plan');
  /** @type {string | null} */
  let specHeader = null;
  /** @type {string | null} */
  let specText = null;
  if (plan.formal && AUTO) {
    const s = await agent(specPrompt(), { label: 'spec', phase: 'Plan', schema: SPEC_SCHEMA });
    if (s) {
      specHeader = `PROBLEM:\n${s.problem}\n\nDESIGN DECISIONS:\n${s.decisions}`;
      specText = `${specHeader}\n\nAcceptance criteria:\n${formatCriteria(s.acceptanceCriteria)}`;
      log(`Spec written: ${s.specFileWritten}`);
    }
    // ponytail: spec-writer death degrades to today's plain planner, same as planner death.
  }
  const p = await agent(planPrompt(plan.debug, specText), {
    label: plan.debug ? 'investigate' : 'plan', phase: 'Plan', schema: PLAN_SCHEMA,
  });
  if (p) {
    // Planner adopts the spec's criteria, so they appear once, from p.
    planText = `${specHeader ? `${specHeader}\n\nPLAN:\n` : ''}${p.plan}\n\nAcceptance criteria:\n${formatCriteria(p.acceptanceCriteria)}`;
  } else if (specText) {
    planText = specText; // planner died; the spec alone still guides implementer and validators
  }
}
```

- [ ] **Step 4: Verify**

Run: `npm test && npm run typecheck`
Expected: all tests PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add moonshot/skills/moonshot/moonshot.js
git commit -m "feat: three-way plan phase — pre-approved plan, --auto spec-writer, or plain planner

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: SKILL.md pre-flight — classify, brainstorm, spec/plan gates, doc writing

**Files:**
- Modify: `moonshot/skills/moonshot/SKILL.md`

**Interfaces:**
- Consumes: workflow args from Tasks 2–3 (`classification`, `spec`, `plan`, `specPath`, `planPath`, `auto`).
- Produces: the user-facing `/moonshot` behavior; no code interfaces.

- [ ] **Step 1: Update the frontmatter description**

Replace the `description:` line's final sentence fragment `supports --pr to open a pull request.` with:

```
supports --pr to open a pull request and --auto to skip the interactive spec/plan gates.
```

- [ ] **Step 2: Replace the `## Steps` section**

Replace the entire `## Steps` section (keep current steps 1–2 content verbatim where noted) with:

````markdown
## Steps

1. **Parse the argument.** From the user's input extract the task reference and flags (`--pr`, `--base <branch>`, `--auto`).

2. **Resolve the task text.** (unchanged — keep the existing step 2 bullet list and failure rule verbatim)

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
   - Ask clarifying questions ONE at a time — purpose, constraints, success criteria; prefer multiple choice. Stop when you can state the design (2–6 questions is typical).
   - If there is a genuine fork in the road, propose 2–3 approaches with trade-offs and a recommendation.
   - Draft the **spec** in the conversation: Problem, Goals, Non-goals, Design decisions (chosen approach and why, including rejected alternatives), Acceptance criteria — each line `- [MUST|SHOULD|NICE] AC-n: <criterion> (verify: <how>)`; the MUSTs define "done". Ask the user to approve; revise until approved.
   - Draft the **plan**: ordered implementation steps, files affected per step, a verification check per step. Ask the user to approve; revise until approved.
   - If the user abandons, stop. Nothing has been created — no worktree, no files, no workflow run.

6. **Decide workdir + PR mode.** (unchanged — keep the existing default/`--pr` worktree instructions verbatim)

7. **Write the documents (formal only).** Compute `<date>` with `date +%F` and a short kebab-case `<slug>` from the task. Paths, relative to `workdir`:
   - spec: `docs/moonshot/specs/<date>-<slug>-spec.md`
   - plan: `docs/moonshot/plans/<date>-<slug>-plan.md`

   If a path already exists, append `-2`, `-3`, … to the slug. Then:
   - Interactive: write the approved spec and plan to those paths (create directories as needed). Do not commit — in `--pr` mode the workflow's pusher commits them with the work; otherwise the user commits them with their review.
   - `--auto`: do NOT write files; just compute and pass the paths — the workflow's spec-writer and planner agents write them.

8. **Run the workflow.** Call the Workflow tool on `moonshot.js` in this skill's base directory:
   `Workflow({ scriptPath: "<skill-base-dir>/moonshot.js", args: { task, workdir, pr, base, classification, spec, plan, specPath, planPath, auto } })`
   Omit fields you do not have: `classification` when step 3 failed; `spec` and `plan` (the approved document contents, as strings) only on the interactive formal path; `specPath`/`planPath` only when formal; `auto: true` only when `--auto` was given.

9. **Report the result** returned by the workflow, in this order:
   - Classification (complexity / taskType), whether it came from pre-flight or in-workflow, and the route taken.
   - Whether it was **approved**, and in how many iterations.
   - If not approved: the outstanding rejections (validator, severity, message) so the user can decide next steps.
   - The implementation summary.
   - For formal runs: the spec and plan document paths.
   - If `--pr`: the PR url/number and the verification result. If the push was blocked, surface `blockedReason`.
   - In `--pr` mode, remind the user the work is in the worktree `../moonshot-<slug>` on branch `moonshot/<slug>`.
````

- [ ] **Step 3: Add a Notes bullet**

Append to the `## Notes` section:

```markdown
- Formal runs (STANDARD/CRITICAL TASK) follow a superpowers-style brainstorm → spec → plan → implement process: interactive gates by default, agent-written documents with `--auto`. The spec's acceptance criteria are what the blind validators enforce.
```

- [ ] **Step 4: Verify**

Run: `npm test && npm run typecheck`
Expected: PASS (SKILL.md is prose; this catches accidental damage elsewhere).

- [ ] **Step 5: Commit**

```bash
git add moonshot/skills/moonshot/SKILL.md
git commit -m "feat: formal brainstorm→spec→plan pre-flight in /moonshot skill

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Documentation — README, CLAUDE.md, SMOKE.md

**Files:**
- Modify: `README.md` (Usage section)
- Modify: `CLAUDE.md` (Architecture section, points 1–2)
- Modify: `SMOKE.md`

**Interfaces:** none — prose only.

- [ ] **Step 1: README usage**

Change the usage line to:

```
/moonshot <issue-reference | file-path | inline text> [--pr] [--base <branch>] [--auto]
```

After the examples list, add:

```markdown
STANDARD/CRITICAL tasks follow a formal brainstorm → spec → plan → implement process
(inspired by [superpowers](https://github.com/obra/superpowers)): by default moonshot
brainstorms with you, then writes `docs/moonshot/specs/<date>-<slug>-spec.md` and
`docs/moonshot/plans/<date>-<slug>-plan.md` into the target repo for your approval
before implementing. `--auto` skips the dialogue — agents write both documents and
proceed. The spec's acceptance criteria are what the blind validators enforce.
Trivial/simple/debug tasks keep the fast path with no document overhead.
```

And add one example after the existing `--pr --base develop` example:

```markdown
- `/moonshot 123 --auto --pr` — no interactive gates: agents write the spec and plan docs, implement, and ship a PR.
```

- [ ] **Step 2: CLAUDE.md architecture blurb**

In point 1 (Skill), after "refuses tasks without verifiable done-criteria," insert: "classifies pre-flight and, for STANDARD/CRITICAL tasks, runs an interactive brainstorm → spec → plan dialogue (skipped by `--auto`) whose approved documents pass into the workflow,". In point 2 (Workflow script), append this sentence after "…maps that to run shape (plan?, which validators, max iterations);": "Formal routes accept pre-approved `spec`/`plan` args (skipping the planner) or, with `auto`, run a spec-writer agent that writes `docs/moonshot/specs/…` before planning."

- [ ] **Step 3: SMOKE.md pending rows**

Append:

```markdown

# Pending (2026-07-08 formal spec→plan workflow)

- Formal interactive path: not yet run — needs a STANDARD task plus a user dialogue
  (brainstorm → approve spec → approve plan → workflow skips classify+plan agents).
- Formal `--auto` path: not yet run — expect spec-writer + planner agents to write
  `docs/moonshot/specs/` and `docs/moonshot/plans/` files in the workdir.
```

- [ ] **Step 4: Verify and commit**

Run: `npm test && npm run typecheck`
Expected: PASS.

```bash
git add README.md CLAUDE.md SMOKE.md
git commit -m "docs: document formal spec→plan process and --auto flag

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
