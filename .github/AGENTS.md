# GitHub Actions

- Publishing: each platform job (sign-cli-windows, build-launcher, build-end-user-installer) uploads its artifacts to the Release independently via `gh release upload`. The `publish` job is only for manifest generation — it does not re-upload assets.
- Windows CLI binaries are signed with Azure Trusted Signing. The `sign-cli-windows` job signs the extracted `bin/codyx.exe` inside each platform directory, then re-packs into ZIPs. The re-pack step is required because the build output is a directory tree, not an archive.
- The `build-cli` job (ubuntu) must pass `--all` to `build.ts` to produce Windows binaries. Without `--all`, `filterForCurrentPlatform` restricts to the host OS/arch only.
- When `--all` is set and `CODY_RELEASE` is truthy, `build.ts` creates ZIPs for all targets and uploads them directly to the Release (unsigned). The `sign-cli-windows` job then signs the binaries, re-packs signed ZIPs, and overwrites with `--clobber`.
- `packages: write` permission is only needed for Docker/ghcr.io publishing (currently unused in the Windows-only workflow).
