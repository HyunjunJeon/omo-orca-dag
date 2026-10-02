# Verification and compatibility

This record separates observed behavior from assumptions. Herdr results for the shared viewer are recorded in the upstream [omo-herdr-dag VERIFICATION.md](https://github.com/jc01rho/omo-herdr-dag/blob/main/VERIFICATION.md).

## Native macOS with Orca (2026-10-02)

macOS on arm64, Node 24.21.0, OmO 5.1.9, and Orca 1.4.218. The extension was loaded from the source checkout with `omo -e extension.mjs` in an ordinary Orca terminal, and a scratch extension emitted an explicitly labeled **synthetic** `omo.dag.updated` snapshot through `pi.rpc.emit`. No model workflow ran. An installed upstream omo-herdr-dag was present in the same agent directory and stayed inactive.

- With the OmO tab in the background, the snapshot opened the viewer as a right-hand split titled `OmO DAG`. The active tab did not change, and the four-node graph rendered. A completed snapshot updated the same viewer to `Done 4/4`.
- With the OmO tab shown, the viewer's first focus report returned focus to the OmO pane.
- `q` closed the viewer pane without an error, and `/dag-pane` then opened a new viewer.
- The Orca CLI behavior the adapter relies on was probed directly:
  - `terminal split` returns the new handle and focuses that pane.
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
- **Installing from GitHub:** recorded separately once `npx github:HyunjunJeon/omo-orca-dag install --dry-run` has run against the pushed repository.

Add new compatibility evidence only after running the relevant environment, and omit private hostnames, session IDs, and local account paths.
