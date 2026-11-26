import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import type { Action, Result, SettingsInput, SettingsView, ViewModel } from '../shared/types';

export const MAX_ID_LENGTH = 100;
export const MAX_TEXT_LENGTH = 500;

/** Main → window events. */
export const EVENTS = {
  view: 'todo:view',
  focusInput: 'todo:focus-input',
  openSettings: 'todo:open-settings',
} as const;

const isId = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= MAX_ID_LENGTH;

/** Returns a clean copy of a window action, or null if it is not allowed. */
export function validateAction(raw: unknown): Action | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  switch (o.type) {
    case 'add': {
      if (typeof o.text !== 'string') return null;
      // One line only: a line break would not survive as a list item.
      const text = o.text.replace(/\s+/g, ' ').trim();
      if (text.length < 1 || text.length > MAX_TEXT_LENGTH) return null;
      return { type: 'add', text };
    }
    case 'setDone':
      return isId(o.id) && typeof o.done === 'boolean'
        ? { type: 'setDone', id: o.id, done: o.done }
        : null;
    case 'move':
      return isId(o.id) && (o.beforeId === null || isId(o.beforeId))
        ? { type: 'move', id: o.id, beforeId: o.beforeId }
        : null;
    default:
      return null;
  }
}

/** Returns trimmed settings, or null if the shape or lengths are wrong. */
export function validateSettings(raw: unknown): SettingsInput | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.serverUrl !== 'string' || typeof o.noteId !== 'string') return null;
  if (typeof o.token !== 'string') return null;
  if (o.discardQueue !== undefined && typeof o.discardQueue !== 'boolean') return null;
  const serverUrl = o.serverUrl.trim().replace(/\/+$/, '');
  const noteId = o.noteId.trim();
  const token = o.token.trim();
  if (serverUrl.length > 2_000 || token.length > 1_000) return null;
  if (noteId.length > MAX_ID_LENGTH) return null;
  return { serverUrl, noteId, token, discardQueue: o.discardQueue === true };
}

/** What the IPC layer needs from the app. */
export interface Controller {
  isTrusted(event: IpcMainInvokeEvent): boolean;
  getView(): ViewModel;
  refresh(): Promise<ViewModel>;
  dispatch(action: Action): ViewModel;
  dismissNotice(): ViewModel;
  getSettings(): Promise<SettingsView>;
  testConnection(input: SettingsInput): Promise<Result>;
  saveSettings(input: SettingsInput): Promise<Result>;
  installWakeService(): Promise<Result>;
  hide(): void;
}

const invalid: Result = { ok: false, message: 'Invalid input.' };

export function registerIpc(ipcMain: IpcMain, c: Controller): void {
  const handle = (channel: string, fn: (arg: unknown) => unknown) =>
    ipcMain.handle(channel, (event, arg: unknown) => {
      if (!c.isTrusted(event)) throw new Error('Untrusted sender');
      return fn(arg);
    });

  handle('todo:get-view', () => c.getView());
  handle('todo:refresh', () => c.refresh());
  handle('todo:dispatch', (arg) => {
    const action = validateAction(arg);
    if (!action) throw new Error('Invalid action');
    return c.dispatch(action);
  });
  handle('todo:dismiss-notice', () => c.dismissNotice());
  handle('settings:get', () => c.getSettings());
  handle('settings:test', (arg) => {
    const input = validateSettings(arg);
    return input ? c.testConnection(input) : invalid;
  });
  handle('settings:save', (arg) => {
    const input = validateSettings(arg);
    return input ? c.saveSettings(input) : invalid;
  });
  handle('linux:install-wake-service', () => c.installWakeService());
  handle('window:hide', () => c.hide());
}
