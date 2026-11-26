import { describe, expect, it } from 'vitest';
import { emptyState, SyncConflictError, SyncEngine } from '../src/main/sync';
import { applyOps, parseTodos } from '../src/main/todoDoc';
import type { NoteApi } from '../src/main/trilium';

function fakeNote(initial = '') {
  const note = { html: initial, version: 0, puts: 0, loseResponse: false, onRevision: () => {} };
  const api: NoteApi = {
    getBlobId: async () => String(note.version),
    getContent: async () => note.html,
    putContent: async (html) => {
      note.html = html;
      note.version++;
      note.puts++;
      if (note.loseResponse) {
        note.loseResponse = false;
        throw new Error('connection reset');
      }
    },
    createRevision: async () => note.onRevision(),
  };
  return { note, api };
}
const add = (id: string, text: string) => ({ type: 'add', id, text }) as const;
const texts = (html: string) => parseTodos(html).map((i) => i.text);

describe('SyncEngine', () => {
  it('does not duplicate an item when the save response is lost', async () => {
    const { note, api } = fakeNote();
    const engine = new SyncEngine(api, emptyState(), () => {});
    engine.enqueue(add('e1', 'A'));
    note.loseResponse = true;
    await expect(engine.sync()).rejects.toThrow('connection reset');
    await engine.sync();
    expect(texts(note.html)).toEqual(['A']);
    expect(engine.state.queue).toEqual([]);
  });

  it('keeps a change made in Trilium while a sync is running', async () => {
    const { note, api } = fakeNote();
    const engine = new SyncEngine(api, emptyState(), () => {});
    engine.enqueue(add('e1', 'from app'));
    note.onRevision = () => {
      note.html = applyOps(note.html, [add('e2', 'from Trilium')]).html;
      note.version++;
      note.onRevision = () => {};
    };
    await engine.sync();
    expect(texts(note.html).sort()).toEqual(['from Trilium', 'from app']);
  });

  it('does not save when nothing changed', async () => {
    const { note, api } = fakeNote('<p>x</p>');
    await new SyncEngine(api, emptyState(), () => {}).sync();
    expect(note.puts).toBe(0);
  });

  it('gives up after three attempts when the note keeps changing', async () => {
    const { note, api } = fakeNote();
    const engine = new SyncEngine(api, emptyState(), () => {});
    engine.enqueue(add('e1', 'A'));
    let revisions = 0;
    note.onRevision = () => revisions++;
    // Every check of blobId sees a new version, as if someone kept typing in Trilium.
    api.getBlobId = async () => String(note.version++);
    await expect(engine.sync()).rejects.toBeInstanceOf(SyncConflictError);
    expect(note.puts).toBe(0);
    expect(engine.state.queue).toHaveLength(1);
    expect(revisions).toBe(1); // only the first save of the day creates a revision
  });

  it('keeps actions that were added while a save was running', async () => {
    const { note, api } = fakeNote();
    const engine = new SyncEngine(api, emptyState(), () => {});
    engine.enqueue(add('e1', 'A'));
    const put = api.putContent;
    api.putContent = async (html) => {
      engine.enqueue(add('e2', 'B'));
      await put(html);
    };
    await engine.sync();
    expect(texts(note.html)).toEqual(['A']);
    expect(engine.state.queue).toEqual([add('e2', 'B')]);
    expect(texts(engine.view())).toEqual(['A', 'B']);
  });

  it('saves the generated IDs on the first sync', async () => {
    const li =
      '<li><label class="todo-list__label"><input type="checkbox" disabled="disabled">' +
      '<span class="todo-list__label__description">A</span></label></li>';
    const { note, api } = fakeNote(`<ul class="todo-list">${li}</ul>`);
    await new SyncEngine(api, emptyState(), () => {}).sync();
    expect(note.puts).toBe(1);
    expect(parseTodos(note.html)[0].id).toMatch(/^e[0-9a-f]{32}$/);
  });
});
