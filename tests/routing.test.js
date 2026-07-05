// tests/routing.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { route } = require('../lib/routing');

test('TRIVIAL TASK → 1 worker, no validators, 1 iteration', () => {
  assert.deepEqual(route('TRIVIAL', 'TASK'), {
    plan: false, debug: false, validators: [], maxIterations: 1,
  });
});

test('SIMPLE → one generic validator, loop 3', () => {
  const r = route('SIMPLE', 'TASK');
  assert.deepEqual(r.validators, ['generic']);
  assert.equal(r.plan, false);
  assert.equal(r.maxIterations, 3);
});

test('STANDARD → planner + requirements+code validators, loop 5', () => {
  const r = route('STANDARD', 'TASK');
  assert.equal(r.plan, true);
  assert.deepEqual(r.validators, ['requirements', 'code']);
  assert.equal(r.maxIterations, 5);
});

test('CRITICAL → planner + 4 validators', () => {
  assert.deepEqual(route('CRITICAL', 'TASK').validators, ['requirements', 'code', 'security', 'tester']);
});

test('DEBUG at non-trivial complexity → debug loop, tester only, 10 iterations', () => {
  const r = route('STANDARD', 'DEBUG');
  assert.equal(r.debug, true);
  assert.equal(r.maxIterations, 10);
  assert.deepEqual(r.validators, ['tester']);
});

test('DEBUG at TRIVIAL falls through to trivial (no debug loop)', () => {
  assert.equal(route('TRIVIAL', 'DEBUG').debug, false);
  assert.equal(route('TRIVIAL', 'DEBUG').validators.length, 0);
});

test('unknown complexity throws', () => {
  assert.throws(() => route('WAT', 'TASK'));
});

test('unknown taskType throws', () => {
  assert.throws(() => route('SIMPLE', 'NOPE'));
});
