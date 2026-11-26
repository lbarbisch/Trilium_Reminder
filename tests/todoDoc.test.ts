import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyOps, ensureIds, newItemId, parseTodos } from '../src/main/todoDoc';

const html = readFileSync(new URL('./fixtures/ckeditor49.html', import.meta.url), 'utf8');
const [invoice, dentist, blank] = parseTodos(html);

describe('todoDoc with real CKEditor 49 output', () => {
  it('reads items, done flags and sub-items', () => {
    expect(invoice.text).toBe('Send invoice to client');
    expect(invoice.children.map((c) => c.text)).toEqual(['Sub item']);
    expect(dentist.done).toBe(true);
    expect(blank.text).toBe('');
  });

  it('leaves untouched content byte for byte', () => {
    expect(ensureIds(html)).toBe(html);
    expect(applyOps(html, []).html).toBe(html);
    // A real change followed by its reverse must serialise back to the same input.
    const done = applyOps(html, [{ type: 'setDone', id: invoice.id, done: true }]).html;
    const undone = applyOps(done, [{ type: 'setDone', id: invoice.id, done: false }]).html;
    expect(undone).toBe(html);
  });

  it('moves an item with its formatting and sub-items', () => {
    const out = applyOps(html, [{ type: 'move', id: invoice.id, beforeId: blank.id }]).html;
    expect(parseTodos(out).map((i) => i.id)).toEqual([dentist.id, invoice.id, blank.id]);
    expect(out).toContain('<strong>invoice</strong>');
    expect(out).toContain('Sub item');
  });

  it('adds once, escapes text, and places it after the last open item', () => {
    const op = { type: 'add', id: newItemId(), text: '<img src=x> & milk' } as const;
    const once = applyOps(html, [op]).html;
    expect(applyOps(once, [op]).html).toBe(once);
    expect(once).not.toContain('<img');
    expect(parseTodos(once).at(-1)?.text).toBe('<img src=x> & milk');
  });

  it('creates the list in an empty note and keeps other content', () => {
    const out = applyOps('<p>Intro</p>', [{ type: 'add', id: newItemId(), text: 'A' }]).html;
    expect(out.startsWith('<p>Intro</p><ul class="todo-list">')).toBe(true);
  });

  it('assigns missing or duplicate IDs', () => {
    const li =
      '<li><label class="todo-list__label"><input type="checkbox" disabled="disabled">' +
      '<span class="todo-list__label__description">A</span></label></li>';
    const ids = parseTodos(ensureIds(`<ul class="todo-list">${li}${li}</ul>`)).map((i) => i.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids.every((id) => /^e[0-9a-f]{32}$/.test(id))).toBe(true);
  });

  it('reports actions on items that no longer exist', () => {
    const op = { type: 'setDone', id: 'missing', done: true } as const;
    expect(applyOps(html, [op])).toEqual({ html, skipped: [op] });
  });

  it('clears a custom task state and its title when finishing', () => {
    const custom =
      '<ul class="todo-list"><li data-list-item-id="e1" data-trilium-task-state="in-progress" ' +
      'title="In progress"><label class="todo-list__label"><input type="checkbox" disabled="disabled">' +
      '<span class="todo-list__label__description">A</span></label></li></ul>';
    expect(parseTodos(custom)[0].state).toBe('in-progress');
    const out = applyOps(custom, [{ type: 'setDone', id: 'e1', done: true }]).html;
    expect(out).not.toContain('data-trilium-task-state');
    expect(out).not.toContain('title=');
    expect(parseTodos(out)[0]).toMatchObject({ done: true, state: undefined });
  });

  it('skips a move to another level and leaves the note unchanged', () => {
    const sub = invoice.children[0];
    const op = { type: 'move', id: sub.id, beforeId: dentist.id } as const;
    expect(applyOps(html, [op])).toEqual({ html, skipped: [op] });
  });

  it('moves to the end of the open items when beforeId is null', () => {
    const out = applyOps(html, [{ type: 'move', id: invoice.id, beforeId: null }]).html;
    // dentist is done, so the end of the open items is after the blank item
    expect(parseTodos(out).map((i) => i.id)).toEqual([dentist.id, blank.id, invoice.id]);
  });

  it('adds before done items, after the last open one', () => {
    const allDone = applyOps(html, [
      { type: 'setDone', id: invoice.id, done: true },
      { type: 'setDone', id: blank.id, done: true },
    ]).html;
    const id = newItemId();
    const out = applyOps(allDone, [{ type: 'add', id, text: 'New' }]).html;
    expect(parseTodos(out)[0].id).toBe(id);
  });

  it('only manages the first top-level list', () => {
    const second =
      '<ul class="todo-list"><li><label class="todo-list__label"><input type="checkbox" disabled="disabled">' +
      '<span class="todo-list__label__description">Other</span></label></li></ul>';
    const doc = html + '<p>Notes</p>' + second;
    expect(ensureIds(doc).endsWith('<p>Notes</p>' + second)).toBe(true);
    expect(parseTodos(doc)).toHaveLength(3);
  });
});
