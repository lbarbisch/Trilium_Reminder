import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyState, SyncEngine } from '../src/main/sync';
import { RETRY_DELAYS_MS, SyncService, systemClock } from '../src/main/syncService';
import { parseTodos } from '../src/main/todoDoc';
import { TriliumError, type NoteApi } from '../src/main/trilium';

/** A note whose calls can be made to fail. */
function fakeNote() {
  const note = {
    html: '',
    version: 0,
    calls: 0,
    fail: null as null | (() => Error),
    gate: Promise.resolve(),
  };
  const guard = () => {
    note.calls++;
    if (note.fail) throw note.fail();
  };
  const api: NoteApi = {
    getBlobId: async () => (guard(), String(note.version)),
    getContent: async () => {
      guard();
      await note.gate;
      return note.html;
    },
    putContent: async (html) => {
      guard();
      note.html = html;
      note.version++;
    },
    createRevision: async () => guard(),
  };
  return { note, api };
}

function setup() {
  const { note, api } = fakeNote();
  const engine = new SyncEngine(api, emptyState(), () => {});
  const events = { changes: 0, auth: 0 };
  const service = new SyncService(engine, {
    onChange: () => events.changes++,
    onAuthError: () => events.auth++,
    clock: systemClock,
  });
  const add = (id: string) => {
    engine.enqueue({ type: 'add', id, text: id });
    service.actionAdded();
  };
  return { note, engine, service, events, add };
}

const networkError = () => new TypeError('fetch failed');

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('SyncService', () => {
  it('waits 500 ms after an action and merges quick actions into one sync', async () => {
    const { note, add, service } = setup();
    add('e1');
    await vi.advanceTimersByTimeAsync(300);
    add('e2'); // joins the sync planned for 500 ms
    await vi.advanceTimersByTimeAsync(199);
    expect(note.calls).toBe(0);
    await vi.advanceTimersByTimeAsync(10);
    await service.idle();
    expect(parseTodos(note.html).map((i) => i.id)).toEqual(['e1', 'e2']);
    expect(service.status.kind).toBe('synced');
  });

  it('retries network errors after 1, 2, 5, 10 and then 30 seconds', async () => {
    const { note, add, service } = setup();
    note.fail = networkError;
    add('e1');
    await vi.advanceTimersByTimeAsync(500);
    expect(service.status).toEqual({ kind: 'offline', pending: 1 });

    const attemptsAfter = async (ms: number) => {
      const before = note.calls;
      await vi.advanceTimersByTimeAsync(ms);
      return note.calls - before;
    };
    for (const delay of [...RETRY_DELAYS_MS, 30_000]) {
      expect(await attemptsAfter(delay - 1)).toBe(0);
      expect(await attemptsAfter(1)).toBe(1);
    }

    note.fail = null;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(service.status.kind).toBe('synced');
    expect(parseTodos(note.html)).toHaveLength(1);
  });

  it('retries 429 and 5xx answers with an error status', async () => {
    const { note, add, service } = setup();
    note.fail = () => new TriliumError('Trilium answered 503', 503);
    add('e1');
    await vi.advanceTimersByTimeAsync(500);
    expect(service.status).toEqual({ kind: 'error', message: 'Trilium answered 503' });
    note.fail = null;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(service.status.kind).toBe('synced');
  });

  it('pauses after 401 until "Sync now"', async () => {
    const { note, add, service, events } = setup();
    note.fail = () => new TriliumError('Trilium answered 401', 401);
    add('e1');
    await vi.advanceTimersByTimeAsync(500);
    expect(service.status.kind).toBe('auth-error');
    expect(events.auth).toBe(1);

    const calls = note.calls;
    add('e2');
    service.wake();
    service.setVisible(true);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(note.calls).toBe(calls);

    note.fail = null;
    await service.syncNow();
    expect(service.status.kind).toBe('synced');
    expect(parseTodos(note.html)).toHaveLength(2);
    service.stop();
  });

  it('reports a missing note and waits for a manual retry', async () => {
    const { note, add, service } = setup();
    note.fail = () => new TriliumError('Trilium answered 404', 404);
    add('e1');
    await vi.advanceTimersByTimeAsync(500);
    expect(service.status).toEqual({
      kind: 'error',
      message: 'The note was not found. Check the note ID in Settings.',
    });
    const calls = note.calls;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(note.calls).toBe(calls);
  });

  it('does not retry other errors on its own', async () => {
    const { note, add, service } = setup();
    note.fail = () => new TriliumError('The todo note must not be protected', 0);
    add('e1');
    await vi.advanceTimersByTimeAsync(500);
    expect(service.status).toEqual({
      kind: 'error',
      message: 'The todo note must not be protected',
    });
    const calls = note.calls;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(note.calls).toBe(calls);
  });

  it('syncs every 60 seconds only while visible', async () => {
    const { note, service } = setup();
    service.setVisible(true);
    await vi.advanceTimersByTimeAsync(59_000);
    expect(note.calls).toBe(0);
    await vi.advanceTimersByTimeAsync(1_010);
    expect(note.calls).toBeGreaterThan(0);
    service.setVisible(false);
    const calls = note.calls;
    await vi.advanceTimersByTimeAsync(180_000);
    expect(note.calls).toBe(calls);
  });

  it('syncs again when actions were added during a sync', async () => {
    const { note, engine, service, add } = setup();
    let release!: () => void;
    note.gate = new Promise<void>((r) => (release = r));
    add('e1');
    await vi.advanceTimersByTimeAsync(500);
    add('e2'); // arrives while the first sync waits
    release();
    await vi.advanceTimersByTimeAsync(1_000);
    await service.idle();
    expect(parseTodos(note.html).map((i) => i.id)).toEqual(['e1', 'e2']);
    expect(engine.pending).toBe(0);
  });

  it('reports actions on deleted items in the notice', async () => {
    const { engine, service } = setup();
    engine.enqueue({ type: 'setDone', id: 'gone', done: true });
    await service.syncNow();
    expect(service.notice).toMatch(/^1 change was not applied/);
    expect(engine.pending).toBe(0);
  });
});
