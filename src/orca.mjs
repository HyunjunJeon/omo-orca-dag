import { execFile, spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);

function executableFile(path) {
  try { return statSync(path).isFile(); }
  catch { return false; }
}

// Orca exports ORCA_CLI_COMMAND for managed WSL sessions; its other terminals put `orca` on PATH.
export function resolveOrcaBin(env = process.env, platform = process.platform) {
  const name = env.ORCA_CLI_COMMAND?.trim() || (platform === 'win32' ? 'orca.exe' : 'orca');
  if (isAbsolute(name)) return executableFile(name) ? name : null;
  for (const dir of (env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, name);
    if (executableFile(candidate)) return candidate;
  }
  return null;
}

export function orcaSession(env = process.env) {
  // TERM_PROGRAM changes under a nested multiplexer, so an inherited handle alone is not a live Orca pane.
  if (env.TERM_PROGRAM !== 'Orca' || !env.ORCA_TERMINAL_HANDLE || !env.ORCA_WORKTREE_ID) return false;
  return Boolean(resolveOrcaBin(env));
}

// Translates the controller's pane operations (Herdr's `pane` vocabulary) into Orca terminal commands.
export function createOrca(env = process.env) {
  function cli() {
    const bin = resolveOrcaBin(env);
    if (!bin) throw new Error('Orca CLI is not available in this session');
    return bin;
  }
  async function orca(...args) {
    const bin = cli();
    let stdout;
    try { ({ stdout } = await execute(bin, [...args, '--json'], { env, timeout: 10000, maxBuffer: 4 * 1024 * 1024 })); }
    catch (error) {
      // Orca exits non-zero with its JSON error body on stdout.
      if (!error.stdout?.trim()) throw error;
      stdout = error.stdout;
    }
    const reply = JSON.parse(stdout);
    if (!reply.ok) throw new Error(`${reply.error?.code ?? 'orca_error'}: ${reply.error?.message ?? JSON.stringify(reply.error)}`);
    return reply.result;
  }
  return async (operation, ...args) => {
    const option = name => args[args.indexOf(name) + 1];
    switch (operation) {
      case 'split': {
        // Orca has no ratio, cwd, or no-focus options; the viewer hands focus back itself.
        const result = await orca('terminal', 'split', '--terminal', option('--pane'), '--direction', 'horizontal');
        return { pane: { pane_id: result?.split?.handle } };
      }
      // `terminal rename` titles the whole tab, including the OmO pane; the viewer titles its own pane.
      case 'rename': return {};
      case 'run': {
        const result = await orca('terminal', 'send', '--terminal', args[0], '--text', args[1], '--enter');
        if (result?.send?.accepted === false) throw new Error(`Orca did not accept input for ${args[0]}`);
        return {};
      }
      case 'get': {
        // Orca keeps answering for a closed pane: its record is orphaned from the layout or has exited.
        const terminal = (await orca('terminal', 'show', '--terminal', args[0]))?.terminal;
        if (terminal?.orphaned || terminal?.exitCause) throw new Error(`terminal_not_found: ${args[0]} is closed`);
        return { pane: { pane_id: terminal?.handle } };
      }
      case 'list': {
        const result = await orca('terminal', 'list', '--worktree', `id:${env.ORCA_WORKTREE_ID}`);
        return { panes: (result?.terminals ?? []).map(terminal => ({
          pane_id: terminal.handle, tab_id: terminal.tabId, terminal_title: terminal.title })) };
      }
      case 'close':
        // Closing this process's own pane tears down its PTY and would kill a waiting CLI mid-request.
        if (args[0] === env.ORCA_TERMINAL_HANDLE) {
          spawn(cli(), ['terminal', 'close', '--terminal', args[0], '--json'], { env, detached: true, stdio: 'ignore' }).unref();
          return {};
        }
        await orca('terminal', 'close', '--terminal', args[0]);
        return {};
      case 'focus': await orca('terminal', 'focus', '--terminal', args[0]); return {};
      default: throw new Error(`Unsupported Orca pane operation: ${operation}`);
    }
  };
}
