# Contributing

Bug reports and pull requests are welcome. Keep changes focused, describe the behavior they change, and keep [README.md](README.md) and [README_KO.md](README_KO.md) consistent for user-facing changes.

This project covers Orca only. Changes that concern the shared viewer, snapshot model, or Herdr belong in the upstream [omo-herdr-dag](https://github.com/jc01rho/omo-herdr-dag) first.

## Local development

Use Node 24 or later. The installed product has no npm dependencies. Run `npm ci --ignore-scripts` to obtain the development-only Windows PTY bridge.

```bash
npm test
npm run build
npm run test:package
```

The deterministic tests cover snapshot normalization, session isolation, pane reuse, failure handling, graph layout, scrolling, terminal display widths, and the Orca adapter. They need neither OmO nor Orca: `test/orca-cli.mjs` provides a fake `orca` executable that logs its arguments and answers with Orca's JSON shapes, including stale and closed handles. Add behavior tests for fixes that affect these contracts.

On POSIX, the interactive viewer tests require Python 3 and a Unix PTY. On Windows they use `node-pty` with real ConPTY input. Both bridges wait for frame predicates rather than fixed delays. These are test-only requirements; the installed extension and viewer require only Node.

The build assembles `dist/` and checks JavaScript syntax. The package check installs the real npm tarball offline into a temporary project, verifies the public CLI, and removes `dist/` to verify the fallback that installs straight from Git rely on. `npm run check` runs the complete local pipeline. Generated files in `dist/` and `.artifacts/` should not be committed.

English is the default interface language. Keep English, Korean, and Simplified Chinese entries in `src/i18n.mjs` complete, and preserve workflow-provided labels in their original language.

For installer changes, test a temporary `--agent-dir` before installing into your active OmO environment. Check both a new installation and an update, and verify that unrelated files, runtime records, and an omo-herdr-dag installation in the same agent directory remain intact.

## Manual live check in Orca

Run this from an Orca terminal pane in a tab where a temporary split is acceptable. Load the checkout for one session instead of installing it, and keep runtime files in a scratch directory:

```bash
mkdir -p /tmp/omo-orca-live/work && cd /tmp/omo-orca-live/work
OMO_ORCA_DAG_STATE_DIR=/tmp/omo-orca-live/state \
OMO_ORCA_DAG_TASK_STATE_DIR=/tmp/omo-orca-live/tasks \
omo --no-session -e /path/to/omo-orca-dag/extension.mjs
```

Do not also have omo-orca-dag installed while doing this, or two copies will open panes. Then check:

1. `/dag-pane` opens a split to the right titled `OmO DAG` and focus returns to the OmO pane while the tab is visible.
2. A workflow DAG opens and updates the viewer. To test without running model workers, load a second scratch extension with `-e` that registers a command calling `pi.rpc.emit('omo.dag.updated', { parent_session_id: ctx.sessionManager.getSessionId(), runs: [...] })` with an explicitly labeled synthetic run.
3. `q` closes the viewer pane without an error, and `/dag-pane` opens a new one.
4. When opened in a background tab, the viewer does not switch the active tab.

Check `orca terminal list --worktree "id:$ORCA_WORKTREE_ID" --include-visual-layouts --json` before and after, and close any leftover panes by handle. `orca terminal close --tab` leaves PTYs running, so close panes individually. Record the OS, OmO, Orca, and Node versions and the observed behavior in [VERIFICATION.md](VERIFICATION.md). Do not run these checks against another person's active session.

## Implementation boundaries

- `extension.mjs`: Orca activation, OmO lifecycle, and Senpi event subscription.
- `src/orca.mjs`: Orca session detection, CLI resolution, and the `orca terminal` operations (`split`, `send`, `show`, `list`, `close`, `focus`).
- `src/model.mjs`: Normalize explicit DAG snapshots and compute topological layers.
- `src/controller.mjs`: Serialize updates and manage session-specific pane records.
- `src/storage.mjs`: Replace local JSON state atomically.
- `src/task-data.mjs`: Read OmO task records and progress events, retaining only DAG-linked tasks and their explicit descendants.
- `src/view-state.mjs`: Persist session/run/node expansion preferences separately from workflow snapshots.
- `src/render.mjs` and `src/viewer.mjs`: Terminal layout, file watching, keyboard controls, and focus hand-back.
- `src/i18n.mjs`: English, Korean, and Simplified Chinese interface messages.
- `scripts/install.mjs`: Install a standalone copy in the OmO agent directory.
- `bin/omo-orca-dag.mjs`: Installer CLI, used by `npx github:HyunjunJeon/omo-orca-dag`.
- `scripts/build.mjs` and `scripts/verify-package.mjs`: Build and verify the package.

Do not infer task dependencies or display another session's runs. Keep graph data out of shell command strings. Sanitize terminal control sequences in user-supplied labels and errors. Never retitle Orca tabs, never switch the user's active tab, and respect a manually closed viewer.

## Reporting bugs

Include the host OS, Node version, OmO/Senpi version, Orca version, and whether OmO ran directly in an Orca pane. Provide a minimal reproduction and sanitized output. Never include real workflow prompts, complete session files, credentials, or private runtime snapshots.

## License

Release instructions are in [RELEASING.md](RELEASING.md).

By submitting a contribution, you agree that your contribution is licensed under this project's [MIT License](LICENSE).
