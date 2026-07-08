# Smoke results (2026-07-05, live e2e via Workflow scriptPath)

- Unit suite: 23/23 pass (`npm test`).
- Guard stdin contract: `git reset --hard` → deny JSON; inert without `MOONSHOT_GUARD=1`. Pass.
  (Note: arm the env var on the *hook* process — `printf ... | MOONSHOT_GUARD=1 python3 ...`;
  prefixing the whole pipeline sets it only on `printf`.)
- TRIVIAL path: classified TRIVIAL/TASK, route `validators=[] maxIter=1`, approved in 1
  iteration, `hello.txt` created with `hello`. Pass (2 agents).
- SIMPLE path: classified SIMPLE/TASK, route `validators=[generic] maxIter=3`, blind validator
  approved on iteration 1; `greet.sh` + `test_greet.sh` verified manually (greeting exit 0,
  no-arg usage exit 1, suite passes). Pass (3 agents). Reject-loop not exercised (first pass
  approved — allowed by plan).
- PR path: not run (no GitHub remote).

Fixes that came out of smoke testing:
1. `args` may arrive as a JSON-encoded string → workflow now parses string args.
2. Classifier agent created the target file itself during the TRIVIAL run → classify prompt now
   declares the agent read-only.

# Pending (2026-07-08 formal spec→plan workflow)

- Formal interactive path: not yet run — needs a STANDARD task plus a user dialogue
  (brainstorm → approve spec → approve plan → workflow skips classify+plan agents).

# Smoke results (2026-07-08, formal `--auto` path, live e2e via Workflow scriptPath)

- Formal `--auto` path: pre-classified STANDARD/TASK (classify agent skipped — 5 agents
  total: spec, plan, implement, 2 validators), route `formal=true validators=[requirements,code]
  maxIter=5`, approved in 1 iteration. Task: 3-file Node todo CLI in a scratch repo.
  Spec (7.3K, 6 MUSTs) and plan (3.4K, links back to spec) written at the pinned
  `docs/moonshot/specs|plans/` paths by the agents. Verified independently by controller:
  `node --test test.js` exit 0, add/list/done work manually, invalid command → usage on
  stderr + exit 1. Pass. Planner-death degradation edge not exercised (both agents lived).
