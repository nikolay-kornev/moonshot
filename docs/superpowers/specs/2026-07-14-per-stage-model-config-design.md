# Per-Stage Model & Effort Config — Design

**Date:** 2026-07-14
**Status:** Approved

## Problem

Every moonshot subagent inherits the session model and effort. Users want to
pick models per stage — e.g. a cheap classifier, a top-tier planner, a
mid-tier implementer — without editing the plugin.

## Design

### Config file

Optional `.claude/moonshot/config.json` in the target repo. Absence = today's
behavior (every stage inherits the session model/effort).

```json
{
  "models": {
    "classify": "haiku",
    "spec": "opus",
    "plan": "opus",
    "implement": "sonnet",
    "validate": "sonnet",
    "ship": "haiku"
  },
  "effort": {
    "plan": "high",
    "validate": "high"
  }
}
```

- Six stage keys, matching the workflow's agent roles: `classify`, `spec`
  (the `--auto` spec-writer), `plan` (planner/investigator), `implement`
  (implementer/fixer, and the INQUIRY answerer), `validate` (all validator
  roles), `ship` (git-pusher + PR verify).
- All keys optional; unknown stage keys ignored.
- `models` values: Workflow runtime aliases `haiku` | `sonnet` | `opus` | `fable`.
- `effort` values: `low` | `medium` | `high` | `xhigh` | `max`.

### Skill (SKILL.md)

One pre-flight step: if `.claude/moonshot/config.json` exists in the target
repo, read it, drop any entry whose value is not a known alias/effort (warn
the user which were dropped), and pass the surviving `models` and `effort`
maps in the Workflow args.

### Workflow (moonshot.js)

```js
const MODELS = ARGS?.models || {};
const EFFORT = ARGS?.effort || {};
/** @param {string} stage */
const tune = (stage) => ({
  ...(MODELS[stage] && { model: MODELS[stage] }),
  ...(EFFORT[stage] && { effort: EFFORT[stage] }),
});
```

Each `agent()` call spreads `...tune('<stage>')` into its opts. As a
belt-and-braces guard (args can arrive from non-skill callers), `tune`
values are only forwarded if they are strings.

No change to `lib/routing.ts` / `lib/consensus.ts` — models/effort don't
touch routing or consensus, so no duplicated-logic burden.

### Error handling

- Malformed or unreadable config JSON → skill warns and proceeds without it.
- Invalid alias/effort value → filtered pre-flight with a warning
  (fail-soft, matching the plugin's "mid-workflow, a safe default beats a
  crash" philosophy).

### Testing

- `tests/workflow-syntax.test.ts` (or a sibling source-level test): assert
  every `agent(` call site in `moonshot.js` passes a `tune(` spread — keeps
  future stages from silently missing the config.
- The alias/effort validation rule lives in SKILL.md prose (skill-executed,
  not code), so no unit test; the documented allowed values are the contract.

### Docs

- README: short "Configuration" section with the example file.
- CLAUDE.md: one line noting `args.models` / `args.effort`.

## Non-goals

Per-validator-role models, CLI flag overrides (`--plan-model`), any other
config keys (iteration caps, validator sets, default flags) — add when asked.
