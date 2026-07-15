# Per-Stage Model & Effort Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users pick a model and reasoning effort per moonshot workflow stage via an optional `.claude/moonshot/config.json`, forwarded by the skill as `args.models` / `args.effort`.

**Architecture:** The skill reads and validates the config pre-flight (main session, fail-soft) and passes two flat maps in the Workflow args. `moonshot.js` gains a `tune(stage)` helper that spreads `{model, effort}` into every `agent()` call's opts. No routing/consensus changes, so the `lib/` mirrors are untouched.

**Tech Stack:** Plain JS (Workflow dialect) + `// @ts-check`, Node built-in test runner, Markdown skill/docs.

**Spec:** `docs/superpowers/specs/2026-07-14-per-stage-model-config-design.md`

## Global Constraints

- `moonshot.js` must stay plain JavaScript (Workflow runtime strips no types) and must keep passing `// @ts-check` via `npm run typecheck`.
- Do NOT touch `lib/routing.ts`, `lib/consensus.ts`, or their inline mirrors in `moonshot.js` — this feature does not affect them.
- Stage keys (exact): `classify`, `spec`, `plan`, `implement`, `validate`, `ship`.
- Model aliases (exact): `haiku`, `sonnet`, `opus`, `fable`. Effort values (exact): `low`, `medium`, `high`, `xhigh`, `max`.
- Fail-soft everywhere: missing/malformed config or invalid values are warned about and dropped, never a hard stop.
- Tests: `npm test` (all files) and `npm run typecheck` must pass after every task.

---

### Task 1: `tune()` in moonshot.js + source-level test

**Files:**
- Modify: `moonshot/skills/moonshot/moonshot.js` (const block ~line 29; all 8 `agent()` call sites)
- Test: `tests/workflow-syntax.test.ts`

**Interfaces:**
- Consumes: `ARGS` (already parsed at top of `moonshot.js`).
- Produces: `tune(stage: string) => {model?: string, effort?: string}` used at every `agent()` call site; `args.models` / `args.effort` become part of the workflow's accepted args (Task 2 forwards them).

- [ ] **Step 1: Write the failing test**

Append to `tests/workflow-syntax.test.ts`:

```ts
test('every agent() call site carries a tune() spread (per-stage model/effort config)', () => {
  const calls = (SRC.match(/\bagent\(/g) || []).length;
  const tuned = (SRC.match(/\.\.\.tune\(/g) || []).length;
  assert.ok(calls >= 8, `expected at least 8 agent() call sites, found ${calls}`);
  assert.strictEqual(tuned, calls, 'every agent() call must spread ...tune(<stage>)');
  const STAGES = ['classify', 'spec', 'plan', 'implement', 'validate', 'ship'];
  for (const m of SRC.matchAll(/\.\.\.tune\('(\w+)'\)/g)) {
    assert.ok(STAGES.includes(m[1]), `unknown tune() stage: ${m[1]}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/workflow-syntax.test.ts`
Expected: FAIL — `tuned` is 0, `calls` is 8, `strictEqual` throws.

- [ ] **Step 3: Implement `tune()` and spread it at all 8 call sites**

In `moonshot/skills/moonshot/moonshot.js`, insert directly after the line `if (!TASK) throw new Error('moonshot: args.task is required');`:

```js
// Per-stage model/effort overrides (see README "Configuration"); non-string values ignored.
const MODELS = ARGS?.models || {};
const EFFORT = ARGS?.effort || {};
/** @param {string} stage */
const tune = (stage) => ({
  ...(typeof MODELS[stage] === 'string' && { model: MODELS[stage] }),
  ...(typeof EFFORT[stage] === 'string' && { effort: EFFORT[stage] }),
});
```

Also update the args comment on line 14 to:

```js
// args: { task, workdir, pr, base, classification?, spec?, plan?, specPath?, planPath?, auto?, models?, effort? }
```

Then edit each `agent()` call's opts object (8 sites, stage mapping per spec — `implement` covers the INQUIRY answerer, `ship` covers verify-pr):

1. classify: `{ label: 'classify', phase: 'Classify', schema: CLASSIFY_SCHEMA, ...tune('classify') }`
2. inquiry: `{ label: 'inquiry', phase: 'Implement', ...tune('implement') }`
3. spec-writer: `{ label: 'spec', phase: 'Plan', schema: SPEC_SCHEMA, ...tune('spec') }`
4. planner: `{ label: plan.debug ? 'investigate' : 'plan', phase: 'Plan', schema: PLAN_SCHEMA, ...tune('plan') }`
5. implementer: `` { label: `implement#${i}`, phase: 'Implement', schema: WORK_SCHEMA, ...tune('implement') } ``
6. validator: `` { label: `validate:${role}#${i}`, phase: 'Validate', schema: VALIDATE_SCHEMA, ...tune('validate') } ``
7. git-pusher: `{ label: 'git-pusher', phase: 'Ship', schema: PUSH_SCHEMA, ...tune('ship') }`
8. verify-pr: `{ label: 'verify-pr', phase: 'Ship', ...tune('ship') }`

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/workflow-syntax.test.ts && npm run typecheck && npm test`
Expected: all PASS (typecheck confirms the spreads are valid under `@ts-check`).

- [ ] **Step 5: Commit**

```bash
git add moonshot/skills/moonshot/moonshot.js tests/workflow-syntax.test.ts
git commit -m "feat: per-stage model/effort overrides via args.models/args.effort"
```

---

### Task 2: SKILL.md pre-flight config read

**Files:**
- Modify: `moonshot/skills/moonshot/SKILL.md` (step 8, "Run the workflow")

**Interfaces:**
- Consumes: `.claude/moonshot/config.json` (user-authored, optional).
- Produces: validated `models` / `effort` objects passed in Workflow args, matching `tune()`'s stage keys from Task 1.

- [ ] **Step 1: Rewrite step 8 of SKILL.md**

Replace the current step 8 body with:

```markdown
8. **Read config + run the workflow.** If `.claude/moonshot/config.json` exists at the current repo root (`git rev-parse --show-toplevel` — the original repo, not a worktree), read it and take its `models` and `effort` objects. Drop, and tell the user about, any entry that fails validation: stage key not in {`classify`, `spec`, `plan`, `implement`, `validate`, `ship`}, `models` value not in {`haiku`, `sonnet`, `opus`, `fable`}, `effort` value not in {`low`, `medium`, `high`, `xhigh`, `max`}. If the file is unreadable or not valid JSON, warn and proceed without it — never a hard stop.

   Call the Workflow tool on `moonshot.js` in this skill's base directory:
   `Workflow({ scriptPath: "<skill-base-dir>/moonshot.js", args: { task, workdir, pr, base, classification, spec, plan, specPath, planPath, auto, models, effort } })`
   Omit fields you do not have: `classification` when step 3 failed; `spec` and `plan` (the approved document contents, as strings) only on the interactive formal path; `specPath`/`planPath` only when formal; `auto: true` only when `--auto` was given; `models`/`effort` only when the config file provided surviving entries.
