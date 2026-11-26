import { join } from 'node:path';
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  powerMonitor,
  safeStorage,
  session,
  type IpcMainInvokeEvent,
  type Tray,
} from 'electron';
import type {
  Action,
  Op,
  Result,
  SettingsInput,
  SettingsView,
  TodoItem,
  ViewModel,
} from '../shared/types';
import { EVENTS, registerIpc } from './ipc';
import * as linux from './linuxSetup';
import { createLog } from './log';
import { Store, type Config } from './store';
import { SyncEngine, type SyncState } from './sync';
import { SyncService } from './syncService';
import { newItemId, parseTodos } from './todoDoc';
import { createTray } from './tray';
import { checkServerUrl, classifyError, triliumNote, type NoteApi } from './trilium';
import { debounce, watchForGaps } from './wake';

/** Registry value for the sign-in entry; build/installer.nsh removes it on uninstall. */
const LOGIN_ITEM_NAME = 'TriliumReminder';

const log = createLog(join(app.getPath('userData'), 'logs'));

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

let store: Store;
let config: Config | null = null;
let token: string | null = null;
let engine: SyncEngine;
let service: SyncService | null = null;

const notConfigured: NoteApi = {
  getBlobId: () => Promise.reject(new Error('Not set up')),
  getContent: () => Promise.reject(new Error('Not set up')),
  putContent: () => Promise.reject(new Error('Not set up')),
  createRevision: () => Promise.reject(new Error('Not set up')),
};

const configured = (): boolean => !!(config?.serverUrl && config.noteId && token);

// ---------------------------------------------------------------- view

function buildView(): ViewModel {
  const notices = [...store.notices];
  if (service?.notice) notices.push(service.notice);
  return {
    items: parseTodos(engine.view()),
    status: configured() && service ? service.status : { kind: 'setup' },
    syncing: service?.syncing ?? false,
    notice: notices.length > 0 ? notices.join(' ') : undefined,
  };
}

function pushView(): void {
  if (win && !win.isDestroyed()) win.webContents.send(EVENTS.view, buildView());
}

// ---------------------------------------------------------------- sync

/** Replaces the engine and service, for example after the settings changed. */
async function startEngine(state: SyncState): Promise<void> {
  const old = service;
  service = null;
  if (old) {
    old.stop();
    await old.idle(); // never let two syncs touch the note at once
  }
  const api =
    configured() && config && token
      ? triliumNote(config.serverUrl, token, config.noteId)
      : notConfigured;
  const e: SyncEngine = new SyncEngine(api, state, (s) => {
    if (engine === e) store.saveState(s);
  });
  engine = e;
  if (!configured()) return;
  service = new SyncService(engine, {
    onChange: pushView,
    onAuthError: () => {
      showWindow();
      win?.webContents.send(EVENTS.openSettings);
    },
    log,
  });
  service.setVisible(win?.isVisible() ?? false);
  service.wake();
}

// ---------------------------------------------------------------- settings

async function encryptionWarnings(): Promise<string[]> {
  const warnings: string[] = [];
  const available = await safeStorage.isAsyncEncryptionAvailable();
  if (!available) warnings.push('Secure token storage is not available on this system.');
  if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') {
    warnings.push(
      'No keyring was found, so the token is stored with weak protection. ' +
        'Install and unlock KWallet or GNOME Keyring, then save the token again.',
    );
  }
  return warnings;
}

function countItems(items: TodoItem[]): number {
  return items.reduce((n, i) => n + 1 + countItems(i.children), 0);
}

/** The token to use for input: the typed one, or the saved one for the same server only. */
function tokenFor(input: SettingsInput): string | null {
  if (input.token) return input.token;
  if (token && config && config.serverUrl === input.serverUrl) return token;
  return null;
}

function checkInput(input: SettingsInput): string | null {
  const urlError = checkServerUrl(input.serverUrl);
  if (urlError) return urlError;
  if (!input.noteId) return 'Enter the note ID.';
  if (!/^[A-Za-z0-9_]+$/.test(input.noteId)) return 'A note ID has only letters, digits and _.';
  if (!tokenFor(input)) return 'Enter the ETAPI token.';
  return null;
}

async function testConnection(input: SettingsInput): Promise<Result> {
  const error = checkInput(input);
  if (error) return { ok: false, message: error };
  const api = triliumNote(input.serverUrl, tokenFor(input)!, input.noteId);
  try {
    await api.getBlobId();
    const n = countItems(parseTodos(await api.getContent()));
    return {
      ok: true,
      message:
        n > 0
          ? `Connected. The note has ${n} to-do item${n === 1 ? '' : 's'}.`
          : 'Connected. The note has no to-do list yet. One is created when you add an item.',
    };
  } catch (err) {
    const { kind, message } = classifyError(err);
    log(`connection test failed (${kind})`);
    if (kind === 'auth') return { ok: false, message: 'Trilium rejected the token.' };
    if (kind === 'not-found') return { ok: false, message: 'There is no note with this ID.' };
    if (kind === 'offline') {
      return { ok: false, message: 'Trilium is not reachable at this address.' };
    }
    return { ok: false, message };
  }
}

