# Script directory

## `changelog.ts`

- `cody run --command changelog` spawns the full codyx-ai CLI — includes SQLite DB migration and AI model loading on every invocation. Requires `codyx-ai` globally installed and a reachable AI model endpoint.
- "Error: Model not found: cody/gpt-5.4" on stderr is non-fatal — `cody run` exits 0. When this happens AI changelog is unavailable; script falls back to `git log --oneline`.

## `version.ts`

- Must create the git tag ref (`POST /repos/{owner}/{repo}/git/refs`) before creating/patching a release. The release API and `gh release create` can set `tag_name` without creating the underlying git ref, producing `untagged-` release URLs despite correct tag name.
- The get-ref API path uses `tags/{tag}`; only the create-ref body uses `refs/tags/{tag}`.
- `GET /releases/tags/{tag}` 404 means either no release OR the git ref is missing. List all releases (`?per_page=100`) and filter by `tag_name` to find orphaned releases.
- Wrap `$` call to changelog.ts in `.catch(() => {})` so release creation always proceeds regardless of changelog success.
- Uses GitHub REST API directly (`fetch`) instead of `gh release create` to avoid Bun `$` shell quoting bugs and GA `gh` permission edge cases.
