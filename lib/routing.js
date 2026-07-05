// lib/routing.js
// Canonical routing. Mirrored inline in .claude/workflows/zeroshot.js
// (Workflow scripts are self-contained and cannot require modules).

const COMPLEXITY = ['TRIVIAL', 'SIMPLE', 'STANDARD', 'CRITICAL'];
const TASK_TYPES = ['INQUIRY', 'TASK', 'DEBUG'];

function route(complexity, taskType) {
  if (!COMPLEXITY.includes(complexity)) throw new Error(`Unknown complexity: ${complexity}`);
  if (!TASK_TYPES.includes(taskType)) throw new Error(`Unknown taskType: ${taskType}`);

  // DEBUG at non-trivial complexity → investigate/fix/behavioral-test loop.
  if (taskType === 'DEBUG' && complexity !== 'TRIVIAL') {
    return { plan: true, debug: true, validators: ['tester'], maxIterations: 10 };
  }

  switch (complexity) {
    case 'TRIVIAL':
      return { plan: false, debug: false, validators: [], maxIterations: 1 };
    case 'SIMPLE':
      return { plan: false, debug: false, validators: ['generic'], maxIterations: 3 };
    case 'STANDARD':
      return { plan: true, debug: false, validators: ['requirements', 'code'], maxIterations: 5 };
    case 'CRITICAL':
      return {
        plan: true, debug: false,
        validators: ['requirements', 'code', 'security', 'tester'], maxIterations: 5,
      };
  }
}

module.exports = { route, COMPLEXITY, TASK_TYPES };
