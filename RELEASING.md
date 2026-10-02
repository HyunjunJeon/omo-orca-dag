# Releases

omo-orca-dag is distributed from GitHub. Users install it with `npx github:HyunjunJeon/omo-orca-dag install` or from a clone; it is not published to npm.

## What ships

- `bin/omo-orca-dag.mjs`: the `install` CLI.
- `scripts/install.mjs`, `extension.mjs`, and `src/`: the installer and the extension it copies into OmO's agent directory.
- `dist/`: the same files assembled and syntax-checked by `npm run build` when a tarball is packed. Installs straight from Git skip that build, so the CLI falls back to `scripts/install.mjs`.

## Prepare a version

Set the version in `package.json` and `package-lock.json`, keep both READMEs current, and record actual compatibility results in [VERIFICATION.md](VERIFICATION.md).

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run check
```

Then commit, tag, and push:

```bash
git tag v0.1.0
git push origin main v0.1.0
```

Users can pin that release with `npx github:HyunjunJeon/omo-orca-dag#v0.1.0 install`.

## GitHub Actions

The **Test and build** workflow runs the checks on Node 24 and 26 for pushes and pull requests and uploads the packed `.tgz`.

The **Release to GitHub and npm** workflow (`.github/workflows/publish.yml`), inherited from upstream, runs on pushed `v*` tags. Its GitHub Release job attaches the verified `.tgz` with the built-in token. Its npm job fails until npm publishing is configured with an `NPM_TOKEN` secret or trusted publishing, which this project has not set up; the GitHub Release does not depend on it.
