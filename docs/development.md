# Development

## Layout

| Path | What is there |
|---|---|
| `src/` | The interface: Vue 3 + TypeScript |
| `src/store.ts` | App state, projects, settings, saving |
| `src/storage.ts` | Disk access through Tauri commands, with a `localStorage` fallback for a plain browser |
| `src/editor/` | Canvas logic (`useEditor.ts`), line routing and layout (`geometry.ts`), image export |
| `src/sql/` | SQL export, import and highlighting |
| `src/convert.ts`, `src/engines.ts` | Engine list, type lists, type conversion between engines |
| `src-tauri/` | The Rust side: file commands, window setup, bundling |
| `tests/` | Unit tests (`bun test`) |
| `scripts/export-sample.ts` | Writes the test schema as SQL for each engine |

## Running

```sh
bun install
bun run tauri dev     # the desktop app, with hot reload
bun run dev           # the interface alone in a browser at http://localhost:1420
```

In a plain browser the app stores projects in `localStorage` and the folder features are hidden.

To run the desktop app without touching your real projects and settings, set `JOINERY_DATA_DIR` to an empty folder first.

## Checks

```sh
bun run typecheck             # vue-tsc
bun test                      # unit tests
cargo test --manifest-path src-tauri/Cargo.toml
```

`bun test` runs the exported SQL on real SQLite (built into Bun) and PostgreSQL (PGlite, an embedded build). MySQL, MariaDB and SQL Server need real servers, so those run only in CI.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request:

- **web**: type-check, unit tests, production build of the interface.
- **databases**: starts PostgreSQL, MySQL, MariaDB and SQL Server containers and runs the exported script on each.
- **desktop**: Rust tests and a compile of the desktop app on Windows.

## Releasing

1. Update the version in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`, and add a section to `CHANGELOG.md`.
2. Commit, then tag and push:
   ```sh
   git tag v1.0.1
   git push origin main --tags
   ```
3. `.github/workflows/release.yml` builds the Windows installers and publishes a GitHub release with them attached.

The installers are not code-signed. [signing.md](signing.md) lists the options.

## App icon

The source is `src-tauri/app-icon.svg`. After changing it, render it to a 1024×1024 PNG and run `bun run tauri icon <that png>` to regenerate `src-tauri/icons/`.
