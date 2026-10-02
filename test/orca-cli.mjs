import { chmodSync, watch } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// A real executable standing in for the Orca 1.4 CLI: it logs argv and answers with Orca's JSON shapes.
// Handles starting with `term_stale` fail like a handle from a previous Orca runtime; `term_closed`
// handles answer like a pane that was closed, which Orca still reports as an orphaned record.
export async function fakeOrca(t) {
  const dir = await mkdtemp(join(tmpdir(), 'orca-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const log = join(dir, 'calls.jsonl');
  const bin = join(dir, 'orca');
  await writeFile(bin, `#!${process.execPath}
const { appendFileSync, existsSync, readFileSync } = require('node:fs');
const log = ${JSON.stringify(log)};
const args = process.argv.slice(2);
const splits = existsSync(log) ? readFileSync(log, 'utf8').split('\\n').filter(line => line.includes('"split"')).length : 0;
appendFileSync(log, JSON.stringify(args) + '\\n');
const handle = args[args.indexOf('--terminal') + 1];
const reply = result => console.log(JSON.stringify({ ok: true, result }));
if (args.includes('--terminal') && handle.startsWith('term_stale')) {
  console.log(JSON.stringify({ ok: false, error: { code: 'terminal_handle_stale', message: 'terminal_handle_stale' } }));
  process.exit(1);
}
switch (args[1]) {
  case 'split': reply({ split: { handle: 'term_view' + (splits + 1), tabId: 'tab1' } }); break;
  case 'send': reply({ send: { handle, accepted: true } }); break;
  case 'show': reply({ terminal: handle.startsWith('term_closed')
    ? { handle, tabId: 'tab1', orphaned: true, connected: false, exitCause: { kind: 'operator_close' } }
    : { handle, tabId: 'tab1', orphaned: false, connected: true } }); break;
  case 'list': reply({ terminals: [
    { handle: 'term_parent', tabId: 'tab1', title: 'OmO' },
    { handle: 'term_leftover', tabId: 'tab1', title: 'OmO DAG' },
    { handle: 'term_elsewhere', tabId: 'tab2', title: 'OmO DAG' },
  ] }); break;
  default: reply({ [args[1]]: { handle } });
}
`);
  chmodSync(bin, 0o755);
  const calls = async () => {
    try { return (await readFile(log, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line)); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  };
  // Resolves on the log write that satisfies the predicate; the watcher starts before the first check.
  function waitFor(predicate, timeout = 5000) {
    return new Promise((resolve, reject) => {
      let done = false, queue = Promise.resolve();
      const finish = (error, value) => {
        if (done) return;
        done = true; clearTimeout(timer); watcher.close();
        if (error) reject(error); else resolve(value);
      };
      const check = () => {
        queue = queue.then(async () => {
          const current = await calls();
          if (predicate(current)) finish(null, current);
        }).catch(finish);
      };
      const watcher = watch(dir, check);
      watcher.on('error', finish);
      const timer = setTimeout(async () => finish(new Error(
        `Orca CLI calls did not match within ${timeout}ms: ${JSON.stringify(await calls())}`)), timeout);
      check();
    });
  }
  return { dir, bin, calls, waitFor };
}
