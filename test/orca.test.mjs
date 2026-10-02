import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DagPane } from '../src/controller.mjs';
import { createOrca, orcaSession } from '../src/orca.mjs';
import { writeJson } from '../src/storage.mjs';
import { payload, sessionId } from './fixtures.mjs';
import { fakeOrca } from './orca-cli.mjs';

const posix = { skip: process.platform === 'win32' && 'the fake Orca CLI is a shebang script' };
const worktree = 'repo-1::/work/project';

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
});

test('Orca adapter translates pane operations into Orca CLI calls', posix, async t => {
  const { bin, calls } = await fakeOrca(t);
  const orca = createOrca({ ORCA_CLI_COMMAND: bin, ORCA_WORKTREE_ID: worktree });
  assert.deepEqual(await orca('split', '--pane', 'term_parent', '--direction', 'right', '--ratio', '0.65', '--cwd', '/work', '--no-focus'),
    { pane: { pane_id: 'term_view1' } });
  assert.deepEqual(await orca('rename', 'term_view1', 'DAG · test'), {});
  assert.deepEqual(await orca('run', 'term_view1', "'node' 'viewer.mjs'"), {});
  assert.deepEqual(await orca('get', 'term_view1'), { pane: { pane_id: 'term_view1' } });
  assert.deepEqual(await orca('list'), { panes: [
    { pane_id: 'term_parent', tab_id: 'tab1', terminal_title: 'OmO' },
    { pane_id: 'term_leftover', tab_id: 'tab1', terminal_title: 'OmO DAG' },
    { pane_id: 'term_elsewhere', tab_id: 'tab2', terminal_title: 'OmO DAG' },
  ] });
  await assert.rejects(orca('get', 'term_stale1'), /terminal_handle_stale/);
  await assert.rejects(orca('get', 'term_closed1'), /terminal_not_found/);
  await orca('focus', 'term_parent');
  await orca('close', 'term_view1');
  await assert.rejects(orca('resize', 'term_view1'), /Unsupported Orca pane operation: resize/);
  // Rename never reaches Orca: `terminal rename` would retitle the whole tab, including the OmO pane.
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
  assert.deepEqual(await orca('close', 'term_view1'), {});
  assert.deepEqual(await waitFor(calls => calls.length === 1), [['terminal', 'close', '--terminal', 'term_view1', '--json']]);
});

test('controller opens an Orca viewer beside the source pane and replaces stale and leftover panes', posix, async t => {
  const { bin, calls } = await fakeOrca(t);
  const stateDir = await mkdtemp(join(tmpdir(), 'omo-orca-dag-'));
  const controller = new DagPane({ sessionId, parentPane: 'term_parent', socket: `orca:${worktree}`, stateDir,
    cwd: stateDir, node: '/usr/bin/node', viewer: '/tmp/viewer.mjs', taskStateDir: join(stateDir, 'tasks'),
    herdr: createOrca({ ORCA_CLI_COMMAND: bin, ORCA_WORKTREE_ID: worktree }),
    viewerArgs: ['--backend', 'orca', '--return-focus', 'term_parent'] });
  t.after(async () => { await controller.stop(); await rm(stateDir, { recursive: true, force: true }); });
  await controller.receive(payload());
  const opened = await calls();
  // Only DAG viewers in the source pane's tab are closed; the source pane and other tabs are untouched.
  assert.deepEqual(opened.filter(call => call[1] === 'close').map(call => call[3]), ['term_leftover']);
  assert.deepEqual(opened.find(call => call[1] === 'split'), ['terminal', 'split', '--terminal', 'term_parent', '--direction', 'horizontal', '--json']);
  const send = opened.find(call => call[1] === 'send');
  assert.equal(send[3], 'term_view1');
  assert.ok(send[5].endsWith("'--close-pane' 'term_view1' '--backend' 'orca' '--return-focus' 'term_parent'"), send[5]);
  // A pane closed with q, and a handle from a previous Orca runtime, both reopen on /dag-pane.
  for (const [paneId, splits] of [['term_closed1', 2], ['term_stale1', 3]]) {
    await writeJson(controller.recordFile, { paneId, ready: true });
    await controller.open();
    const reopened = await calls();
    assert.equal(reopened.filter(call => call[1] === 'split').length, splits);
    assert.equal(reopened.at(-1)[3], `term_view${splits}`);
  }
});
