// Runs all four ETAPI calls against a real Trilium note. It CHANGES the note:
// point it only at a test note.
//
//   TRILIUM_URL=https://... TRILIUM_TOKEN=... TRILIUM_NOTE_ID=... npm test -- tests/integration
import { describe, expect, it } from 'vitest';
import { emptyState, SyncEngine } from '../../src/main/sync';
import { newItemId, parseTodos } from '../../src/main/todoDoc';
import { triliumNote } from '../../src/main/trilium';

const { TRILIUM_URL, TRILIUM_TOKEN, TRILIUM_NOTE_ID } = process.env;
const ready = !!(TRILIUM_URL && TRILIUM_TOKEN && TRILIUM_NOTE_ID);

describe.skipIf(!ready)('ETAPI against a real note', () => {
  const api = () => triliumNote(TRILIUM_URL!, TRILIUM_TOKEN!, TRILIUM_NOTE_ID!);

  it('reads, revises and writes the note, keeping other content', async () => {
    const note = api();
    const blobBefore = await note.getBlobId();
    const before = await note.getContent();
    await note.createRevision();

    const engine = new SyncEngine(note, emptyState(), () => {});
    const id = newItemId();
    const text = `Integration test ${new Date().toISOString()} – äöü ✓`;
    engine.enqueue({ type: 'add', id, text });
    expect(await engine.sync()).toEqual([]);

    const after = await note.getContent();
    expect(await note.getBlobId()).not.toBe(blobBefore);
    expect(parseTodos(after).find((i) => i.id === id)?.text).toBe(text);

    // Finish and reopen, then check the item is still there exactly once.
    engine.enqueue({ type: 'setDone', id, done: true });
    engine.enqueue({ type: 'setDone', id, done: false });
    await engine.sync();
    const items = parseTodos(await note.getContent()).filter((i) => i.id === id);
    expect(items).toHaveLength(1);
    expect(before.length).toBeLessThan(after.length);
  }, 60_000);
});
