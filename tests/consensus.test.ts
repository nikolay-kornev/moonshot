// tests/consensus.test.ts
import { test } from 'node:test';
import assert from 'node:assert';
import { evaluate } from '../lib/consensus.ts';

test('all approve → approved, no rejections', () => {
  const r = evaluate([
    { validator: 'requirements', approved: true, errors: [] },
    { validator: 'code', approved: true },
  ]);
  assert.equal(r.approved, true);
  assert.equal(r.rejections.length, 0);
});

test('one rejects → not approved; rejection carries validator + error fields', () => {
  const r = evaluate([
    { validator: 'requirements', approved: true },
    { validator: 'code', approved: false, errors: [{ severity: 'MUST', message: 'missing test', evidence: 'no test file' }] },
  ]);
  assert.equal(r.approved, false);
  assert.deepEqual(r.rejections, [
    { validator: 'code', severity: 'MUST', message: 'missing test', evidence: 'no test file' },
  ]);
});

test('empty input → not approved (caller must skip evaluate on the 0-validator path)', () => {
  assert.equal(evaluate([]).approved, false);
});

test('null entries (skipped/dead subagents) are ignored', () => {
  const r = evaluate([null, { validator: 'generic', approved: true }]);
  assert.equal(r.approved, true);
});

test('a rejecter with no errors array still blocks approval', () => {
  const r = evaluate([{ validator: 'generic', approved: false }]);
  assert.equal(r.approved, false);
  assert.equal(r.rejections.length, 0);
});
