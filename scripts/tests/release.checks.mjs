import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'wisp-release-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'scripts'));
  mkdirSync(join(dir, 'bin'));
  copyFileSync(resolve('scripts/release.sh'), join(dir, 'scripts/release.sh'));
  for (const file of ['manifest.json', 'package.json', 'package-lock.json']) {
    writeFileSync(join(dir, file), JSON.stringify({ version: '1.0.6', packages: { '': { version: '1.0.6' } } }));
  }
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  git('init', '-b', 'dev');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Release Test');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'tag.gpgsign', 'false');
  git('add', '.');
  git('commit', '-m', 'initial');
  const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  const mock = (name, body) => writeFileSync(join(dir, 'bin', name), '#!/bin/bash\nset -eu\n' + body, { mode: 0o755 });
  mock('git', `case "$1" in
ls-remote) exit "\${REMOTE_FAILURE:-0}";;
push) echo "git $*" >> "$RELEASE_LOG"; exit 0;;
*) exec '${realGit}' "$@";;
esac\n`);
  mock('gh', 'echo "gh $*" >> "$RELEASE_LOG"\n');
  mock('npm', 'echo "npm $*" >> "$RELEASE_LOG"\nif [[ "$*" == "run test" && "${FAIL_TEST:-0}" == 1 ]]; then exit 1; fi\n');
  writeFileSync(join(dir, 'change.txt'), 'include this pending change');
  const log = join(dir, 'commands.log');
  writeFileSync(join(dir, '.gitignore'), 'bin/\ncommands.log\n');
  const run = (args, env = {}) => spawnSync('bash', ['scripts/release.sh', ...args], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, WISP_GITHUB_REPO: 'test/wisp', RELEASE_LOG: log, ...env }
  });
  return { dir, git, run, log: () => readFileSync(log, 'utf8') };
}

test('updates versions, validates, commits pending changes and publishes branch and tag', t => {
  const f = fixture(t);
  const result = f.run(['1.0.7']);
  assert.equal(result.status, 0, result.stderr);
  for (const path of ['manifest.json', 'package.json', 'package-lock.json']) {
    assert.equal(JSON.parse(readFileSync(join(f.dir, path))).version, '1.0.7');
  }
  assert.equal(JSON.parse(readFileSync(join(f.dir, 'package-lock.json'))).packages[''].version, '1.0.7');
  assert.equal(f.git('log', '-1', '--format=%s'), 'chore: release 1.0.7');
  assert.equal(f.git('show', 'HEAD:change.txt'), 'include this pending change');
  assert.equal(f.git('rev-list', '-n', '1', '1.0.7'), f.git('rev-parse', 'HEAD'));
  assert.equal(f.git('status', '--porcelain'), '');
  assert.match(f.log(), /npm ci\nnpm run lint\nnpm run typecheck\nnpm run test\nnpm run build/);
  assert.match(f.log(), /git push --atomic origin HEAD:refs\/heads\/dev refs\/tags\/1.0.7/);
  assert.match(f.log(), /gh release create 1.0.7 main.js manifest.json styles.css .*--verify-tag/);
});

test('failed validation leaves edits without committing, tagging or publishing', t => {
  const f = fixture(t);
  assert.notEqual(f.run(['1.0.7'], { FAIL_TEST: '1' }).status, 0);
  assert.equal(f.git('log', '-1', '--format=%s'), 'initial');
  assert.equal(f.git('tag'), '');
  assert.doesNotMatch(f.log(), /git push|gh release create/);
  assert.equal(f.run(['1.0.7']).status, 0, 'retry after fixing validation should succeed');
});

test('invalid version, existing tag and remote errors stop before version edits', t => {
  const f = fixture(t);
  for (const args of [[], ['v1.0.7'], ['01.0.7'], ['1.0.5'], ['1.0.7', 'extra']]) {
    assert.notEqual(f.run(args).status, 0);
  }
  assert.notEqual(f.run(['1.0.7'], { REMOTE_FAILURE: '128' }).status, 0);
  f.git('tag', '1.0.7');
  assert.notEqual(f.run(['1.0.7']).status, 0);
  assert.equal(JSON.parse(readFileSync(join(f.dir, 'manifest.json'))).version, '1.0.6');
  assert.equal(f.git('log', '-1', '--format=%s'), 'initial');
  assert.doesNotMatch(f.log(), /npm ci|git push|gh release create/);
});
