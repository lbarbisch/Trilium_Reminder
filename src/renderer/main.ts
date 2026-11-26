import type {
  Action,
  Result,
  SettingsInput,
  Status,
  TodoApi,
  TodoItem,
  ViewModel,
} from '../shared/types';

declare global {
  interface Window {
    todoApi: TodoApi;
  }
}

const api = window.todoApi;

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as T;
}

const listView = $('list-view');
const settingsView = $('settings-view');
const addForm = $<HTMLFormElement>('add-form');
const newItem = $<HTMLInputElement>('new-item');
const openList = $<HTMLUListElement>('open-list');
const doneGroup = $<HTMLDetailsElement>('done-group');
const doneSummary = $('done-summary');
const doneList = $<HTMLUListElement>('done-list');
const empty = $('empty');
const statusLine = $('status');
const notice = $('notice');
const noticeText = $('notice-text');

const settingsForm = $<HTMLFormElement>('settings-form');
const serverUrl = $<HTMLInputElement>('server-url');
const noteId = $<HTMLInputElement>('note-id');
const tokenInput = $<HTMLInputElement>('token');
const settingsResult = $('settings-result');
const settingsWarnings = $<HTMLUListElement>('settings-warnings');
const discardBox = $('discard-box');
const discardText = $('discard-text');
const cancelSettings = $<HTMLButtonElement>('cancel-settings');

let view: ViewModel = { items: [], status: { kind: 'setup' } };
let screen: 'list' | 'settings' | 'none' = 'none';

/** Siblings of each item in note order, filled on every render. */
const siblingsOf = new Map<string, TodoItem[]>();
const itemById = new Map<string, TodoItem>();

// ---------------------------------------------------------------- moves

const openOnly = (items: TodoItem[]) => items.filter((i) => !i.done);

/** The beforeId that places an item directly after target. */
function beforeIdAfter(target: TodoItem, movingId: string): string | null {
  const siblings = siblingsOf.get(target.id) ?? [];
  const j = siblings.indexOf(target);
  const next = siblings.slice(j + 1).find((s) => s.id !== movingId);
  return next ? next.id : null;
}

function moveBy(id: string, delta: -1 | 1): void {
  const item = itemById.get(id);
  if (!item || item.done) return;
  const open = openOnly(siblingsOf.get(id) ?? []);
  const i = open.indexOf(item);
  const target = open[i + delta];
  if (!target) return;
  const beforeId = delta < 0 ? target.id : beforeIdAfter(target, id);
  void dispatch({ type: 'move', id, beforeId });
}

// ---------------------------------------------------------------- list rendering

function renderItem(item: TodoItem, siblings: TodoItem[]): HTMLLIElement {
  siblingsOf.set(item.id, siblings);
  itemById.set(item.id, item);

  const li = document.createElement('li');
  li.dataset.id = item.id;
  li.className = item.done ? 'item done' : 'item';

  const row = document.createElement('div');
  row.className = 'row';

  const handle = document.createElement('span');
  handle.className = 'handle';
  handle.textContent = '⋮⋮';
  handle.title = 'Drag to reorder (or Alt+Up / Alt+Down)';
  handle.setAttribute('aria-hidden', 'true');
  if (!item.done) handle.draggable = true;
  else handle.classList.add('hidden-handle');
  row.append(handle);

  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = item.done;
  box.className = 'check';
  box.id = `cb-${item.id}`;
  row.append(box);

  const label = document.createElement('label');
  label.htmlFor = box.id;
  label.className = item.text ? 'text' : 'text muted';
  label.textContent = item.text || '(empty item)';
  row.append(label);

  if (item.state && !item.done) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = item.state;
    badge.title = 'Task state set in Trilium';
    row.append(badge);
  }
  li.append(row);

  if (item.children.length > 0) {
    const ul = document.createElement('ul');
    ul.className = 'todo-tree';
    for (const child of item.children) ul.append(renderItem(child, item.children));
    li.append(ul);
  }
  return li;
}

function rememberFocus(): { id: string; inList: boolean } | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return null;
  const li = active.closest<HTMLElement>('li[data-id]');
  return li?.dataset.id ? { id: li.dataset.id, inList: true } : null;
}

function restoreFocus(saved: { id: string } | null): void {
  if (!saved) return;
  const box = document.getElementById(`cb-${saved.id}`);
  box?.focus();
}

