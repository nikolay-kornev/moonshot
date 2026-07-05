export const meta = {
  name: 'zeroshot',
  description: 'Autonomous plan → implement → validate → iterate → ship multi-agent workflow',
  phases: [
    { title: 'Classify' },
    { title: 'Plan' },
    { title: 'Implement' },
    { title: 'Validate' },
    { title: 'Ship' },
  ],
};

// args: { task, workdir, pr, base }
const TASK = args?.task;
const WORKDIR = args?.workdir || '.';
const WANT_PR = !!args?.pr;
const BASE = args?.base || 'main';
if (!TASK) throw new Error('zeroshot: args.task is required');

// ---------- schemas ----------
const CLASSIFY_SCHEMA = {
  type: 'object',
  required: ['complexity', 'taskType', 'reasoning'],
  properties: {
    complexity: { enum: ['TRIVIAL', 'SIMPLE', 'STANDARD', 'CRITICAL'] },
    taskType: { enum: ['INQUIRY', 'TASK', 'DEBUG'] },
    reasoning: { type: 'string' },
  },
};

const PLAN_SCHEMA = {
  type: 'object',
  required: ['plan', 'acceptanceCriteria'],
  properties: {
    plan: { type: 'string' },
    filesAffected: { type: 'array', items: { type: 'string' } },
    acceptanceCriteria: {
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
    },
  },
};

const WORK_SCHEMA = {
  type: 'object',
  required: ['summary', 'canValidate'],
  properties: {
    summary: { type: 'string' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    canValidate: { type: 'boolean' },
    blockers: { type: 'array', items: { type: 'string' } },
  },
};

const VALIDATE_SCHEMA = {
  type: 'object',
  required: ['approved', 'errors'],
  properties: {
    approved: { type: 'boolean' },
    summary: { type: 'string' },
    errors: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'message'],
        properties: {
          severity: { enum: ['MUST', 'SHOULD', 'NICE'] },
          message: { type: 'string' },
          evidence: { type: 'string' },
        },
      },
    },
    evidence: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        exitCode: { type: 'number' },
        output: { type: 'string' },
      },
    },
  },
};

const PUSH_SCHEMA = {
  type: 'object',
  required: ['pushed'],
  properties: {
    pushed: { type: 'boolean' },
    prUrl: { type: 'string' },
    prNumber: { type: 'number' },
    blocked: { type: 'boolean' },
    blockedReason: { type: 'string' },
  },
};

// ---------- routing (ponytail: mirror of lib/routing.js — keep in sync) ----------
function route(complexity, taskType) {
  if (taskType === 'DEBUG' && complexity !== 'TRIVIAL') {
    return { plan: true, debug: true, validators: ['tester'], maxIterations: 10 };
  }
  switch (complexity) {
    case 'TRIVIAL': return { plan: false, debug: false, validators: [], maxIterations: 1 };
    case 'SIMPLE': return { plan: false, debug: false, validators: ['generic'], maxIterations: 3 };
    case 'STANDARD': return { plan: true, debug: false, validators: ['requirements', 'code'], maxIterations: 5 };
    case 'CRITICAL': return { plan: true, debug: false, validators: ['requirements', 'code', 'security', 'tester'], maxIterations: 5 };
    default: return { plan: true, debug: false, validators: ['requirements', 'code'], maxIterations: 5 };
  }
}

// ---------- consensus (ponytail: mirror of lib/consensus.js — keep in sync) ----------
function evaluate(results) {
  const responded = results.filter(Boolean);
  const approved = responded.length > 0 && responded.every((r) => r.approved === true);
  const rejections = responded
    .filter((r) => r.approved !== true)
    .flatMap((r) => (r.errors || []).map((e) => ({ validator: r.validator, ...e })));
  return { approved, rejections };
}

// ---------- prompt builders ----------
const RULES = `You are ONE agent in an autonomous, non-interactive multi-agent workflow.
NEVER ask questions or use AskUserQuestion — make the safer autonomous decision and proceed.
Work ONLY inside this directory (use absolute paths under it): ${WORKDIR}
Your final message MUST be the requested structured output and nothing else.`;

