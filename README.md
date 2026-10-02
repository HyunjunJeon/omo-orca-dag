# OmO Orca DAG

**Live OmO workflow DAGs in an Orca side pane.**

English | [한국어](README_KO.md)

`omo-orca-dag` is an [OmO](https://github.com/code-yeongyu/oh-my-openagent) extension for [Orca](https://github.com/stablyai/orca). Whenever a workflow DAG appears in your OmO session, it opens a terminal UI in a split to the right of the OmO pane, so you can follow dependencies, node states, and task details while you keep working.

This project is derived from [jc01rho/omo-herdr-dag](https://github.com/jc01rho/omo-herdr-dag), which provides the same viewer for [Herdr](https://herdr.dev/). It covers Orca only. **If you use Herdr, install omo-herdr-dag;** the two can be installed side by side and never open a pane in the same place.

```text
OMO  /  DAG  t Tasks (0)
Selected run: Integration check · Active runs: 1
Running · Done 1/4
                      ╭────────────────────────────────╮
                      │ > [+] analyze                  │
                      │ ✓ Completed                    │
                      │ Start node                     │
                      ╰────────────────────────────────╯
                                       │
                     ┌─────────────────┴─────────────────┐
                     ▼                                   ▼
    ╭────────────────────────────────╮  ╭────────────────────────────────╮
    │   [-] server                   │  │   [-] ui                       │
    │ ● Running                      │  │ ● Running                      │
    │ ← analyze                      │  │ ← analyze                      │
    ╰────────────────────────────────╯  ╰────────────────────────────────╯
───────────────────────────────────────────────────────────────────────────────
● Connected
↑↓ Scroll  ←→ Runs  q Close
```

*The viewer pane while a workflow runs: `analyze` has finished, and `server` and `ui` run in parallel.*

## Contents

- [Quick start](#quick-start)
- [Requirements](#requirements)
- [Installation](#installation)
- [Verify the installation](#verify-the-installation)
- [Update](#update)
- [Uninstall](#uninstall)
- [How it behaves in Orca](#how-it-behaves-in-orca)
- [Controls](#controls)
- [Configuration and local data](#configuration-and-local-data)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [How it works](#how-it-works)
- [Development](#development)
- [Credits and license](#credits-and-license)

## Quick start

With Node.js 24 or later and OmO already installed:

```bash
npx github:HyunjunJeon/omo-orca-dag install
```

Then open an ordinary Orca terminal pane, start `omo` (or run `/reload` in an OmO session that is already running), and type `/dag-pane`. A pane titled `OmO DAG` opens on the right and waits for a DAG. From then on, every workflow DAG in that session appears there automatically.

The rest of this document covers each step in detail.

## Requirements

| Component | Requirement |
| --- | --- |
| Node.js | 24 or later. The viewer always runs on Node, even when OmO itself runs on Bun or as a compiled binary. It uses `node` on `PATH` unless you set `OMO_ORCA_DAG_NODE`. |
| OmO | A version that emits the `omo.dag.updated` event. Verified with OmO 5.1.9. |
| Orca | The Orca desktop app running, with its `orca` CLI. Orca terminals put the CLI on `PATH`. Verified with Orca 1.4.218 on macOS. |
| Git | Needed to install from GitHub or from a clone. |
| Terminal font | UTF-8 with box-drawing characters. |

Check the prerequisites from an Orca terminal pane, where you will run OmO:

```bash
node --version          # v24.0.0 or later
omo --version           # OmO is installed
echo "$TERM_PROGRAM"    # prints Orca
orca --version          # the Orca CLI is reachable
orca status --json      # "ok": true while the Orca app is running
```

## Installation

The installer copies the extension into OmO's agent directory. Nothing is installed into Orca, and the extension has no runtime npm dependencies.

### Option A: install directly from GitHub

```bash
npx github:HyunjunJeon/omo-orca-dag install --dry-run   # preview only; changes nothing
npx github:HyunjunJeon/omo-orca-dag install
```

`npx` downloads this repository into its cache and runs the installer, which copies the files into OmO's agent directory. The installed copy does not depend on the npx cache.

npm fetches the repository with Git, using your default credentials, so they need read access to it. If you reach this repository with a different SSH key than your default one, name that key for the command:

```bash
GIT_SSH_COMMAND="ssh -i ~/.ssh/<key-with-access> -o IdentitiesOnly=yes" \
  npx github:HyunjunJeon/omo-orca-dag install
```

The viewer's interface language defaults to English. Choose it at install time; later installs keep the saved choice unless you pass another value:

```bash
npx github:HyunjunJeon/omo-orca-dag install --lang ko      # Korean
npx github:HyunjunJeon/omo-orca-dag install --lang zh-cn   # Simplified Chinese
npx github:HyunjunJeon/omo-orca-dag install --lang en      # back to English
```

To install a specific commit or tag, append it to the repository: `npx github:HyunjunJeon/omo-orca-dag#<commit-or-tag> install`.

### Option B: install from a clone

Use this when Option A cannot fetch the repository, or when you want to read or change the code or run the tests first.

```bash
git clone git@github.com:HyunjunJeon/omo-orca-dag.git   # or https://github.com/HyunjunJeon/omo-orca-dag.git
cd omo-orca-dag
npm ci --ignore-scripts               # development-only test tooling
npm test                              # optional; needs Python 3 on macOS and Linux
node scripts/install.mjs --dry-run    # preview only; changes nothing
node scripts/install.mjs
```

`node scripts/install.mjs` accepts the same `--lang` and `--agent-dir` options as Option A. The installed copy is independent of the clone, so you can move or delete the clone afterward.

### Where the files go

The installer picks OmO's agent directory in this order: `--agent-dir PATH`, then `OMO_CODING_AGENT_DIR`, then `SENPI_CODING_AGENT_DIR`, then `~/.omo/agent`. With the default directory, the result is:

```text
~/.omo/agent/
├── extensions/omo-orca-dag.js      # entry point that OmO loads
└── orca-dag/
    ├── integration/
    │   ├── current.json            # active installation generation
    │   └── generation-000001/      # extension, src/, locale.json, LICENSE
    └── *.json                      # runtime snapshots, pane records, view preferences
```

`OMO_CODING_AGENT_DIR` names the agent directory itself. For example, with `OMO_CODING_AGENT_DIR=~/.omo` the entry point is `~/.omo/extensions/omo-orca-dag.js`. If your OmO loads extensions from another directory, pass it explicitly:

```bash
npx github:HyunjunJeon/omo-orca-dag install --agent-dir /path/to/agent-directory
```

`--agent-dir` only changes where files are installed. It does not configure OmO's extension discovery or the runtime state directory.

The installer prints a JSON summary. `--dry-run` prints the same plan without `"installed": true`. On an update, `backup` names the previous generation:

```json
{
  "installed": true,
  "integration": "/Users/you/.omo/agent/orca-dag/integration/generation-000001",
  "extension": "/Users/you/.omo/agent/extensions/omo-orca-dag.js",
  "entry": "omo-orca-dag.js",
  "language": "en",
  "activation": "Start a new OmO session or run /reload"
}
```

### Installing next to omo-herdr-dag

omo-orca-dag and omo-herdr-dag use different entry points (`omo-orca-dag.js` and `omo-herdr-dag.js`), state directories (`orca-dag/` and `herdr-dag/`), and environment variables (`OMO_ORCA_DAG_*` and `OMO_HERDR_DAG_*`), so you can install both. Each activates only in its own terminal: omo-herdr-dag inside Herdr panes, omo-orca-dag in Orca panes, and omo-orca-dag stays inactive inside a Herdr pane even when Herdr itself runs in Orca. Both offer `/dag-pane`, but only one is active in a given session.

### Activate

The extension loads when an OmO session starts. After installing, either start a new OmO session in an Orca terminal pane, or run `/reload` in an OmO session that is already running.

A viewer that is already open keeps running the code it started with. Close it with `q` and reopen it with `/dag-pane` to pick up the new version.

### Try it without installing

To try a checkout for a single session without installing it:

```bash
omo -e /path/to/omo-orca-dag/extension.mjs
```

Do this only while omo-orca-dag is not installed. Each loaded copy opens its own pane.

## Verify the installation

1. In an Orca terminal pane, start `omo` and type `/`. The command list shows `dag-pane`:

   ![OmO command completion listing dag-pane with the description "Open or reopen the current session's DAG pane".](docs/screenshots/dag-pane-command-en.png)

   If it is missing, see [Troubleshooting](#troubleshooting).
2. Run `/dag-pane`. A pane titled `OmO DAG` opens to the right of OmO and shows `Waiting for a DAG`. Keyboard focus returns to the OmO pane right after the viewer starts.
3. Press `q` inside the viewer. The viewer pane closes and OmO keeps running.
4. Ask OmO for work that runs a workflow DAG. The viewer opens by itself and updates as nodes run and finish.

## Update

- Option A: run `npx github:HyunjunJeon/omo-orca-dag install` again.
- Option B: run `git pull`, then `node scripts/install.mjs` in the clone.

Each update installs a new generation directory and keeps the previous one as a backup, so `/reload` loads the new modules instead of cached ones. Run `/reload` in open OmO sessions, then close open viewers with `q` and reopen them with `/dag-pane`. The language and runtime records carry over.

## Uninstall

```bash
rm ~/.omo/agent/extensions/omo-orca-dag.js
rm -rf ~/.omo/agent/orca-dag     # optional: installed generations, snapshots, and view preferences
```

Then run `/reload` or restart OmO, and close any DAG panes that are still open. If you installed into another agent directory, remove the files there instead. Uninstalling omo-orca-dag does not touch omo-herdr-dag.

## How it behaves in Orca

Run `omo` in an ordinary Orca terminal pane. When a workflow DAG appears, or when you run `/dag-pane`, the extension opens the viewer as a split to the right of that pane through the public `orca terminal` CLI. You do not register OmO as an agent in Orca.

The extension activates only when all of these hold. Orca sets the first three in its terminals:

- `TERM_PROGRAM=Orca`
- `ORCA_TERMINAL_HANDLE` is set (the pane OmO runs in)
- `ORCA_WORKTREE_ID` is set
- The Orca CLI is found: `ORCA_CLI_COMMAND` when set, otherwise `orca` on `PATH`

It stays inactive inside tmux or another multiplexer, which changes `TERM_PROGRAM`, and inside a Herdr pane (`HERDR_ENV=1`). An inactive session does not register `/dag-pane`, subscribe to DAG updates, or run Orca commands.

Orca's CLI shapes a few behaviors. They were observed with Orca 1.4.218 on macOS:

- **Width.** Orca splits have no ratio option, so the viewer gets Orca's default split width. Drag the divider to resize it.
- **Focus.** An Orca split moves keyboard focus to the new pane. The viewer turns on terminal focus reporting and, on its first focus report, hands focus back to the OmO pane with `orca terminal focus`. Orca sends that report only while the pane is on screen, so a viewer that opens in a background tab never pulls you to that tab. In that case the viewer may still hold focus when you visit the tab later; click the OmO pane. Keys typed in the instant before the viewer starts can still land in the new pane.
- **Titles.** `orca terminal rename` would retitle the whole tab, including the OmO pane, so the extension leaves tab titles alone. The viewer titles its own pane `OmO DAG`, which is also how leftover viewers are found and closed.
- **Restarts.** Orca terminal handles last for one Orca runtime. After Orca restarts, the recorded viewer counts as closed, and the next DAG or `/dag-pane` opens a new one.
- **Not verified:** Linux, Windows, and SSH-hosted Orca terminals.

## Controls

| Where | Command or key | Action |
| --- | --- | --- |
| OmO | `/dag-pane` | Open the viewer before a workflow starts, or reopen one you closed. |
| OmO | `/reload` | Load or reload the extension. |
| DAG pane | `↑` / `↓`, `k` / `j` | Scroll. |
| DAG pane | `Page Up` / `Page Down` | Scroll by a page. |
| DAG pane | `←` / `→` | Switch between runs. |
| DAG pane | `t` | Switch between the DAG and ordinary Tasks. Without a DAG, Tasks is the default view. |
| DAG pane | `Tab` / `n`, `Shift+Tab` / `p` | Select the next or previous node and bring its details into view. |
| DAG pane | `Space` / `Enter` | Collapse or expand the selected node's details, including its child tasks. |
| DAG pane | `d` | Toggle full details for the selected task or node without changing its saved collapse state. |
| DAG pane | `c` | Show or hide completed runs when there are several. |
| DAG pane | `q`, `Ctrl+C`, `Ctrl+D` | Close the viewer and its pane. |

`>` marks the selected node, `[-]` means expanded, and `[+]` means collapsed. Running tasks expand automatically and fold when they finish, unless you chose otherwise; your choices are saved in `<snapshot path>.view.json` and survive updates and viewer restarts. When no workflow DAG exists, the viewer lists the ordinary subtasks of the current session.

Expanded task cards show four compact lines: status and description, agent and short model name, one line of progress, and elapsed time with turn and tool counts. While an in-process task is calling its model, the progress line shows whether the call is alive: `✎ now` (response), `💭` (thinking), `⚙ write now` (tool arguments), `⏳ waiting for model 12s`, `▶ bash running 1m 5s`, or `↻ retry 2/3`. When no token arrives for 30 seconds, or no first token for 90 seconds, the line starts with `⚠ possibly stalled` and the running node turns yellow.

On startup, and on `/dag-pane` when the viewer cache is empty, the extension restores the current session's saved DAG checkpoints from `<task state directory>/dag/runs/` without rerunning tasks. Checkpoints from other sessions are not shown.

When the OmO session ends, the last graph stays visible:

```text
○ Disconnected · snapshot saved
You can close this pane with q.
```

Closing the viewer never cancels workflow tasks or deletes the saved snapshot. The close hint does not mean every task succeeded.

## Configuration and local data

Set these before starting OmO or running `/reload`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `OMO_ORCA_DAG_STATE_DIR` | `~/.omo/agent/orca-dag/` | Directory for snapshots and pane records. |
| `OMO_ORCA_DAG_TASK_STATE_DIR` | `<project>/.omo/senpi-task/` | OmO task store root that contains `tasks/`. Set it to match a custom OmO `task.state_dir`. |
| `OMO_ORCA_DAG_LANG` | Saved install language, initially `en` | Override the interface language with `en`, `ko`, or `zh-cn`. |
| `OMO_ORCA_DAG_NODE` | Validated host Node, otherwise `node` on `PATH` | Node.js 24+ executable for the viewer. Paths with spaces work. |
| `OMO_ORCA_DAG_RETENTION_DAYS` | `14` | Days before startup prunes expired snapshots and pane records. The current session's files are always kept; `0` disables pruning. |
| `ORCA_CLI_COMMAND` | `orca` on `PATH` | Orca CLI to call. Orca sets it in managed WSL sessions. |

Standalone OmO builds such as `omob` still need a separate Node.js 24+ for the viewer. The extension probes the runtime before opening a pane and resolves version-manager shims to the real executable. To choose one explicitly, start OmO with `OMO_ORCA_DAG_NODE=/absolute/path/to/node omo`. An invalid explicit path produces a warning instead of a silent fallback.

Snapshots are local JSON files with session and run IDs, node labels, states, task IDs, dependency edges, error messages, task descriptions, and short progress excerpts. Workflow prompts, full outputs, and final responses are not copied. Labels and progress can still contain project information, so keep runtime files out of public issues and source control. The extension adds no network service or telemetry.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `/dag-pane` is missing | Run `echo "$TERM_PROGRAM $ORCA_TERMINAL_HANDLE $ORCA_WORKTREE_ID"` in the same pane: you should see `Orca` followed by two IDs. Run OmO directly in the Orca pane, not inside tmux, Herdr, or another multiplexer. Check that `orca status --json` reports `"ok": true`. Then confirm that `extensions/omo-orca-dag.js` sits in the agent directory OmO actually uses, and run `/reload`. |
| `npx` exits with code 128 and no message | Git could not read the repository with your default credentials. Pass the key that has access through `GIT_SSH_COMMAND`, as shown in [Option A](#option-a-install-directly-from-github), or use Option B. |
| A warning says the viewer requires Node.js 24 | Install Node.js 24 or later, or start OmO with `OMO_ORCA_DAG_NODE` pointing to one, then run `/dag-pane`. |
| No pane opens automatically | The viewer opens for workflow DAGs and current-session OmO tasks. Generic `parallel()` calls without OmO task records are not tasks. A pane you closed stays closed until `/dag-pane`. |
| A closed pane stays closed | Intentional. Run `/dag-pane`. |
| The viewer keeps keyboard focus | This happens when the viewer opened in a background tab. Click the OmO pane. |
| A leftover `OmO DAG` pane remains after a crash or restart | The next `/dag-pane` closes leftover viewers in the same tab. You can also close it with `q` or Orca's close button. |
| On Linux, `orca` starts a screen reader | GNOME's screen reader is also called `orca`. Set `ORCA_CLI_COMMAND` to Orca's CLI (for example `orca-ide`, or its absolute path) before starting OmO. Linux has not been verified. |
| A `DAG pane:` warning appears | Check that `orca terminal list --worktree "id:$ORCA_WORKTREE_ID" --json` works in that pane. A failed or uncertain launch suppresses automatic retries to avoid duplicate panes; close any half-open viewer, then run `/dag-pane`. |

## FAQ

### Is this an OmO extension or an Orca plugin?

An **OmO extension**. It runs inside OmO, listens for workflow updates, and drives Orca through its public CLI. Nothing is installed into Orca.

### Does it support Herdr?

No. Use [omo-herdr-dag](https://github.com/jc01rho/omo-herdr-dag) for Herdr. Both can be installed together, as described in [Installing next to omo-herdr-dag](#installing-next-to-omo-herdr-dag).

### What happens outside Orca?

The extension stays inactive: it does not register `/dag-pane`, subscribe to DAG updates, or run any Orca commands. Having the Orca app open is not enough; OmO must run inside an Orca terminal pane. Do not set the activation variables by hand.

### Does Orca's own task DAG show OmO workflows?

No. Orca's orchestration DAG tracks Orca-managed agents. This extension shows OmO's internal workflow state, which Orca does not see.

## How it works

```text
OmO workflow snapshot: omo.dag.updated
OmO task progress: omo.task.updated + local task records
Startup recovery: current-session DAG checkpoints
    → Senpi shared event bus: senpi:extension-rpc-event
    → filter by the current parent session ID
    → write a normalized local snapshot
    → open or reuse the viewer pane:
        orca terminal split --terminal <OmO pane> --direction horizontal
        orca terminal send --terminal <viewer pane> --text "<viewer command>" --enter
    → the viewer TUI watches the snapshot file
```

`src/orca.mjs` wraps the `orca terminal` commands the extension needs (`split`, `send`, `show`, `list`, `close`, `focus`). The snapshot model, rendering, and checkpoint recovery come from omo-herdr-dag. Ordinary subtasks appear in a separate task list rather than as invented dependency nodes; the viewer only draws edges the workflow declares.

This integration depends on OmO/Senpi internal event contracts, which can change between OmO versions.

## Development

```bash
npm ci --ignore-scripts
npm test               # unit and real-PTY tests with a fake orca CLI
npm run build          # assemble dist/ and syntax-check it
npm run test:package   # pack, install offline into a temp project, verify the CLI and the Git-install fallback
npm run check          # all three
```

The tests need neither OmO nor Orca. POSIX tests use Python 3 for a real PTY; Windows tests use the development-only `node-pty`. GitHub Actions runs the checks on Node 24 and 26. [CONTRIBUTING.md](CONTRIBUTING.md) describes live checks in Orca, and [VERIFICATION.md](VERIFICATION.md) records what was verified where.

## Credits and license

[MIT](LICENSE). The viewer, snapshot model, and installer come from [omo-herdr-dag](https://github.com/jc01rho/omo-herdr-dag) by jc01rho; this project adds the Orca integration. It is an independent community project, not an official OmO or Orca component.
