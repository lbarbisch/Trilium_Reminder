# Development

## Toolchain

You need Git, Node.js 24 and, for releases, the GitHub CLI (`gh`). Everything else installs through npm; no C++ compiler is needed.

Windows (PowerShell):

```powershell
winget install --id Git.Git -e
winget install --id GitHub.cli -e
winget install Schniz.fnm
# add to your PowerShell profile (notepad $PROFILE), then open a new terminal:
#   fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression
fnm install 24
fnm default 24
```

Debian or Ubuntu:

```bash
sudo apt install -y git gh curl unzip libglib2.0-bin shellcheck
curl -fsSL https://fnm.vercel.app/install | bash
# open a new terminal
fnm install 24 && fnm default 24
```

Install Node 24 specifically, not the newest LTS: it matches the Node types Electron 45 uses. Keep TypeScript below 6.1, because typescript-eslint doesn't support newer versions yet.

If `npm run dev` fails on Ubuntu with a `chrome-sandbox` error, fix the helper's permissions (repeat after reinstalling dependencies). Don't switch the sandbox off.

```bash
sudo chown root:root node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
```

## Commands

| Command                                          | What it does                                       |
| ------------------------------------------------ | -------------------------------------------------- |
| `npm ci`                                         | Installs the locked dependencies                   |
| `npm run dev`                                    | Starts the app with live reload                    |
| `npm run lint`, `npm run format`                 | Checks or fixes style (ESLint and Prettier)        |
| `npm run typecheck`, `npm test`, `npm run build` | Checks types, runs tests, compiles into `out/`     |
| `npm run dist:win`, `npm run dist:linux`         | Builds installers into `dist/`; run each on its OS |
| `npm run docs:dev`, `npm run docs:build`         | Previews or builds this manual                     |

A development run never writes autostart entries, but it uses the same settings folder as the installed app. Quit the installed app before `npm run dev`, and point development runs at a test note.

Keep these settings:

- No `"type": "module"` in `package.json`: the sandboxed preload script must be CommonJS.
- `.gitattributes` forces LF line endings, which Prettier and the shell scripts need.
- `--publish never` in the `dist:*` scripts: only the release workflow publishes.

## Architecture

The main process owns the network, files and token. The window is sandboxed; it only displays data and sends actions through `window.todoApi` (`src/preload/index.ts`).

| Module (`src/main`) | Responsibility                                                |
| ------------------- | ------------------------------------------------------------- |
| `todoDoc.ts`        | Reads and changes the note HTML with cheerio (pure functions) |
| `trilium.ts`        | ETAPI client, error classification, URL rules                 |
| `sync.ts`           | Action queue and safe save (`SyncEngine`)                     |
| `syncService.ts`    | When to sync, retry delays, status                            |
| `store.ts`          | `config.json`, `state.json`, atomic writes, encrypted token   |
| `wake.ts`           | Merges triggers within 3 s, detects timer gaps                |
| `ipc.ts`            | Validates every window message                                |
| `tray.ts`           | Tray menu                                                     |
| `linuxSetup.ts`     | Linux autostart entry and wake service installation           |
| `log.ts`            | Small log file without secrets                                |
| `index.ts`          | App lifecycle, window, settings, triggers                     |

### List rules

- Only the first top-level `ul.todo-list` is managed. Everything else in the note is left byte for byte.
- Items are matched by CKEditor's `data-list-item-id`. Items without one, or with a duplicate, get `e` + 32 hex characters, saved on the first sync.
- **Add:** top level, after the last open item; skipped if the ID already exists, so a replay never duplicates. Text is inserted as text, never HTML.
- **Set done:** changes only the checkbox; removes a custom `data-trilium-task-state` and its `title`.
- **Move:** among siblings only, with sub-items. `beforeId: null` means after the last open sibling.
- Actions on missing items, and moves across levels, are skipped and reported.

### Sync

The window shows the cached note with the queued actions applied. Each action is saved to `state.json` before any network call. A sync reads `blobId` and content, applies a copy of the queue, and if the HTML changed: creates a revision (first save of the local day), checks `blobId` again (restarts if it changed, up to three attempts), and saves. Only the copied actions leave the queue.

