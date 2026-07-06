// tests/workflow-syntax.test.js
// The workflow script is written in the Claude Code Workflow dialect: the runtime
// evaluates it inside an async function scope (top-level `await` and `return` are
// valid), so plain `node --check` cannot parse it. Mirror the runtime instead.
const { test } = require('node:test');
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const SRC = readFileSync(
  join(__dirname, '..', 'moonshot', 'skills', 'moonshot', 'moonshot.js'),
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
