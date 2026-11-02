const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const script = path.resolve(__dirname, '../提交代码.command');

function run(cwd, command, args) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
  // The fixture launches its own real test runner, outside this test's context.
  delete env.NODE_TEST_CONTEXT;
  return spawnSync(command, args, {
    cwd, encoding: 'utf8', timeout: 30000,
    env,
  });
}

function git(cwd, ...args) {
  const result = run(cwd, 'git', args);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'baige-submit-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const main = path.join(root, '本地 main');
  const agent = path.join(root, 'Codex 工作区');
  fs.mkdirSync(main);
  git(main, 'init', '-b', 'main');
  git(main, 'config', 'user.name', 'Workflow test');
  git(main, 'config', 'user.email', 'test@example.invalid');
  // An inaccessible remote proves this workflow needs no network access.
  git(main, 'remote', 'add', 'origin', '/nonexistent/remote');
  fs.mkdirSync(path.join(main, 'tests'));
  fs.copyFileSync(script, path.join(main, '提交代码.command'));
  fs.writeFileSync(path.join(main, 'tests/smoke.test.cjs'), "require('node:test')('smoke', () => {});\n");
  fs.writeFileSync(path.join(main, 'shared.txt'), 'original\n');
  git(main, 'add', '.');
  git(main, 'commit', '-m', 'initial');
  git(main, 'worktree', 'add', '-b', 'agent/codex', agent);
  return { main, agent, execute: () => run(agent, '/bin/bash', [path.join(agent, '提交代码.command')]) };
}

test('commits agent changes, integrates local main, tests, then fast-forwards main; clean rerun succeeds', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.main, 'from-main.txt'), 'main update\n');
  git(f.main, 'add', '.');
  git(f.main, 'commit', '-m', 'main update');
  fs.writeFileSync(path.join(f.agent, 'from-agent.txt'), 'agent update\n');
  const result = f.execute();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(git(f.main, 'rev-parse', 'HEAD'), git(f.agent, 'rev-parse', 'HEAD'));
  assert.equal(fs.readFileSync(path.join(f.main, 'from-agent.txt'), 'utf8'), 'agent update\n');
  assert.equal(fs.readFileSync(path.join(f.agent, 'from-main.txt'), 'utf8'), 'main update\n');
  assert.equal(git(f.main, 'status', '--porcelain'), '');
  assert.equal(git(f.agent, 'status', '--porcelain'), '');
  assert.equal(f.execute().status, 0);
});

test('failed tests retain agent commit and leave main unchanged', (t) => {
  const f = fixture(t);
  const before = git(f.main, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(f.agent, 'tests/smoke.test.cjs'), "require('node:test')('failure', () => { throw Error('intentional'); });\n");
  const result = f.execute();
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.equal(git(f.main, 'rev-parse', 'HEAD'), before);
  assert.notEqual(git(f.agent, 'rev-parse', 'HEAD'), before);
  assert.equal(git(f.agent, 'status', '--porcelain'), '');
});

test('dirty main refuses before committing agent changes', (t) => {
  const f = fixture(t);
  const before = git(f.agent, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(f.main, 'shared.txt'), 'unsaved main\n');
  fs.writeFileSync(path.join(f.agent, 'new.txt'), 'keep this\n');
  const result = f.execute();
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /main.*未提交/);
  assert.equal(git(f.agent, 'rev-parse', 'HEAD'), before);
  assert.equal(fs.readFileSync(path.join(f.main, 'shared.txt'), 'utf8'), 'unsaved main\n');
  assert.ok(git(f.agent, 'status', '--porcelain').includes('new.txt'));
});

test('merge conflict stops with conflict intact and main unchanged', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.main, 'shared.txt'), 'main version\n');
  git(f.main, 'add', '.');
  git(f.main, 'commit', '-m', 'main conflicting change');
  const before = git(f.main, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(f.agent, 'shared.txt'), 'agent version\n');
  const result = f.execute();
  assert.notEqual(result.status, 0);
  assert.equal(git(f.main, 'rev-parse', 'HEAD'), before);
  assert.ok(git(f.agent, 'ls-files', '-u'));
  // Running again must not commit unresolved merge markers.
  const agentBefore = git(f.agent, 'rev-parse', 'HEAD');
  assert.notEqual(f.execute().status, 0);
  assert.equal(git(f.agent, 'rev-parse', 'HEAD'), agentBefore);
});

test('refuses a different branch', (t) => {
  const f = fixture(t);
  git(f.agent, 'switch', '-c', 'other');
  fs.writeFileSync(path.join(f.agent, 'new.txt'), 'keep this\n');
  const before = git(f.agent, 'rev-parse', 'HEAD');
  assert.notEqual(f.execute().status, 0);
  assert.equal(git(f.agent, 'rev-parse', 'HEAD'), before);
  assert.equal(git(f.agent, 'branch', '--show-current'), 'other');
});

test('a second invocation refuses an existing submission lock', (t) => {
  const f = fixture(t);
  const lock = path.join(f.main, '.git/baige-submit.lock');
  fs.mkdirSync(lock);
  const result = f.execute();
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /正在执行|锁/);
  assert.ok(fs.existsSync(lock), 'must not remove another invocation’s lock');
});