function renderList(): void {
  const focus = rememberFocus();
  siblingsOf.clear();
  itemById.clear();

  const top = view.items;
  const open = top.filter((i) => !i.done);
  const done = top.filter((i) => i.done);

  openList.replaceChildren(...open.map((i) => renderItem(i, top)));
  doneList.replaceChildren(...done.map((i) => renderItem(i, top)));
  empty.hidden = open.length > 0;
  doneGroup.hidden = done.length === 0;
  doneSummary.textContent = `Done (${done.length})`;

  restoreFocus(focus);
}

function statusText(status: Status): string {
  switch (status.kind) {
    case 'synced':
      return `Synced at ${new Date(status.at).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })}.`;
    case 'offline':
      return status.pending > 0
        ? `Offline. ${status.pending} change${status.pending === 1 ? '' : 's'} waiting.`
        : 'Not connected. Showing the saved list.';
    case 'auth-error':
      return 'Trilium rejected the token. Check Settings.';
    case 'setup':
      return 'Not set up.';
    case 'error':
      return status.message;
  }
}

function renderStatus(): void {
  const s = view.status;
  statusLine.textContent = statusText(s) + (view.syncing ? ' Syncing…' : '');
  statusLine.className = s.kind === 'error' || s.kind === 'auth-error' ? 'error' : '';
  notice.hidden = !view.notice;
  noticeText.textContent = view.notice ?? '';
}

function render(): void {
  if (view.status.kind === 'setup' && screen !== 'settings') {
    void showSettings();
    return;
  }
  if (screen === 'none') showList();
  renderList();
  renderStatus();
}

function setView(v: ViewModel): void {
  view = v;
  render();
}

async function dispatch(action: Action): Promise<void> {
  try {
    setView(await api.dispatch(action));
  } catch {
    statusLine.textContent = 'That change was not accepted.';
    statusLine.className = 'error';
  }
}

// ---------------------------------------------------------------- list events

addForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = newItem.value.replace(/\s+/g, ' ').trim();
  if (!text) return;
  newItem.value = '';
  void dispatch({ type: 'add', text });
  newItem.focus();
});

document.addEventListener('change', (e) => {
  const box = e.target;
  if (!(box instanceof HTMLInputElement) || !box.classList.contains('check')) return;
  const id = box.closest<HTMLElement>('li[data-id]')?.dataset.id;
  if (id) void dispatch({ type: 'setDone', id, done: box.checked });
});

function focusableChecks(): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>('#list-view input.check')).filter(
    (el) => el.offsetParent !== null,
  );
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    void api.hide();
    return;
  }
  const target = e.target;
  if (!(target instanceof HTMLInputElement) || !target.classList.contains('check')) return;
  const id = target.closest<HTMLElement>('li[data-id]')?.dataset.id;
  if (!id) return;
  if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault();
    moveBy(id, e.key === 'ArrowUp' ? -1 : 1);
  } else if (!e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault();
    const all = focusableChecks();
    const i = all.indexOf(target);
    const next = all[i + (e.key === 'ArrowUp' ? -1 : 1)];
    if (next) next.focus();
    else if (e.key === 'ArrowUp') newItem.focus();
  }
});

newItem.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' && !e.altKey) {
    e.preventDefault();
    focusableChecks()[0]?.focus();
  }
});

// Drag and drop among siblings, by the handle.
let dragId: string | null = null;
let dropMark: { li: HTMLElement; after: boolean } | null = null;

function clearDropMark(): void {
  dropMark?.li.classList.remove('drop-before', 'drop-after');
  dropMark = null;
}

/** The nearest open sibling of the dragged item under the pointer. */
function dropTarget(el: EventTarget | null): HTMLElement | null {
  if (!dragId || !(el instanceof Element)) return null;
  const siblings = siblingsOf.get(dragId);
  let li = el.closest<HTMLElement>('li[data-id]');
  while (li) {
    const item = itemById.get(li.dataset.id ?? '');
    if (item && siblingsOf.get(item.id) === siblings) {
      return item.done || item.id === dragId ? null : li;
    }
    li = li.parentElement?.closest<HTMLElement>('li[data-id]') ?? null;
  }
  return null;
}

document.addEventListener('dragstart', (e) => {
  const handle = e.target;
  if (!(handle instanceof HTMLElement) || !handle.classList.contains('handle')) return;
  const li = handle.closest<HTMLElement>('li[data-id]');
  if (!li?.dataset.id || !e.dataTransfer) return;
  dragId = li.dataset.id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragId);
  e.dataTransfer.setDragImage(li, 12, 12);
  li.classList.add('dragging');
});

