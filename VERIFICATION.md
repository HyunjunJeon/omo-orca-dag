# Verification and compatibility

This record separates observed behavior from assumptions. Herdr results for the shared viewer are recorded in the upstream [omo-herdr-dag VERIFICATION.md](https://github.com/jc01rho/omo-herdr-dag/blob/main/VERIFICATION.md).

## Native macOS with Orca (2026-10-02)

macOS on arm64, Node 24.21.0, OmO 5.1.9, and Orca 1.4.218. The extension was loaded from the source checkout with `omo -e extension.mjs` in an ordinary Orca terminal, and a scratch extension emitted an explicitly labeled **synthetic** `omo.dag.updated` snapshot through `pi.rpc.emit`. No model workflow ran. An installed upstream omo-herdr-dag was present in the same agent directory and stayed inactive.

- With the OmO tab in the background, the snapshot opened the viewer as a split titled `OmO DAG`. The active tab did not change, and the four-node graph rendered. A completed snapshot updated the same viewer to `Done 4/4`.
- With the OmO tab shown, the viewer's first focus report returned focus to the OmO pane.
- `q` closed the viewer pane without an error, and `/dag-pane` then opened a new viewer.
- The Orca CLI behavior the adapter relies on was probed directly:
  - `terminal split` returns the new handle and focuses that pane.
  - `--direction vertical` places the new pane to the right: in a visible tab, a 61×206 pane became two 61×101 panes. `--direction horizontal` stacks it below, the reverse of Orca's CLI guide; the first release used it and opened the viewer at the bottom. Panes in background tabs report 24×80 until shown, so direction can only be measured in a visible tab.
  - `terminal rename` retitles the whole tab.
  - `terminal close --tab` leaves the PTYs running.
  - A closed handle still answers `terminal show` as an orphaned record.
  - A handle from another runtime fails with `terminal_handle_stale`.
  - Focus reports (DECSET 1004) arrived only while the pane was shown.

These checks ran on the code with both backends and were repeated after the package became Orca-only. `npm run check` passed 103 tests, the build, and the package smoke check, including the Git-install source fallback.

## Current limits

- **Platforms:** Linux, Windows, and SSH-hosted Orca terminals are not verified.
- **Background tabs:** whether focus returns when you later visit a tab whose viewer opened while hidden is not verified; the viewer may keep focus there.
- **Real workflows:** checks used synthetic snapshots; a fresh model-driven workflow has not been recorded.
- **Other versions:** other OmO, Senpi, and Orca versions are unverified. The extension depends on OmO/Senpi internal event contracts and on the Orca CLI's JSON output.
- **Installing from GitHub:** with the repository private, `npx github:HyunjunJeon/omo-orca-dag install --dry-run --agent-dir <temp>` printed the install plan from the pushed repository when `GIT_SSH_COMMAND` named a key with access (npm 11.19). That run used the Git-install source fallback. With default credentials lacking access, npx exited with code 128 and no message.

Add new compatibility evidence only after running the relevant environment, and omit private hostnames, session IDs, and local account paths.
