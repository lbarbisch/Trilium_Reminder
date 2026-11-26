export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  /** Value of data-trilium-task-state, if Trilium set one. */
  state?: string;
  children: TodoItem[];
}

export type Op =
  | { type: 'add'; id: string; text: string }
  | { type: 'setDone'; id: string; done: boolean }
  /** Move among siblings. beforeId null = end of the open items. */
  | { type: 'move'; id: string; beforeId: string | null };

/** What the window sends. The main process creates IDs for new items. */
export type Action =
  | { type: 'add'; text: string }
  | { type: 'setDone'; id: string; done: boolean }
  | { type: 'move'; id: string; beforeId: string | null };

export type Status =
  | { kind: 'synced'; at: string }
  | { kind: 'offline'; pending: number }
  | { kind: 'setup' | 'auth-error' }
  | { kind: 'error'; message: string };

export interface ViewModel {
  items: TodoItem[];
  status: Status;
  /** True while a sync is running. */
  syncing?: boolean;
  notice?: string;
}

export interface SettingsView {
  serverUrl: string;
  noteId: string;
  hasToken: boolean;
  warnings: string[];
  /** Number of changes that have not reached Trilium yet. */
  pending: number;
  /** True on Linux, where the wake service can be installed. */
  linux: boolean;
}

export interface SettingsInput {
  serverUrl: string;
  noteId: string;
  /** Empty means: keep the saved token. */
  token: string;
  /** Required when the server or note changes while changes are still queued. */
  discardQueue?: boolean;
}

export type Result =
  { ok: true; message: string } | { ok: false; message: string; code?: 'queue-not-empty' };

export interface TodoApi {
  getView(): Promise<ViewModel>;
  refresh(): Promise<ViewModel>;
  dispatch(action: Action): Promise<ViewModel>;
  dismissNotice(): Promise<ViewModel>;
  onView(callback: (view: ViewModel) => void): () => void;
  /** The main process asks the window to focus the input (on every trigger). */
  onFocusInput(callback: () => void): () => void;
  /** The main process asks the window to show Settings (tray menu, token rejected). */
  onOpenSettings(callback: () => void): () => void;
  getSettings(): Promise<SettingsView>;
  testConnection(input: SettingsInput): Promise<Result>;
  saveSettings(input: SettingsInput): Promise<Result>;
  installWakeService(): Promise<Result>;
  hide(): Promise<void>;
}