ETAPI has no conditional save, so an edit made in Trilium between the last check and the save can be overwritten. A replayed tick or move can override a newer Trilium change to the same item.

### Data files

Both live in Electron's `userData` folder (`%APPDATA%\Trilium Reminder` on Windows, `~/.config/Trilium Reminder` on Linux) and are written atomically (temporary file, then rename; mode `0600` on Linux).

| File          | Content                                                     |
| ------------- | ----------------------------------------------------------- |
| `config.json` | `version`, `serverUrl`, `noteId`, `tokenEncrypted` (base64) |
| `state.json`  | `version`, `cacheHtml`, `queue`, `lastRevisionDay`          |

## Tests

```bash
npm test
```

| Level       | Covers                                                                                                  | Where    |
| ----------- | ------------------------------------------------------------------------------------------------------- | -------- |
| Unit        | List rules on real CKEditor output, sync engine, retries, error types, storage, validation, Linux setup | CI       |
| Integration | All four ETAPI calls against a real note (`tests/integration/etapi.test.ts`)                            | Manual   |
| Manual      | Window, wake triggers, installers (table below)                                                         | Real PCs |

The integration test **changes the note**, so point it at a test note only. It skips itself unless all three variables are set:

```bash
export TRILIUM_URL=https://your-server TRILIUM_NOTE_ID=yourTestNoteId
read -rs TRILIUM_TOKEN && export TRILIUM_TOKEN
npm test -- tests/integration
```

For a disposable server:

```bash
docker run -d --name trilium-test -p 127.0.0.1:8081:8080 \
  -v trilium-test:/home/node/trilium-data triliumnext/trilium:v0.107.0
```

Complete its setup at `http://localhost:8081`, create a text note with a to-do list, and an ETAPI token.

To add your own note as a fixture, save its HTML (from `GET /etapi/notes/<id>/content`) under `tests/fixtures/`, after replacing private text.

### Manual test table

Run it for each release on real machines and record the OS version and desktop.

| Test                                        | OS      | Expected                                   |
| ------------------------------------------- | ------- | ------------------------------------------ |
| Restart and sign in                         | Both    | One window with the current list           |
| Lock for 5 seconds, then unlock             | Both    | Window on top                              |
| Standby with and without lock on wake       | Both    | Window appears after wake                  |
| Standby overnight, including Modern Standby | Windows | Window appears after wake                  |
| Wake while a video plays full screen        | Both    | Window is visible over it                  |
| Stop the wake watcher process               | Linux   | Service restarts within seconds            |
| Wake before Wi-Fi connects                  | Both    | Cache first, then fresh data               |
| Change items offline, then reconnect        | Both    | No lost or duplicate items                 |
| Edit in Trilium with app changes pending    | Both    | Both changes remain                        |
| Reorder formatted and nested items          | Both    | Content stays intact                       |
| Wrong token; protected note                 | Both    | Clear message, nothing written             |
| Upgrade over the previous version           | Both    | Settings and queue remain; autostart works |

On Windows, record separately whether the window appears and whether it gets keyboard focus.

## Release a version

1. On a branch, run `npm version patch --no-git-tag-version` (or `minor`). Skip this for the first release, which is already 0.1.0.
2. Update `CHANGELOG.md` and the manual, then merge a green pull request.
3. Tag the merged commit with the matching version:

   ```bash
   git switch main
   git pull
   git tag -a v0.1.0 -m "v0.1.0"
   git push origin v0.1.0
   gh run watch
   ```

4. The Release workflow tests, builds both systems and creates a **draft** release with the binaries, `SHA256SUMS.txt`, build attestations and the manual as a zip.
5. Download the draft's binaries, install them, follow the [installation page](./install.md) and run the manual test table.
6. Edit the release notes and publish the draft. Publishing runs the Docs workflow, which updates the manual website.

If a published version is broken, release a new patch instead of replacing its files.

### One-time GitHub setup

1. **Settings → Pages:** source **GitHub Actions**.
2. **Settings → Environments → `github-pages`:** add the tag rule `v*` next to `main`.
3. **Settings → Actions → General:** default workflow permissions read-only.
4. **Branch rules:** require pull requests and passing CI on `main`.
5. **Security:** turn on private vulnerability reporting, secret scanning and push protection.
