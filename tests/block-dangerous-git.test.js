const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');

function run(command, guard = '1') {
  const res = spawnSync('python3', ['moonshot/hooks/block-dangerous-git.py'], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    env: { ...process.env, MOONSHOT_GUARD: guard },
    encoding: 'utf8',
  });
  return res.stdout.trim();
}

test('blocks git reset --hard', () => {
  assert.match(run('git reset --hard HEAD'), /"permissionDecision": "deny"/);
});

test('blocks force push (--force and -f)', () => {
  assert.match(run('git push origin main --force'), /deny/);
  assert.match(run('git push -f origin main'), /deny/);
});

test('blocks git clean -fd', () => {
  assert.match(run('git clean -fd'), /deny/);
});

test('blocks git stash', () => {
  assert.match(run('git stash'), /deny/);
});

test('blocks destructive checkout', () => {
  assert.match(run('git checkout -- .'), /deny/);
  assert.match(run('git checkout -f'), /deny/);
});

test('blocks force branch delete (-D)', () => {
  assert.match(run('git branch -D feature'), /deny/);
});

test('allows a normal commit', () => {
  assert.equal(run('git commit -m "add feature"'), '');
});

test('allows safe branch delete (-d)', () => {
  assert.equal(run('git branch -d feature'), '');
});

test('allows non-git bash', () => {
  assert.equal(run('rm -rf node_modules'), '');
});

test('inert when MOONSHOT_GUARD is not 1', () => {
  assert.equal(run('git reset --hard', '0'), '');
});