function classifyPrompt() {
  return `${RULES}

Classify the task on two axes. Bias AWAY from higher complexity — most real tasks are SIMPLE or STANDARD. Reserve CRITICAL for auth, payments, security, data integrity, or irreversible operations.

COMPLEXITY:
- TRIVIAL: one file, mechanical (typo, rename, constant).
- SIMPLE: one concern, few files.
- STANDARD: multi-file feature or refactor.
- CRITICAL: security / payments / data-integrity / irreversible.

TASKTYPE:
- INQUIRY: a read-only question; no code changes.
- TASK: build or change something.
- DEBUG: fix broken behavior.

TASK:
${TASK}`;
}

function planPrompt(debug) {
  return `${RULES}

You are the ${debug ? 'INVESTIGATOR' : 'PLANNER'}. Produce exactly ONE concrete plan — no options, no "we could", no phased deferral. ${debug
    ? 'Identify the root cause(s) and EVERY location in the codebase that shares the same defect (scan for the pattern). The fix plan must cover all of them plus a regression test.'
    : 'Explore only enough to plan; do NOT implement anything.'}
Output acceptance criteria as testable checks, each with a verification method and a MUST/SHOULD/NICE priority. The MUSTs define "done". Keep the plan under ~2500 characters.

TASK:
${TASK}`;
}

function workPrompt(planText, rejections, debug) {
  const role = debug
    ? `You are the FIXER. Fix the ROOT CAUSE, not the symptom. Fix ALL locations that share the defect. Add a regression test that FAILS against the old code and passes against your fix.`
    : `You are the IMPLEMENTER. Do the actual work NOW — do not merely report status. Implement the FULL scope: no deferral, no "phase 2", no TODO/placeholder. Handle errors by failing fast, never by swallowing them.`;
  const planBlock = planText ? `\nPLAN & ACCEPTANCE CRITERIA:\n${planText}\n` : '';
  const fixBlock = rejections && rejections.length
    ? `\nYOUR PREVIOUS ATTEMPT WAS REJECTED. Read each finding and fix the root cause — do not band-aid:\n${rejections
        .map((r) => `- [${r.severity}] (${r.validator}) ${r.message}${r.evidence ? ` — ${r.evidence}` : ''}`)
        .join('\n')}\n`
    : '';
  return `${RULES}

${role}

TASK:
${TASK}
${planBlock}${fixBlock}
Set canValidate=false ONLY if a hard blocker prevents any validation (report it in blockers). Otherwise implement fully and set canValidate=true.`;
}

const VALIDATOR_FOCUS = {
  generic: 'Verify the task is fully and correctly implemented and actually works.',
  requirements: 'Verify EVERY acceptance criterion is met. Any unmet MUST criterion = reject.',
  code: 'Verify code quality: no TODO/FIXME/placeholder, no swallowed errors, no dead flexibility or speculative abstraction, no backwards-compat shim added without reason, no symptom-only fix where the pattern repeats.',
  security: 'Verify security: injection, authz/authn, secrets committed to code, input validation at trust boundaries, information leakage in errors/logs.',
  tester: 'RUN it. Execute the code and/or its tests and capture REAL output. "Tests look correct" is NOT acceptable — behavioral evidence only. Try to break it with edge cases and error paths.',
};

function validatePrompt(role, planText) {
  return `${RULES}

You are a BLIND validator (role: ${role}). You did NOT write this code; verify it independently against the task.

VERIFICATION PROTOCOL (mandatory):
- NEVER claim something is missing without FIRST searching for it (Grep/Glob/Read). The implementer may have used different files or names than planned.
- Focus for your role: ${VALIDATOR_FOCUS[role] || VALIDATOR_FOCUS.generic}
- If you run a command, capture the exact command, its exit code, and its output as evidence.
- Reject on: any unmet MUST criterion, TODO/FIXME/placeholder, silent error swallowing, deferred work ("will add later"), or symptom-only fixes.

TASK:
${TASK}
${planText ? `\nPLAN & ACCEPTANCE CRITERIA:\n${planText}\n` : ''}
Approve ONLY if every MUST is satisfied with evidence. Otherwise set approved=false with specific, actionable errors.`;
}

function pushPrompt() {
  return `${RULES}

ALL VALIDATORS APPROVED. You are TRANSPORT-ONLY: do NOT edit files, resolve conflicts, or debug CI. If the working tree needs code changes, set pushed=false, blocked=true, and give a reason.

Run these in order inside ${WORKDIR}:
1. git add -A
2. git commit -m "<concise message describing the change>"
3. git push -u origin HEAD
4. gh pr create --base ${BASE} --fill
Then report the PR url and number. Set pushed=true only if BOTH the push and PR creation succeeded.`;
}

