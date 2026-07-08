// lib/routing.ts
// Canonical routing. Mirrored inline (as plain JS) in moonshot/skills/moonshot/moonshot.js
// (Workflow scripts are self-contained plain JavaScript and cannot import modules).

export const COMPLEXITY = ['TRIVIAL', 'SIMPLE', 'STANDARD', 'CRITICAL'] as const;
export const TASK_TYPES = ['INQUIRY', 'TASK', 'DEBUG'] as const;

export type Complexity = (typeof COMPLEXITY)[number];
export type TaskType = (typeof TASK_TYPES)[number];

export interface Route {
  plan: boolean;
  debug: boolean;
  formal: boolean;
  validators: string[];
  maxIterations: number;
}

export function route(complexity: Complexity, taskType: TaskType): Route {
  // Runtime guards stay: values arrive from a classifier agent, not typed callers.
  if (!COMPLEXITY.includes(complexity)) throw new Error(`Unknown complexity: ${complexity}`);
  if (!TASK_TYPES.includes(taskType)) throw new Error(`Unknown taskType: ${taskType}`);

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
}