async function saveSettings(input: SettingsInput): Promise<Result> {
  const error = checkInput(input);
  if (error) return { ok: false, message: error };
  const changedTarget =
    !config || config.serverUrl !== input.serverUrl || config.noteId !== input.noteId;
  const pending = engine.pending;
  if (changedTarget && pending > 0 && !input.discardQueue) {
    return {
      ok: false,
      code: 'queue-not-empty',
      message:
        `${pending} change${pending === 1 ? ' has' : 's have'} not reached Trilium yet. ` +
        'Saving another server or note discards them.',
    };
  }
  let tokenEncrypted = config?.tokenEncrypted ?? '';
  if (input.token) {
    if (!(await safeStorage.isAsyncEncryptionAvailable())) {
      return { ok: false, message: 'Secure token storage is not available on this system.' };
    }
    tokenEncrypted = await store.encryptToken(input.token);
  }
  token = tokenFor(input);
  config = { version: 1, serverUrl: input.serverUrl, noteId: input.noteId, tokenEncrypted };
  store.saveConfig(config);
  log(changedTarget ? 'settings saved for a new note' : 'settings saved');

  let state = engine.state;
  if (changedTarget) {
    if (pending > 0) log(`discarded ${pending} queued action(s)`);
    state = { cacheHtml: '', queue: [], lastRevisionDay: '' };
    store.saveState(state);
  }
  await startEngine(state);
  pushView();
  return { ok: true, message: 'Saved.' };
}

async function getSettings(): Promise<SettingsView> {
  return {
    serverUrl: config?.serverUrl ?? '',
    noteId: config?.noteId ?? '',
    hasToken: !!token,
    warnings: await encryptionWarnings(),
    pending: engine.pending,
    linux: process.platform === 'linux',
  };
}

async function installWakeService(): Promise<Result> {
  if (process.platform !== 'linux') return { ok: false, message: 'Only needed on Linux.' };
  if (!app.isPackaged) {
    return { ok: false, message: 'Only available in an installed build (deb or AppImage).' };
  }
  const result = await linux.installWakeService(
    { home: linux.defaultHome(), source: join(process.resourcesPath, 'linux') },
    linux.appExecutable(),
  );
  log(result.ok ? 'wake service installed' : 'wake service install failed');
  return result;
}

// ---------------------------------------------------------------- window

function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 440,
    height: 620,
    minWidth: 320,
    minHeight: 360,
    show: false,
    center: true,
    title: 'Trilium Reminder',
    backgroundColor: '#1e1f22',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  w.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    w.hide();
  });
  w.on('show', () => service?.setVisible(true));
  w.on('hide', () => service?.setVisible(false));
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void w.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void w.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return w;
}

function showWindow(): void {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.setAlwaysOnTop(true, 'screen-saver');
  if (!win.isVisible()) win.center();
  win.show();
  win.moveTop();
  win.focus();
  win.webContents.focus();
  win.webContents.send(EVENTS.focusInput);
}

/** Every trigger: show the cached list at once, focus the input and start a sync. */
const onTrigger = debounce(() => {
  log('trigger');
  pushView();
  showWindow();
  service?.wake();
});

function openSettings(): void {
  showWindow();
  win?.webContents.send(EVENTS.openSettings);
}

function hardenWebContents(): void {
  app.on('web-contents-created', (_e, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', (e) => e.preventDefault());
    contents.on('will-attach-webview', (e) => e.preventDefault());
  });
}

function setupAutostart(): void {
  if (!app.isPackaged) return; // a dev run must never land in autostart
  try {
    if (process.platform === 'win32') {
      app.setLoginItemSettings({ openAtLogin: true, args: ['--wake'], name: LOGIN_ITEM_NAME });
    } else if (process.platform === 'linux') {
      linux.ensureAutostart(linux.defaultHome(), app.getPath('userData'), linux.appExecutable());
    }
  } catch (err) {
    log(`autostart setup failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function start(): Promise<void> {
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));

  store = new Store(app.getPath('userData'), {
    encrypt: (s) => safeStorage.encryptStringAsync(s),
    decrypt: (b) => safeStorage.decryptStringAsync(b),
  });
  config = store.loadConfig();
  token = config ? await store.readToken(config) : null;
  await startEngine(store.loadState());

  win = createWindow();
  win.once('ready-to-show', () => onTrigger());

  const controller = {
    isTrusted: (event: IpcMainInvokeEvent) => !!win && event.sender === win.webContents,
    getView: buildView,
    refresh: async () => {
      await service?.syncNow();
      return buildView();
    },
    dispatch: (action: Action) => {
      if (!configured()) throw new Error('Set up the connection first');
      const op: Op = action.type === 'add' ? { ...action, id: newItemId() } : action;
      engine.enqueue(op);
      service?.actionAdded();
      return buildView();
    },
    dismissNotice: () => {
      store.notices.length = 0;
      if (service) service.notice = undefined;
      return buildView();
    },
    getSettings,
    testConnection,
    saveSettings,
    installWakeService,
    hide: () => win?.hide(),
  };
  registerIpc(ipcMain, controller);

  tray = createTray({
    show: showWindow,
    syncNow: () => void service?.syncNow(),
    settings: openSettings,
    quit: () => {
      quitting = true;
      app.quit();
    },
  });
  if (!tray) log('no tray available');

  powerMonitor.on('resume', onTrigger);
  if (process.platform === 'win32') powerMonitor.on('unlock-screen', onTrigger);
  watchForGaps(onTrigger);
  setupAutostart();
  log(`started ${app.getVersion()} on ${process.platform}`);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  hardenWebContents();
  app.on('second-instance', () => onTrigger());
  app.on('before-quit', () => {
    quitting = true;
    service?.stop();
  });
  // The window only hides, so this fires only during quit.
  app.on('window-all-closed', () => app.quit());
  void app.whenReady().then(start);
}
