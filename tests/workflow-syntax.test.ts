// tests/workflow-syntax.test.ts
// The workflow script is written in the Claude Code Workflow dialect: the runtime
// evaluates it inside an async function scope (top-level `await` and `return` are
// valid), so plain `node --check` cannot parse it. Mirror the runtime instead.
// It must stay plain JavaScript — the Workflow runtime does not strip types.
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(
  join(import.meta.dirname, '..', 'moonshot', 'skills', 'moonshot', 'moonshot.js'),
  'utf8',
);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

test('parses in the Workflow runtime dialect (async scope, top-level return)', () => {
  const body = SRC.replace(/^export /m, '');
  assert.doesNotThrow(
    () => new AsyncFunction('args', 'agent', 'parallel', 'pipeline', 'phase', 'log', 'budget', 'workflow', body),
  );
});

test('orchestration body is top-level — an IIFE would swallow the workflow return value', () => {
  assert.ok(!SRC.includes('(async () =>'), 'body must not be wrapped in an IIFE');
  assert.match(SRC, /^return result;$/m, 'must end with a top-level `return result;`');
});
