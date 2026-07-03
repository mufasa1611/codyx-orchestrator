# End-user installer

- Self-contained .NET 8 WPF app (`<SelfContained>true` + `<PublishSingleFile>true`) — no .NET runtime needed on the target machine.
- Actual install logic is in embedded PowerShell scripts: `install-compiled.ps1` (main install) and `installer-verification.ps1` (email gate), both `<EmbeddedResource>` in the `.csproj`.
- The `.exe` cannot work without a published GitHub Release. It downloads `codyx-release-manifest.json` from the release via GitHub API, then fetches CLI ZIPs listed in the manifest.
- Runs the embedded script with `-AcceptLicense -NoLaunch`. The script detects interactive/non-interactive context automatically.
