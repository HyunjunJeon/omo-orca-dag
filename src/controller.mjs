import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { readJson, writeJson } from './storage.mjs';
import { pruneExpiredSnapshots, retentionDaysFromEnv } from './retention.mjs';
import { shellCommand } from './orca.mjs';
import { normalizeRun, sessionRuns } from './model.mjs';
import { t, languageOf } from './i18n.mjs';
import { TaskData } from './task-data.mjs';

export function viewKey(scope, pane, session) {
  return createHash('sha256').update(JSON.stringify([scope, pane, session])).digest('hex').slice(0, 24);
}

// The viewer sets this title on its own pane (Orca's `terminal rename` would retitle the whole tab).
export function isDagViewerPane(terminal) {
  return terminal?.title === 'OmO DAG';
}

function missingPane(error) {
  return /terminal_handle_stale|terminal_not_found|terminal_exited/i.test(`${error.message} ${error.stderr ?? ''}`);
}

export class DagPane {
  constructor({ sessionId, parentPane, scope, stateDir, cwd, node, viewer, panes, viewerArgs = [], notify = () => {}, language = 'en', taskStateDir, retentionDays, streamDelay = 250 }) {
    // `panes` runs pane operations through the Orca CLI (src/orca.mjs).
    Object.assign(this, { sessionId, parentPane, stateDir, cwd, node, viewer, panes, viewerArgs, notify });
    this.language = languageOf(language);
    this.key = viewKey(scope, parentPane, sessionId);
    this.stateFile = join(stateDir, `${this.key}.json`);
    this.recordFile = join(stateDir, `${this.key}.pane.json`);
    this.checkpointDir = join(taskStateDir ?? join(cwd, '.omo', 'senpi-task'), 'dag', 'runs');
    // Explicit option wins so tests need not mutate the shared process environment.
    this.retentionDays = retentionDays ?? retentionDaysFromEnv();
    this.streamDelay = streamDelay;
    this.queue = Promise.resolve();
    this.runs = [];
    this.stopped = false;
    this.tasks = [];
    this.streams = new Map();
    this.taskData = new TaskData({ cwd, sessionId, stateDir: taskStateDir, notify,
      onChange: () => { if (!this.stopped) this.enqueue(() => this.save(true)); } });
  }

  enqueue(job) {
    const result = this.queue.then(job);
    this.queue = result.catch(error => this.notify(`DAG pane: ${error.message}`));
    return result;
  }

  receive(payload) {
    const runs = sessionRuns(payload, this.sessionId, this.language);
    if (runs === null || this.stopped) return Promise.resolve();
    return this.enqueue(async () => {
      // RPC replaces transient runs; durable runs omitted by a snapshot remain recoverable.
      await this.restoreRuns(runs, true);
      await this.save(true);
    });
  }

  start() {
    return this.enqueue(async () => {
      // Housekeeping precedes restore so a fresh pane never lists pruned snapshots.
      await pruneExpiredSnapshots(this.stateDir, {
        keepFiles: [basename(this.stateFile), basename(this.recordFile), `${basename(this.stateFile)}.view.json`],
        days: this.retentionDays, notify: message => this.notify(t(this.language, 'pruneFailed', { error: message })) });
      const state = await readJson(this.stateFile);
      if (state?.sessionId === this.sessionId) {
        this.runs = state.runs ?? [];
        this.taskData.restore(state.tasks);
      }
      this.taskData.start();
      await this.restoreRuns();
      await this.save(true);
    });
  }

  receiveTasks(payload) {
    if (this.stopped) return Promise.resolve();
    return this.enqueue(async () => {
      await this.taskData.refresh(this.runs);
      if (this.taskData.receive(payload)) await this.save(true);
    });
  }

  // Streamed tokens arrive far more often than task records change; coalesce
  // them and rewrite the snapshot without rescanning the task store. The
  // returned promise settles after the coalesced save, so tests need no sleeps.
  // `since` marks when the current phase began and `lastAt` the latest event,
  // so the viewer clock can show elapsed waits and gaps between tokens.
  receiveStream(update) {
    if (this.stopped) return Promise.resolve();
    if (update.active) {
      const previous = this.streams.get(update.taskId);
      const samePhase = previous?.phase === update.phase && previous.tool === update.tool;
      this.streams.set(update.taskId, { phase: update.phase,
        ...(update.tool ? { tool: update.tool } : {}), ...(update.text ? { text: update.text } : {}),
        ...(update.attempt ? { attempt: update.attempt } : {}), ...(update.maxAttempts ? { maxAttempts: update.maxAttempts } : {}),
        since: samePhase ? previous.since : update.now, lastAt: update.now });
    } else if (!this.streams.delete(update.taskId)) return Promise.resolve();
    if (this.streamTimer) return this.streamFlush;
    this.streamFlush = new Promise(resolve => {
      this.streamTimer = setTimeout(() => {
        this.streamTimer = undefined;
        this.enqueue(() => this.save(true, false)).then(resolve, resolve);
      }, this.streamDelay);
      this.streamTimer.unref?.();
    });
    return this.streamFlush;
  }

