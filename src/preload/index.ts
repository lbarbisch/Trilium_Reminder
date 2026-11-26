import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { TodoApi, ViewModel } from '../shared/types';

// Keep in sync with EVENTS in src/main/ipc.ts. The sandboxed preload cannot import main code.
const VIEW = 'todo:view';
const FOCUS_INPUT = 'todo:focus-input';
const OPEN_SETTINGS = 'todo:open-settings';

function listen<T extends unknown[]>(channel: string, fn: (...args: T) => void): () => void {
  const handler = (_e: IpcRendererEvent, ...args: unknown[]) => fn(...(args as T));
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: TodoApi = {
  getView: () => ipcRenderer.invoke('todo:get-view'),
  refresh: () => ipcRenderer.invoke('todo:refresh'),
  dispatch: (action) => ipcRenderer.invoke('todo:dispatch', action),
  dismissNotice: () => ipcRenderer.invoke('todo:dismiss-notice'),
  onView: (cb) => listen<[ViewModel]>(VIEW, (view) => cb(view)),
  onFocusInput: (cb) => listen(FOCUS_INPUT, () => cb()),
  onOpenSettings: (cb) => listen(OPEN_SETTINGS, () => cb()),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  testConnection: (input) => ipcRenderer.invoke('settings:test', input),
  saveSettings: (input) => ipcRenderer.invoke('settings:save', input),
  installWakeService: () => ipcRenderer.invoke('linux:install-wake-service'),
  hide: () => ipcRenderer.invoke('window:hide'),
};

contextBridge.exposeInMainWorld('todoApi', api);