document.addEventListener('dragover', (e) => {
  const li = dropTarget(e.target);
  if (!li) {
    clearDropMark();
    return;
  }
  e.preventDefault();
  const row = li.querySelector('.row') ?? li;
  const rect = row.getBoundingClientRect();
  const after = e.clientY > rect.top + rect.height / 2;
  if (dropMark?.li !== li || dropMark.after !== after) {
    clearDropMark();
    li.classList.add(after ? 'drop-after' : 'drop-before');
    dropMark = { li, after };
  }
});

document.addEventListener('drop', (e) => {
  e.preventDefault();
  const mark = dropMark;
  const id = dragId;
  clearDropMark();
  if (!mark || !id) return;
  const target = itemById.get(mark.li.dataset.id ?? '');
  if (!target) return;
  const beforeId = mark.after ? beforeIdAfter(target, id) : target.id;
  void dispatch({ type: 'move', id, beforeId });
});

document.addEventListener('dragend', () => {
  clearDropMark();
  document.querySelector('.dragging')?.classList.remove('dragging');
  dragId = null;
});

$('sync-now').addEventListener('click', async () => {
  statusLine.textContent = 'Syncing…';
  setView(await api.refresh());
});
$('open-settings').addEventListener('click', () => void showSettings());
$('dismiss-notice').addEventListener('click', async () => setView(await api.dismissNotice()));

// ---------------------------------------------------------------- screens

function showList(): void {
  screen = 'list';
  settingsView.hidden = true;
  listView.hidden = false;
  newItem.focus();
}

function showResult(el: HTMLElement, result: Result | { ok: boolean; message: string }): void {
  el.textContent = result.message;
  el.className = result.ok ? 'ok' : 'error';
}

async function showSettings(): Promise<void> {
  screen = 'settings';
  const setup = view.status.kind === 'setup';
  listView.hidden = true;
  settingsView.hidden = false;
  $('settings-title').textContent = setup ? 'Connect to Trilium' : 'Settings';
  $('setup-intro').hidden = !setup;
  cancelSettings.hidden = setup;
  settingsResult.textContent = '';
  discardBox.hidden = true;
  $('wake-result').textContent = '';

  const s = await api.getSettings();
  serverUrl.value = s.serverUrl;
  noteId.value = s.noteId;
  tokenInput.value = '';
  tokenInput.placeholder = s.hasToken ? 'Saved. Leave empty to keep it.' : '';
  tokenInput.required = !s.hasToken;
  settingsWarnings.replaceChildren(
    ...s.warnings.map((w) => {
      const li = document.createElement('li');
      li.textContent = w;
      return li;
    }),
  );
  settingsWarnings.hidden = s.warnings.length === 0;
  $('linux-section').hidden = !s.linux;
  (s.serverUrl ? (s.hasToken ? noteId : tokenInput) : serverUrl).focus();
}

function settingsInput(discardQueue = false): SettingsInput {
  return {
    serverUrl: serverUrl.value,
    noteId: noteId.value,
    token: tokenInput.value,
    discardQueue,
  };
}

async function save(discardQueue: boolean): Promise<void> {
  settingsResult.textContent = 'Saving…';
  settingsResult.className = '';
  const result = await api.saveSettings(settingsInput(discardQueue));
  if (!result.ok && result.code === 'queue-not-empty') {
    settingsResult.textContent = '';
    discardText.textContent = result.message;
    discardBox.hidden = false;
    return;
  }
  showResult(settingsResult, result);
  if (result.ok) {
    discardBox.hidden = true;
    setView(await api.getView());
    showList();
  }
}

settingsForm.addEventListener('submit', (e) => {
  e.preventDefault();
  void save(false);
});
$('discard-save').addEventListener('click', () => void save(true));
$('test-connection').addEventListener('click', async () => {
  settingsResult.textContent = 'Testing…';
  settingsResult.className = '';
  showResult(settingsResult, await api.testConnection(settingsInput()));
});
cancelSettings.addEventListener('click', () => {
  showList();
  render();
});
$('install-wake').addEventListener('click', async () => {
  const out = $('wake-result');
  out.textContent = 'Installing…';
  out.className = '';
  showResult(out, await api.installWakeService());
});

// ---------------------------------------------------------------- start

api.onView(setView);
api.onFocusInput(() => {
  if (screen === 'list') newItem.focus();
});
api.onOpenSettings(() => void showSettings());
void api.getView().then(setView);

export {};
