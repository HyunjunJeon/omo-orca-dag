import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DagPane } from '../src/controller.mjs';
import { createOrca, orcaSession, quote, shellCommand } from '../src/orca.mjs';
import { writeJson } from '../src/storage.mjs';
import { payload, sessionId } from './fixtures.mjs';
import { fakeOrca } from './orca-cli.mjs';

const posix = { skip: process.platform === 'win32' && 'the fake Orca CLI is a shebang script' };
const worktree = 'repo-1::/work/project';

test('POSIX shell command preserves apostrophes and shell metacharacters', posix, () => {
  // Given literal shell-sensitive argv, including an empty value.
  const args = ['/opt/node path/node', "/tmp/owner's/viewer.mjs", '$HOME; & `echo`', ''];
  // When the builder targets a POSIX shell, execute its actual quoting in Bash.
  const command = shellCommand(args, 'linux');
  const output = execFileSync('bash', ['-c', `printf '%s${String.fromCharCode(92)}0' ${command}`], { encoding: 'utf8', timeout: 10000 });
  // Then the quoting contract and literal argv survive.
  assert.equal(command, args.map(quote).join(' '));
  assert.deepEqual(output.split(String.fromCharCode(0)).slice(0, -1), args);
});

test('orcaSession requires an Orca terminal, its handle and worktree, and a resolvable CLI', posix, async t => {
  const { dir, bin } = await fakeOrca(t);
  const env = { TERM_PROGRAM: 'Orca', ORCA_TERMINAL_HANDLE: 'term_parent', ORCA_WORKTREE_ID: worktree, PATH: dir };
  assert.equal(orcaSession(env), true);
  assert.equal(orcaSession({ ...env, TERM_PROGRAM: 'tmux' }), false);
  assert.equal(orcaSession({ ...env, ORCA_TERMINAL_HANDLE: '' }), false);
  assert.equal(orcaSession({ ...env, ORCA_WORKTREE_ID: '' }), false);
  assert.equal(orcaSession({ ...env, PATH: '' }), false);
  assert.equal(orcaSession({ ...env, PATH: '', ORCA_CLI_COMMAND: bin }), true);
  assert.equal(orcaSession({ ...env, ORCA_CLI_COMMAND: join(dir, 'missing') }), false);
  // Inside a Herdr pane the upstream omo-herdr-dag owns the viewer.
  assert.equal(orcaSession({ ...env, HERDR_ENV: '1' }), false);
});

test('Orca adapter runs pane operations through the Orca CLI', posix, async t => {
  const { bin, calls } = await fakeOrca(t);
  const orca = createOrca({ ORCA_CLI_COMMAND: bin, ORCA_WORKTREE_ID: worktree });
  assert.equal(await orca('split', 'term_parent'), 'term_view1');
  assert.equal(await orca('run', 'term_view1', "'node' 'viewer.mjs'"), undefined);
  assert.equal(await orca('get', 'term_view1'), 'term_view1');
  assert.deepEqual(await orca('list'), [
    { handle: 'term_parent', tabId: 'tab1', title: 'OmO' },
    { handle: 'term_leftover', tabId: 'tab1', title: 'OmO DAG' },
    { handle: 'term_elsewhere', tabId: 'tab2', title: 'OmO DAG' },
  ]);
  await assert.rejects(orca('get', 'term_stale1'), /terminal_handle_stale/);
  await assert.rejects(orca('get', 'term_closed1'), /terminal_not_found/);
  await orca('focus', 'term_parent');
  await orca('close', 'term_view1');
  await assert.rejects(orca('resize', 'term_view1'), /Unsupported Orca pane operation: resize/);
  assert.deepEqual(await calls(), [
    ['terminal', 'split', '--terminal', 'term_parent', '--direction', 'horizontal', '--json'],
    ['terminal', 'send', '--terminal', 'term_view1', '--text', "'node' 'viewer.mjs'", '--enter', '--json'],
    ['terminal', 'show', '--terminal', 'term_view1', '--json'],
    ['terminal', 'list', '--worktree', `id:${worktree}`, '--json'],
    ['terminal', 'show', '--terminal', 'term_stale1', '--json'],
    ['terminal', 'show', '--terminal', 'term_closed1', '--json'],
    ['terminal', 'focus', '--terminal', 'term_parent', '--json'],
    ['terminal', 'close', '--terminal', 'term_view1', '--json'],
  ]);
});

test('closing its own Orca pane does not wait for the CLI that the pane teardown would kill', posix, async t => {
  const { bin, waitFor } = await fakeOrca(t);
  const orca = createOrca({ ORCA_CLI_COMMAND: bin, ORCA_WORKTREE_ID: worktree, ORCA_TERMINAL_HANDLE: 'term_view1' });
  assert.equal(await orca('close', 'term_view1'), undefined);
  assert.deepEqual(await waitFor(calls => calls.length === 1), [['terminal', 'close', '--terminal', 'term_view1', '--json']]);
});

test('controller opens an Orca viewer beside the source pane and replaces stale and leftover panes', posix, async t => {
  const { bin, calls } = await fakeOrca(t);
  const stateDir = await mkdtemp(join(tmpdir(), 'omo-orca-dag-'));
  const controller = new DagPane({ sessionId, parentPane: 'term_parent', scope: `orca:${worktree}`, stateDir,
    cwd: stateDir, node: '/usr/bin/node', viewer: '/tmp/viewer.mjs', taskStateDir: join(stateDir, 'tasks'),
    panes: createOrca({ ORCA_CLI_COMMAND: bin, ORCA_WORKTREE_ID: worktree }),
    viewerArgs: ['--return-focus', 'term_parent'] });
  t.after(async () => { await controller.stop(); await rm(stateDir, { recursive: true, force: true }); });
  await controller.receive(payload());
  const opened = await calls();
  // Only DAG viewers in the source pane's tab are closed; the source pane and other tabs are untouched.
  assert.deepEqual(opened.filter(call => call[1] === 'close').map(call => call[3]), ['term_leftover']);
  assert.deepEqual(opened.find(call => call[1] === 'split'), ['terminal', 'split', '--terminal', 'term_parent', '--direction', 'horizontal', '--json']);
  const send = opened.find(call => call[1] === 'send');
  assert.equal(send[3], 'term_view1');
  assert.ok(send[5].endsWith("'--close-pane' 'term_view1' '--return-focus' 'term_parent'"), send[5]);
  // A pane closed with q, and a handle from a previous Orca runtime, both reopen on /dag-pane.
  for (const [paneId, splits] of [['term_closed1', 2], ['term_stale1', 3]]) {
    await writeJson(controller.recordFile, { paneId, ready: true });
    await controller.open();
    const reopened = await calls();
    assert.equal(reopened.filter(call => call[1] === 'split').length, splits);
    assert.equal(reopened.at(-1)[3], `term_view${splits}`);
  }
});