  withStreams(tasks, connected) {
    if (!connected || !this.streams.size) return tasks;
    return tasks.map(task => {
      // A finished task never regains a stale activity from a late event.
      if (task.status !== 'running') { this.streams.delete(task.id); return task; }
      const activity = this.streams.get(task.id);
      return activity ? { ...task, activity } : task;
    });
  }

  async restoreRuns(runs = this.runs, preferLive = false) {
    let files;
    try { files = await readdir(this.checkpointDir); }
    catch (error) { if (error.code !== 'ENOENT') throw error; files = []; }
    const restored = new Map(runs.map(run => [run.id, run]));
    for (const file of files.filter(file => file.endsWith('.json'))) {
      try {
        const raw = await readJson(join(this.checkpointDir, file));
        if (raw === null) continue; // A checkpoint may disappear after readdir.
        if (typeof raw.parentSessionId !== 'string' || raw.schemaVersion !== 1) throw new Error('Invalid checkpoint header');
        if (raw.parentSessionId !== this.sessionId) continue;
        const run = normalizeRun(raw);
        if (!run) throw new Error('Invalid checkpoint run');
        // Startup/open distrust cached state; an incoming RPC may be ahead of disk.
        if (!preferLive || !restored.has(run.id)) restored.set(run.id, run);
      } catch (error) { this.notify(`DAG pane: Cannot read checkpoint ${file}: ${error.message}`); }
    }
    this.runs = [...restored.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async save(connected, refresh = true) {
    if (refresh) this.tasks = await this.taskData.refresh(this.runs);
    await writeJson(this.stateFile, { version: 1, sessionId: this.sessionId, connected, language: this.language,
      updatedAt: new Date().toISOString(), runs: this.runs, tasks: this.withStreams(this.tasks, connected) });
    // All callers serialize saves through the queue, including task-only disk changes.
    if (connected && !this.stopped && (this.runs.length || this.tasks.length)) await this.ensure(false);
  }

  open() {
    return this.enqueue(async () => {
      if (!this.runs.length) {
        const state = await readJson(this.stateFile);
        if (state?.sessionId === this.sessionId) {
          this.runs = state.runs ?? [];
          this.taskData.restore(state.tasks);
        }
      }
      await this.restoreRuns();
      await this.save(true);
      return this.ensure(true);
    });
  }

  async listDagPanes() {
    try {
      const terminals = (await this.panes('list')) ?? [];
      const tab = terminals.find(terminal => terminal.handle === this.parentPane)?.tabId;
      return terminals.filter(isDagViewerPane)
        .filter(terminal => terminal.handle && terminal.handle !== this.parentPane && (!tab || terminal.tabId === tab))
        .map(terminal => terminal.handle);
    } catch (error) {
      if (error instanceof Error) return [];
      throw error;
    }
  }

  async closePane(paneId) {
    try { await this.panes('close', paneId); }
    catch (error) {
      if (!missingPane(error)) this.notify(t(this.language, 'closeFailed', { error: error.message }));
    }
  }

  async closeDagPanes(keep) {
    for (const paneId of await this.listDagPanes()) {
      if (paneId !== keep) await this.closePane(paneId);
    }
  }

  async ensure(force) {
    const record = await readJson(this.recordFile);
    // Preserve a manually closed pane across events/reloads. /dag-pane explicitly reopens it.
    if (record && !force) return record.paneId;
    if (record?.paneId) {
      try {
        await this.panes('get', record.paneId);
        if (record.ready) {
          await this.closeDagPanes(record.paneId);
          return record.paneId;
        }
        // Occupied leftover from a failed launch: close it, then replace.
        await this.closePane(record.paneId);
      } catch (error) {
        if (!missingPane(error)) throw error;
      }
    }
    if (typeof this.node === 'function') this.node = await this.node();
    // Record an attempt before mutation: a timeout must not create repeated orphan panes.
    await writeJson(this.recordFile, { attempted: true });
    await this.closeDagPanes();
    const paneId = await this.panes('split', this.parentPane);
    if (!paneId) throw new Error(t(this.language, 'missingPaneId'));
    await writeJson(this.recordFile, { paneId, ready: false });
    await this.panes('run', paneId, shellCommand([this.node, this.viewer, '--state', this.stateFile, '--close-pane', paneId, ...this.viewerArgs]));
    await writeJson(this.recordFile, { paneId, ready: true });
    return paneId;
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.streamTimer);
    this.streams.clear();
    this.taskData.stop();
    return this.enqueue(() => this.save(false));
  }
}
