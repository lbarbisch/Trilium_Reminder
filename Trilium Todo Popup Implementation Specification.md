# Trilium Todo Popup: Implementation Specification

Nov 26, 2026 · @Dude

## Scope and requirements

Version 1 is an Electron app for Windows (primary) and Linux that puts your Trilium to-do list in front of you whenever you return to the PC. It builds on the [concept](https://claude.ai/artifact/JH7womHSKThgBnhM9422Yu), including your two answers there. `Trilium Todo Popup` and `trilium-todo-popup` are working names, and `OWNER` stands for your GitHub user name.

| ID | Requirement |
| --- | --- |
| R1 | Read and write one unprotected Trilium text note through ETAPI. |
| R2 | Add, finish, undo and reorder items in the app. |
| R3 | Show the window after boot or sign-in, every resume from standby and **every unlock, however short the lock**. |
| R4 | Open centred and on top, and stay until you close it. It should keep you from drifting to YouTube or other distractions. It does not block other apps or sites. |
| R5 | Keep done items in the note. You clean them up yourself in Trilium. |
| R6 | Work offline from a cache and send queued changes later. |
| R7 | On Linux, detect wake-up with a systemd user service. |
| R8 | Preserve formatting, links, sub-items, task states and all other note content. |
| R9 | Use GitHub Actions to test, build binaries and prepare releases. |
| R10 | Ship a README and a manual that match each release. |

**Not in version 1:** editing or deleting items, cleaning up done items, changing sub-item nesting, auto-update, macOS and ARM builds.

**Changes from the concept:**

- Items are matched by their `data-list-item-id`, not by text. In a test, CKEditor 49.0.1, the editor version [Trilium 0.107.0 uses](https://raw.githubusercontent.com/TriliumNext/Trilium/v0.107.0/packages/ckeditor5/package.json), added this ID to each item and kept an existing one.
- Repeat triggers are merged for 3 seconds instead of 60, so a short lock still opens the window.

## Toolchain

You need Git, Node.js 24 and the GitHub CLI. Everything else installs through npm. The current dependencies need no C++ compiler or Visual Studio Build Tools.

| Tool | Needed for |
| --- | --- |
| Git, GitHub CLI (`gh`) | Source control, creating the repository, checking releases |
| fnm, Node.js 24 | Building and testing |
| VS Code (optional) | Editing |
| Docker (optional) | A throwaway Trilium server for tests |
| `gdbus`, ShellCheck (Linux) | Wake service and script checks |

Node 24 matches the Node types Electron 45 uses and is [supported until April 2028](https://raw.githubusercontent.com/nodejs/Release/main/schedule.json). Don't install the generic "Node LTS" package, because Node 26 is now also an LTS release.

### Windows (PowerShell)

```powershell
winget install --id Git.Git -e
winget install --id GitHub.cli -e
winget install Schniz.fnm
winget install --id Microsoft.VisualStudioCode -e    # optional
winget install --id Docker.DockerDesktop -e          # optional
```

Open a new terminal. Add the following line to your PowerShell profile (`notepad $PROFILE`, creating the file if needed), then open another terminal. If the profile is blocked, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

```powershell
fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression
```

```powershell
fnm install 24
fnm default 24
node -v
```

### Linux (Debian or Ubuntu)

```bash
sudo apt update
sudo apt install -y git gh curl unzip libglib2.0-bin shellcheck
curl -fsSL https://fnm.vercel.app/install | bash
# open a new terminal
fnm install 24 && fnm default 24
```

See the [fnm instructions](https://github.com/Schniz/fnm) for other shells. On Fedora, the system packages are `git gh curl unzip glib2 ShellCheck`. For Docker, follow Docker's instructions for your distribution.

If `npm run dev` fails on Ubuntu with a `chrome-sandbox` error, run this and repeat it after reinstalling dependencies. Don't switch the sandbox off.

```bash
sudo chown root:root node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
```

### Project packages

These versions installed and built together. `package-lock.json` in the starter files fixes the exact set.

| Package | Version | Role |
| --- | --- | --- |
| electron | 45.5.0 | Desktop runtime |
| electron-vite, vite | 6.0.0, 8.4.0 | Development server and build |
| electron-builder | 26.18.0 | Installers and Linux packages |
| typescript | 6.0.3 | **Stay below 6.1** |
| vitest | 5.1.2 | Tests |
| eslint, typescript-eslint, prettier | 10.15.0, 8.74.0, 3.10.1 | Lint and format |
| cheerio | 1.2.0 | HTML parsing, the only runtime dependency |
| vitepress | 1.6.4 | Manual website |

TypeScript 7.0.2 is the newest release, but typescript-eslint 8.74.0 only accepts versions below 6.1.

## Repository layout and project setup

Start from `trilium-todo-popup-starter.zip`, attached in the chat. In the tree, **S** marks starter files, **N** files you still need to create, and **S\*** starter placeholders to finish.

```text
trilium-todo-popup/
  .github/workflows/ci.yml, release.yml, docs.yml   S
  .github/dependabot.yml                            S
  .github/ISSUE_TEMPLATE/, pull_request_template.md N
  build/icon.png (512x512)                          N
  resources/tray.png (32x32)                        N
  linux/wake-watch.sh, trilium-todo-wake.service    S
  src/shared/types.ts                               S
  src/main/todoDoc.ts, trilium.ts, sync.ts, wake.ts S
  src/main/index.ts                                 S*
  src/main/store.ts, syncService.ts, ipc.ts, tray.ts N
  src/main/linuxSetup.ts                            N
  src/preload/index.ts                              S*
  src/renderer/index.html, main.ts                  S*
  src/renderer/style.css                            N
  tests/*.test.ts, tests/fixtures/ckeditor49.html   S
  tests/integration/etapi.test.ts                   N
  docs/index.md, docs/manual/*.md                   S*
  docs/.vitepress/config.mts                        S
  README.md, CHANGELOG.md                           S*
  LICENSE, CONTRIBUTING.md, SECURITY.md             N
  package.json, package-lock.json, .nvmrc           S
  electron.vite.config.ts, electron-builder.yml     S
  tsconfig.json, eslint.config.mjs                  S
  .gitattributes, .gitignore, .prettierrc.json      S
  .prettierignore                                   S
```

### Commands (`package.json`)

| Command | What it does |
| --- | --- |
| `npm ci` | Installs the locked dependencies |
| `npm run dev` | Starts the app with live reload |
| `npm run lint`, `npm run format` | Checks or fixes style |
| `npm run typecheck`, `npm test`, `npm run build` | Checks types, runs tests, compiles |
| `npm run dist:win`, `npm run dist:linux` | Builds binaries into `dist/`; run each on its own OS |
| `npm run docs:dev`, `npm run docs:build` | Previews or builds the manual |

### Settings you must keep

- **No `"type": "module"` in `package.json`.** The build then uses CommonJS, which a sandboxed preload script needs.
- **`.gitattributes` forces LF line endings.** This avoids Prettier failures on Windows and broken shell scripts.
- **`desktopName` and `syncDesktopName`** let Linux desktops match the window to its launcher.
- **`--publish never`** stops electron-builder from publishing on its own. Only the release job creates releases.

### `electron-builder.yml`

```yaml
appId: io.github.OWNER.trilium-todo-popup
productName: Trilium Todo Popup
directories:
  output: dist
files:
  - out/**
  - package.json
extraResources:
  - from: linux
    to: linux
publish: null
win:
  target:
    - target: nsis
      arch: [x64]
  artifactName: trilium-todo-popup-${version}-windows-${arch}-setup.${ext}
nsis:
  oneClick: true
  perMachine: false
linux:
  target:
    - target: AppImage
      arch: [x64]
    - target: deb
      arch: [x64]
  category: Utility
  executableName: trilium-todo-popup
  syncDesktopName: true
  executableArgs:
    - --ozone-platform=x11
  artifactName: trilium-todo-popup-${version}-linux-${arch}.${ext}
deb:
  depends:
    - libgtk-3-0
    - libnotify4
    - libnss3
    - libxss1
    - libxtst6
    - xdg-utils
    - libatspi2.0-0
    - libuuid1
    - libsecret-1-0
    - libglib2.0-bin  # provides gdbus
```

When you add the tray icon, also list `resources/tray.png` under `extraResources`. Windows gets an installer only: a portable `.exe` would complicate autostart.

## Application specification

The main process owns the network, files and token. The sandboxed window only displays data and sends actions.

| Module (`src/main`) | Responsibility |
| --- | --- |
| `todoDoc.ts` | Reads and changes the note HTML (pure functions) |
| `trilium.ts` | ETAPI client |
| `sync.ts` | Action queue and safe save |
| `wake.ts` | Merges triggers and detects timer gaps |
| `store.ts` | Settings, token and saved state |
| `syncService.ts` | Decides when to sync, retries and reports status |
| `ipc.ts`, `tray.ts`, `linuxSetup.ts` | Window messages, tray menu, Linux autostart and wake service |
| `index.ts` | App lifecycle and window |

### Data types (`shared/types.ts`)

```ts
interface TodoItem {
  id: string; text: string; done: boolean;
  state?: string;            // data-trilium-task-state
  children: TodoItem[];
}
type Op =
  | { type: 'add'; id: string; text: string }
  | { type: 'setDone'; id: string; done: boolean }
  | { type: 'move'; id: string; beforeId: string | null };

// to be added with the UI
interface ViewModel {
  items: TodoItem[];
  status:
    | { kind: 'synced'; at: string }
    | { kind: 'offline'; pending: number }
    | { kind: 'setup' | 'auth-error' }
    | { kind: 'error'; message: string };
  notice?: string;
}
```

### Settings and state (`store.ts`)

Both files live in `app.getPath('userData')`. Check the real path on each OS.

| File | Content |
| --- | --- |
| `config.json` | `version`, `serverUrl`, `noteId`, `tokenEncrypted` (base64) |
| `state.json` | `version`, `cacheHtml`, `queue`, `lastRevisionDay` |

- Write to a temporary file, then rename it over the original. On Linux, use file mode `0600`.
- If a file is damaged, rename it to `*.bad` and show a notice. Never silently drop queued actions.
- Before changing the server or note, require an empty queue or ask to discard it. Then clear the state and create a new sync engine.
- Encrypt the token with `safeStorage.encryptStringAsync`. Decrypt with `decryptStringAsync`, which returns `result` and `shouldReEncrypt`; save it again if the latter is true. The older synchronous calls are [deprecated and due for removal in Electron 46](https://raw.githubusercontent.com/electron/electron/v45.5.0/docs/api/safe-storage.md).
- On Linux, warn in Settings if `getSelectedStorageBackend()` returns `basic_text`. The docs describe this check for the old API, so also test without a keyring.

### Trilium client (`trilium.ts`)

The base path is `<server>/etapi/notes/<noteId>`, with the header `Authorization: <token>`. These calls follow the [API spec](https://raw.githubusercontent.com/TriliumNext/Trilium/main/apps/server/src/assets/etapi.openapi.yaml).

| Method | Request |
| --- | --- |
| `getBlobId` | `GET` on the base path; reject a protected note |
| `getContent` | `GET /content` |
| `putContent` | `PUT /content`, `Content-Type: text/plain` |
| `createRevision` | `POST /revision` |

Use a 10-second timeout and refuse redirects. On 401, pause syncing and open Settings. On 404, report that the note wasn't found. Retry network errors, 429 and 5xx responses. For other errors, show the message and wait for a manual retry.

### List rules (`todoDoc.ts`)

- Manage only the **first top-level** `ul.todo-list`. Leave all other content alone.
- Give items without an ID, or with a duplicate ID, a new one: `e` plus 32 hex characters. The first sync saves these IDs.
- **Add:** top level only, after the last open item, or first if none is open. Skip it if its ID already exists. Insert text as text, never as HTML. Create the list if it's missing.
- **Set done:** change only the checkbox. If the item has a custom task state, remove that state and its `title`.
- **Move:** only among siblings, with sub-items attached. A missing or `null` target means after the last open sibling.
- Skip actions on missing items, and moves to another level, and report them.
- If nothing changes, return the input unchanged.

### Sync (`sync.ts`, `syncService.ts`)

The screen shows the cached note with the queued actions applied. Each action is saved to disk before any network call. Only one sync runs at a time, with up to three attempts:

1. Read `blobId`, then the content.
2. Copy the queue, add missing IDs and apply the copied actions.
3. If the HTML differs: create a revision on the first save of the local day, check `blobId` again (restart if it changed), then save.
4. Remove only the copied actions from the queue, update the cache and report skipped actions.

Item IDs make replay safe: if a save's response is lost, an add isn't duplicated. A replayed tick or move can override a newer Trilium change. ETAPI documents no conditional save, so an edit made between the last check and the save can also be overwritten.

`syncService.ts` starts a sync 500 ms after an action, on wake, on **Sync now** and every 60 seconds while the window is visible. If actions remain after a run, it syncs again. On network errors it waits 1, 2, 5 and 10 seconds, then 30 seconds repeatedly, even when the window is hidden.

### Window and wake behaviour

- A single instance runs. Launching it again shows the existing window.
- Size 440 x 620, centred, with always-on-top level `screen-saver`. **Esc** or the close button hides it. Only **Quit** in the tray ends the app.
- Each trigger shows the cached list immediately, focuses the input and starts a sync.
- Merge triggers within 3 seconds. As a backup, a 30-second timer treats a gap of over 2 minutes as a wake.
- Without settings, show the setup screen.
- The tray menu has **Show**, **Sync now**, **Settings** and **Quit**.

### Window messages (`preload` as `window.todoApi`)

| Method | Result or effect |
| --- | --- |
| `getView()`, `refresh()` | Return a `ViewModel` |
| `dispatch(action)` | Adds, sets done or moves; the main process creates new IDs |
| `onView(callback)` | Pushes updates to the window |
| `getSettings()` | URL, note ID, `hasToken`, warnings; never the token |
| `testConnection(input)`, `saveSettings(input)` | Check or save the settings |
| `installWakeService()`, `hide()` | Linux setup; hide the window |

Validate every message in the main process: allow known action types, string IDs up to 100 characters and trimmed text of 1 to 500 characters.

### User interface

| Area | Behaviour |
| --- | --- |
| Input | Focused on opening; Enter adds |
| Open items | Note order, sub-items indented; checkbox or Space finishes |
| Reorder | Drag handle or Alt+Up / Alt+Down, among siblings only |
| Done | Collapsed group of done top-level items with their sub-items; untick to reopen. Done sub-items stay under open parents |
| Status line | Synced time, offline count or error, plus notices |
| Settings | Server URL, note ID, token, **Test connection**, Linux wake service button |

Use plain TypeScript and CSS with light and dark themes, keyboard access and visible focus. Set text with `textContent`.

### Security

Keep `sandbox` and context isolation on, Node integration off and the content security policy at `default-src 'self'`. Block new windows and page navigation. Require HTTPS, except for `localhost`. Never log the token or note content.

## Windows and Linux integration

Windows uses Electron's built-in events. Linux uses a systemd **user** service that needs no root access.

| Job | Windows | Linux |
| --- | --- | --- |
| Start at sign-in | `app.setLoginItemSettings`, only if `app.isPackaged`, argument `--wake` | XDG autostart file |
| Resume | `powerMonitor` `resume` | Wake service, plus `resume` where Electron fires it |
| Unlock | `powerMonitor` `unlock-screen` | Wake service |
| Backup | Timer gap | Timer gap |

[`setLoginItemSettings`](https://raw.githubusercontent.com/electron/electron/v45.5.0/docs/api/app.md) supports only Windows and macOS, and [`unlock-screen`](https://www.electronjs.org/docs/latest/api/power-monitor) is listed only for those two.

### Linux autostart

On first start of a packaged build, `linuxSetup.ts` writes `~/.config/autostart/trilium-todo-popup.desktop`. For an AppImage, take the path from the `APPIMAGE` environment variable. Keep the AppImage in a fixed location.

```ini
[Desktop Entry]
Type=Application
Name=Trilium Todo Popup
Exec="/usr/bin/trilium-todo-popup" --ozone-platform=x11 --wake
Terminal=false
```

### Wake service

The script watches `logind` for resume and the desktop screensaver for unlock. It then starts the app again with `--wake`; the running instance receives this and shows its window. A screen blank that uses the screensaver signal may trigger it too, even without a lock.

`linux/wake-watch.sh`:

```bash
#!/usr/bin/env bash
# Starts "<app> --wake" after resume from standby and after a screen unlock.
# Usage: wake-watch.sh /path/to/trilium-todo-popup
set -u

app=${1:?usage: wake-watch.sh /path/to/app}

monitors() {
  # System bus: logind announces suspend (true) and resume (false).
  stdbuf -oL gdbus monitor --system --dest org.freedesktop.login1 \
    --object-path /org/freedesktop/login1 &
  # Session bus: screen lock state (GNOME, and the freedesktop name used by KDE).
  stdbuf -oL gdbus monitor --session --dest org.gnome.ScreenSaver &
  stdbuf -oL gdbus monitor --session --dest org.freedesktop.ScreenSaver &
  # If any monitor dies, stop all of them so systemd restarts the service.
  wait -n
  # shellcheck disable=SC2046  # splitting the PID list is intended
  kill $(jobs -p) 2>/dev/null
}

monitors | while IFS= read -r line; do
  case $line in
    *'login1.Manager.PrepareForSleep (false,)'* | *'ScreenSaver.ActiveChanged (false,)'*)
      # A separate transient unit, so restarting this watcher never kills the app.
      systemd-run --user --quiet --collect -- "$app" --ozone-platform=x11 --wake
      ;;
  esac
done

exit 1
```

`linux/trilium-todo-wake.service` (the installer replaces the two `@...@` values):

```ini
[Unit]
Description=Trilium Todo Popup wake watcher
PartOf=graphical-session.target
After=graphical-session.target

[Service]
ExecStart="@SCRIPT@" "@APP@"
Restart=always
RestartSec=5

[Install]
WantedBy=graphical-session.target
```

The Settings button runs the same steps as these commands, shown for the deb package. With an AppImage, copy both files from the repository's `linux/` folder, and set `SRC` to that folder and `APP` to the AppImage path.

```bash
SRC="/opt/Trilium Todo Popup/resources/linux"
APP=/usr/bin/trilium-todo-popup
DEST="$HOME/.local/share/trilium-todo-popup"
mkdir -p "$DEST" "$HOME/.config/systemd/user"
install -m 755 "$SRC/wake-watch.sh" "$DEST/"
sed -e "s|@SCRIPT@|$DEST/wake-watch.sh|" -e "s|@APP@|$APP|" \
  "$SRC/trilium-todo-wake.service" > "$HOME/.config/systemd/user/trilium-todo-wake.service"
systemctl --user daemon-reload
systemctl --user enable --now trilium-todo-wake.service
```

Check it, then test a real lock and `systemctl suspend`:

```bash
systemctl --user status trilium-todo-wake
journalctl --user -u trilium-todo-wake -f
systemctl --user show-environment | grep -E 'DISPLAY|WAYLAND'
```

To remove it, run `systemctl --user disable --now trilium-todo-wake`, then delete the unit and script.

### Linux limits

- **Wayland:** Electron uses it by default, and it [restricts apps from taking focus or moving windows](https://electronjs.org/blog/tech-talk-wayland). Every launch therefore passes `--ozone-platform=x11` to run through XWayland. This should improve foreground behaviour, but test it on your desktop. Pass the flag on the command line in autostart, launcher and service.
- **Other desktops:** Sway, i3, Hyprland and others may not send the screensaver signal or activate `graphical-session.target`. Call `trilium-todo-popup --ozone-platform=x11 --wake` from their unlock or resume hook, and start the app from their startup configuration.
- **Tray:** GNOME usually needs an AppIndicator extension. Without it, launch the app again to show the window.
- **AppImage:** some distributions need the FUSE 2 library. Prefer the deb on Debian and Ubuntu.

## Implementation steps

Work in this order. Finish each step's check, on a branch with a green pull request, before starting the next.

### 1. Set up the machine

Install the toolchain above, then run `git config --global user.name` and `user.email` with your values.

**Done when:** `node -v` shows v24, and `git --version` and `gh --version` work.

### 2. Create the repository

Create an empty folder, unzip the starter files into it, including hidden files, and open a terminal there. Replace `OWNER` in `package.json` and `electron-builder.yml`, and set `author`. Search `trilium-todo-popup` if you change the name; it also appears in `base` in the VitePress config and in the Linux files and paths. Add a `LICENSE` file. `package.json` currently says MIT, so change it if you choose another license.

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
git init -b main
git update-index --add --chmod=+x linux/wake-watch.sh
git add .
git commit -m "Add project starter"
gh auth login
gh repo create trilium-todo-popup --public --source=. --push
```

Before you push, check that no token, server address or private note text is in the files.

**Done when:** the CI workflow passes on both Ubuntu and Windows.

### 3. Test against your Trilium

Use a **test note** first. Create a text note with a to-do list that has formatting, a link, a sub-item and every task state you use. Copy its note ID and create a token under Options → ETAPI. For a disposable server, run the command below with your Trilium version, then complete its setup at `http://localhost:8081`.

```bash
docker run -d --name trilium-test -p 127.0.0.1:8081:8080 \
  -v trilium-test:/home/node/trilium-data triliumnext/trilium:v0.107.0
```

Run these commands in Bash (Git Bash on Windows):

```bash
export SERVER=https://your-server NOTE_ID=yourNoteId
read -rs TOKEN
URL="$SERVER/etapi/notes/$NOTE_ID"
curl -fsS -H "Authorization: $TOKEN" "$URL"            # note blobId
curl -fsS -H "Authorization: $TOKEN" "$URL/content" -o todos.html
curl -fsS -X POST -H "Authorization: $TOKEN" "$URL/revision"
# change one item's text in todos.html
curl -fsS -X PUT -H "Authorization: $TOKEN" -H "Content-Type: text/plain" \
  --data-binary @todos.html "$URL/content"
curl -fsS -H "Authorization: $TOKEN" "$URL"            # blobId must differ
```

**Done when:** every item has `data-list-item-id`, IDs survive editing and reordering in Trilium, an open Trilium window shows the upload, and non-ASCII characters survive. Note how "Done" and each custom state appear. Save an anonymised copy under `tests/fixtures/`. Delete `todos.html`.

### 4. Complete the core

Add tests for your fixture. Cover custom states, moves to another level, three failed sync attempts and actions added during a save. If your HTML differs from the list rules, fix `todoDoc.ts` first.

**Done when:** `npm test` passes with your fixture.

### 5. Add settings and the sync service

Build `store.ts`, then `syncService.ts` and `ipc.ts`. Pass in the clock, timers and API so tests can replace them. Test atomic saves, damaged files, each error type and the retry delays.

**Done when:** a queued action survives an app restart and reaches the test note exactly once.

### 6. Build the window

Replace the starter renderer and preload. Build in this order: setup screen, list, add, finish, keyboard reorder, drag reorder, Done group and status line. Add `tray.ts` and the two icons.

**Done when:** `npm run dev` meets R2, R5, R6 and R8 against the test note.

### 7. Finish Windows

Wire up autostart and wake events, then run `npm run dist:win` and install the result from `dist/`.

**Done when:** all Windows rows in the manual test table pass with the installed app.

### 8. Finish Linux

Build `linuxSetup.ts` for autostart and wake service installation. Run `npm run dist:linux` and install with `sudo apt install ./dist/*.deb`.

**Done when:** all Linux rows pass on your desktop, including a lock of a few seconds.

### 9. Write the documentation

Complete the README, manual and repository files described below. Follow the installation pages on a clean user account or VM.

**Done when:** `npm run docs:build` passes and no page says "To be written".

### 10. Release

Set up GitHub and follow the release steps below. Then switch the app from the test note to your real todo note.

**Done when:** both operating systems run the downloaded release binaries.

## Testing

CI runs the unit tests. Wake behaviour needs manual tests on real machines.

| Level | Covers | Where |
| --- | --- | --- |
| Unit, in the starter (11 tests) | List rules with real editor output, retry after a lost response, change during sync, trigger merging | CI |
| Unit, to add | Storage, retry schedule, error types, input validation, your fixture | CI |
| Integration, to add | All four ETAPI calls against a real note | Manual at first |
| Manual | Window, wake, installers | Real Windows and Linux PCs |

`tests/integration/etapi.test.ts` reads `TRILIUM_URL`, `TRILIUM_TOKEN` and `TRILIUM_NOTE_ID`, and skips itself if any is missing. It changes the note, so point it only at a test note. You can add it to CI later, once setup of a disposable Trilium server is scripted.

### Manual test table

Run it for each release and record the OS version and desktop.

| Test | OS | Expected |
| --- | --- | --- |
| Restart and sign in | Both | One window with the current list |
| Lock for 5 seconds, then unlock | Both | Window on top |
| Standby with and without lock on wake | Both | Window appears after wake |
| Standby overnight, including Modern Standby if supported | Windows | Window appears after wake |
| Wake while YouTube is full screen | Both | Window is visible over it |
| Stop the wake watcher process | Linux | Service restarts within seconds |
| Wake before Wi-Fi connects | Both | Cache first, then fresh data |
| Change items offline, then reconnect | Both | No lost or duplicate items |
| Edit in Trilium with app changes pending | Both | Both changes remain |
| Reorder formatted and nested items | Both | Content stays intact |
| Wrong token; protected note | Both | Clear message, nothing written |
| Upgrade over the previous version | Both | Settings and queue remain; autostart works |

On Windows, focus rules may leave the visible window without keyboard focus. Record this separately from whether it appears.

## GitHub CI and releases

Pull requests are tested on Windows and Linux, and a version tag builds a **draft release** that you test and publish. Publishing it also updates the manual website.

&#91;embedded content: release pipeline · tag to published release and manual\]

### Repository settings

1. **Pages:** set the source to **GitHub Actions**.
2. **Environments → `github-pages`:** under allowed branches and tags, add the tag rule `v*`, keeping `main`. Without it, the deployment from a release tag can be rejected. Create the environment if it doesn't exist.
3. **Actions:** set default workflow permissions to read-only. The workflows request what they need.
4. **Branch rules:** require pull requests and passing CI on `main`.
5. **Security:** turn on private vulnerability reporting, secret scanning and push protection.

The action tags below existed when checked on 26 November 2026. For stronger supply-chain security, pin each action to a commit SHA. Dependabot can then update the pins.

### `.github/workflows/ci.yml`

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  check:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build

  scripts-and-docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: shellcheck linux/*.sh
      - run: npm ci
      - run: npm run docs:build
```

### `.github/workflows/release.yml`

```yaml
name: Release

on:
  push:
    tags: ['v*.*.*']

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm
      - name: Tag must match package.json
        run: test "v$(node -p "require('./package.json').version")" = "$GITHUB_REF_NAME"
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test

  build:
    needs: verify
    strategy:
      matrix:
        include:
          - os: windows-latest
            script: dist:win
          - os: ubuntu-latest
            script: dist:linux
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run ${{ matrix.script }}
      - uses: actions/upload-artifact@v7
        with:
          name: bin-${{ matrix.os }}
          if-no-files-found: error
          path: |
            dist/*.exe
            dist/*.AppImage
            dist/*.deb

  release:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      contents: write
      id-token: write
      attestations: write
      artifact-metadata: write
    steps:
      - uses: actions/checkout@v7
      - uses: actions/download-artifact@v8
        with:
          path: release
          pattern: bin-*
          merge-multiple: true
      - name: Bundle the manual that matches this version
        run: zip -r "release/manual-${GITHUB_REF_NAME}.zip" README.md CHANGELOG.md LICENSE docs/index.md docs/manual
      - name: Checksums
        run: cd release && sha256sum -- * > SHA256SUMS.txt
      - uses: actions/attest@v4
        with:
          subject-path: release/*
      - name: Create draft release
        env:
          GH_TOKEN: ${{ github.token }}
        run: gh release create "$GITHUB_REF_NAME" release/* --draft --generate-notes --verify-tag --title "$GITHUB_REF_NAME"
```

### `.github/workflows/docs.yml`

```yaml
name: Docs

on:
  release:
    types: [published]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run docs:build
      - uses: actions/configure-pages@v6
      - uses: actions/upload-pages-artifact@v5
        with:
          path: docs/.vitepress/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5
```

### `.github/dependabot.yml`

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    ignore:
      # typescript-eslint does not support these yet
      - dependency-name: typescript
        versions: ['>=6.1.0']
      # keep Node types on the major version Electron bundles
      - dependency-name: '@types/node'
        update-types: ['version-update:semver-major']
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
```

### Release steps

1. On a branch, run `npm version patch --no-git-tag-version` (or `minor`). Skip this for the first release, which is already 0.1.0.
2. Update `CHANGELOG.md` and the manual, then merge a green pull request.
3. Tag the merged commit, using the matching version:

   ```bash
   git switch main
   git pull
   git tag -a v0.1.0 -m "v0.1.0"
   git push origin v0.1.0
   gh run watch
   ```
4. Download the draft's binaries, install them and run the manual test table.
5. Edit the release notes, then publish the draft yourself in GitHub.
6. Check the Docs workflow and website.

If a published version is broken, release a new patch instead of replacing its files.

**Download verification:** compare checksums with `SHA256SUMS.txt` (`Get-FileHash <file>` on Windows, `sha256sum -c SHA256SUMS.txt --ignore-missing` on Linux). To check which repository built a file, run `gh attestation verify <file> --repo OWNER/trilium-todo-popup`.

**Windows signing:** these builds are unsigned, so expect a SmartScreen warning. Checksums and attestations don't remove it. Microsoft notes that [SignPath Foundation offers free signing](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options) to qualifying open-source projects. Check its [conditions](https://signpath.org/terms) and apply after the project is public.

## README, manuals and repository files

Manual pages are Markdown in `docs/`, so they work on GitHub and on the VitePress website. Each release includes the README and manual as a zip, so users get the instructions for their version.

### README outline

1. What it does, in two sentences, plus a screenshot with made-up todos.
2. A note that it's unofficial and not affiliated with the Trilium project.
3. Features, supported systems and the tested Trilium version.
4. Download link and short Windows and Linux installation steps, including the SmartScreen warning.
5. Quick setup: note, token and note ID.
6. Links to the manual website, development page and contribution guide.
7. Privacy and security: where data is stored and what the app connects to. Verify this before claiming it.
8. License.

### Manual pages (`docs/manual/`)

| Page | Must cover |
| --- | --- |
| `install.md` | Installation, download checks, updates, uninstall including autostart and wake service |
| `trilium-setup.md` | Creating the note, token, note ID, HTTPS, testing the connection |
| `usage.md` | Mouse and keyboard, window triggers, offline use, cleaning done items in Trilium |
| `linux.md` | Wake service, logs, Wayland, tray, secret store, other window managers |
| `troubleshooting.md` | Each error message, missing window, restoring a revision, reporting bugs without secrets |
| `development.md` | Toolchain, commands, architecture, tests, release steps |

Export this specification as Markdown to `docs/SPEC.md` if you want it in the repository. Remove private links first.

### Other repository files

| File | Content |
| --- | --- |
| `LICENSE` | Your chosen license; MIT is a common permissive choice |
| `CONTRIBUTING.md` | Setup, checks and pull request rules |
| `SECURITY.md` | How to report a vulnerability privately; supported versions |
| `CHANGELOG.md` | User-visible changes for each version |
| `pull_request_template.md` | Checks for tests, manual, changelog and secrets |
| Bug report template | OS, desktop, app and Trilium versions, steps; warn against posting tokens |

### Keeping documentation current

- A pull request that changes behaviour updates the manual and changelog too.
- CI builds the website on every pull request, catching broken internal page links. It doesn't check external links or whether the text is correct.
- The release checklist includes following the installation page with the draft binaries.
- The website updates on publication. Running the Docs workflow manually publishes the selected branch, which may include unreleased changes.

## Verification status and open decisions

The starter's build setup and core logic work in a Linux test environment. **It hasn't run against a live Trilium server, on Windows or on GitHub.**

| Tested on 26 November 2026 | How far |
| --- | --- |
| Dependencies, lint, types, 11 tests, app and manual builds | Passed on Linux with Node 24.22.3 |
| Linux packaging | AppImage and deb built on Node 22; not installed |
| App start | Unpacked starter stayed running briefly on a virtual display, with its sandbox disabled for the test environment |
| Wake script | ShellCheck passed; trigger handling tested with simulated `gdbus` and `systemd-run` |
| Workflows | Passed `actionlint`; never run on GitHub |
| Editor format | CKEditor 49.0.1 with basic plugins in a simulated browser, not inside Trilium |

**Not tested:** ETAPI calls on a server (my local server test was blocked by the session's permissions), real suspend or lock signals, the systemd unit under a running user manager, token storage, installers and any Windows behaviour. Storage, sync scheduling, settings, tray, Linux setup and the real UI aren't built yet.

**Known audit warnings:** the production dependencies had none. The full install reported 9 (8 moderate, 1 high) in development tools, including electron-builder's dependencies and the Vite and esbuild versions used by VitePress. Don't expose the docs development server to your network, and recheck with `npm audit` before releases.

### Decisions for you

| Question | Current assumption |
| --- | --- |
| Which Linux distribution and desktop do you use? | AppImage and deb; GNOME or KDE signals |
| Does your Trilium server use HTTPS? | Yes; plain HTTP is allowed only for `localhost` |
| Which Trilium version do you run? | 0.107.0 |
| Are the name and MIT license right? | `trilium-todo-popup`, MIT |
| Should closing the window take more effort, to resist distraction? | No; one Esc closes it |