```

(Keep the step number `8.` — no renumbering.)

- [ ] **Step 2: Verify**

Run: `npm test && npm run typecheck`
Expected: PASS (no code touched; confirms nothing broke). Proofread the diff: `git diff moonshot/skills/moonshot/SKILL.md` — only step 8 changed.

- [ ] **Step 3: Commit**

```bash
git add moonshot/skills/moonshot/SKILL.md
git commit -m "feat: skill reads .claude/moonshot/config.json pre-flight (models/effort)"
```

---

### Task 3: Docs + version bump

**Files:**
- Modify: `README.md` (new `## Configuration` section after `## Usage`, before `## Specs and plans`)
- Modify: `CLAUDE.md` (one line in Architecture item 2)
- Modify: `moonshot/.claude-plugin/plugin.json` (version `0.3.1` → `0.4.0`)

**Interfaces:**
- Consumes: the config contract from Tasks 1–2 (stage keys, aliases, fail-soft rule).
- Produces: user-facing documentation only.

- [ ] **Step 1: Add README section**

Insert before the `## Specs and plans` heading:

````markdown
## Configuration

Optional `.claude/moonshot/config.json` in your repo picks the model and reasoning effort per workflow stage. No file (or a missing key) = that stage inherits the session model/effort.

```json
{
  "models": {
    "classify": "haiku",
    "plan": "opus",
    "implement": "sonnet",
    "validate": "sonnet"
  },
  "effort": {
    "plan": "high",
    "validate": "high"
  }
}
```

Stages: `classify`, `spec` (the `--auto` spec-writer), `plan` (planner/investigator), `implement` (implementer/fixer), `validate` (all validator roles), `ship` (git-pusher + PR verify). Models: `haiku` | `sonnet` | `opus` | `fable`. Effort: `low` | `medium` | `high` | `xhigh` | `max`. Invalid entries are dropped with a warning; a malformed file is ignored with a warning.

`.claude/moonshot/` is self-gitignoring — to commit the config for your team, add `!config.json` to `.claude/moonshot/.gitignore`.
````

- [ ] **Step 2: Add CLAUDE.md line**

In Architecture item 2 (the workflow-script paragraph), append this sentence at the end:

```markdown
Optional per-stage `args.models`/`args.effort` (read by the skill from `.claude/moonshot/config.json`) override each `agent()` call's model/effort via the `tune()` helper.
```

- [ ] **Step 3: Bump plugin version**

In `moonshot/.claude-plugin/plugin.json`: `"version": "0.3.1"` → `"version": "0.4.0"`.

- [ ] **Step 4: Verify**

Run: `npm test && npm run typecheck`
Expected: PASS. `python3 -c "import json; json.load(open('moonshot/.claude-plugin/plugin.json'))"` exits 0.

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md moonshot/.claude-plugin/plugin.json
git commit -m "docs: document per-stage model/effort config (0.4.0)"
```