// ---------- orchestration ----------
await (async () => {
  phase('Classify');
  const cls = await agent(classifyPrompt(), { label: 'classify', phase: 'Classify', schema: CLASSIFY_SCHEMA });
  if (!cls) throw new Error('classification failed');
  log(`Classified: ${cls.complexity} / ${cls.taskType} — ${cls.reasoning}`);

  // INQUIRY: read-only answer, no implement/validate loop.
  if (cls.taskType === 'INQUIRY') {
    phase('Implement');
    const answer = await agent(
      `${RULES}\n\nAnswer this read-only question. Investigate the code as needed; do NOT modify files.\n\n${TASK}`,
      { label: 'inquiry', phase: 'Implement' },
    );
    return { mode: 'inquiry', classification: cls, answer };
  }

  const plan = route(cls.complexity, cls.taskType);
  log(`Route: plan=${plan.plan} validators=[${plan.validators}] maxIter=${plan.maxIterations} debug=${plan.debug}`);

  let planText = null;
  if (plan.plan) {
    phase('Plan');
    const p = await agent(planPrompt(plan.debug), {
      label: plan.debug ? 'investigate' : 'plan', phase: 'Plan', schema: PLAN_SCHEMA,
    });
    if (p) {
      planText = `${p.plan}\n\nAcceptance criteria:\n${(p.acceptanceCriteria || [])
        .map((c) => `- [${c.priority}] ${c.id}: ${c.criterion} (verify: ${c.verification})`)
        .join('\n')}`;
    }
  }

  let rejections = [];
  let approved = false;
  let lastSummary = null;
  let iterationsUsed = 0;

  for (let i = 1; i <= plan.maxIterations; i++) {
    iterationsUsed = i;
    phase('Implement');
    const work = await agent(workPrompt(planText, rejections, plan.debug), {
      label: `implement#${i}`, phase: 'Implement', schema: WORK_SCHEMA,
    });
    if (!work) throw new Error(`implementer died on iteration ${i}`);
    lastSummary = work.summary;

    // Trivial path: no validators configured → accept the single worker pass.
    if (plan.validators.length === 0) { approved = true; break; }

    // Worker self-reported it cannot be validated yet → loop with its blockers as findings.
    if (work.canValidate === false) {
      rejections = (work.blockers || []).map((b) => ({ validator: 'self', severity: 'MUST', message: b }));
      log(`iter ${i}: worker blocked — ${rejections.map((r) => r.message).join('; ')}`);
      continue;
    }

    phase('Validate');
    const results = await parallel(
      plan.validators.map((role) => () =>
        agent(validatePrompt(role, planText), { label: `validate:${role}#${i}`, phase: 'Validate', schema: VALIDATE_SCHEMA })
          .then((v) => (v ? { validator: role, ...v } : null)),
      ),
    );
    const verdict = evaluate(results);
    if (verdict.approved) { approved = true; log(`iter ${i}: all ${plan.validators.length} validators approved`); break; }
    rejections = verdict.rejections;
    log(`iter ${i}: rejected — ${rejections.length} findings`);
  }

  const result = {
    classification: cls,
    route: plan,
    approved,
    iterationsUsed,
    summary: lastSummary,
    rejections: approved ? [] : rejections,
  };

  if (!approved) { log(`NOT approved within ${plan.maxIterations} iterations`); return result; }

  if (WANT_PR) {
    phase('Ship');
    const push = await agent(pushPrompt(), { label: 'git-pusher', phase: 'Ship', schema: PUSH_SCHEMA });
    if (push && push.pushed && push.prNumber) {
      // Anti-hallucination: confirm the PR actually exists.
      const prVerification = await agent(
        `${RULES}\n\nRun: gh pr view ${push.prNumber} --json number,url,state\nReport whether the PR exists and its state. Do NOT create anything.`,
        { label: 'verify-pr', phase: 'Ship' },
      );
      result.push = push;
      result.prVerification = prVerification;
    } else {
      result.push = push || { pushed: false, blocked: true, blockedReason: 'pusher returned no result' };
    }
  }

  return result;
})();
