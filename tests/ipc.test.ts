import { describe, expect, it } from 'vitest';
import { validateAction, validateSettings } from '../src/main/ipc';

describe('validateAction', () => {
  it('accepts known actions and trims text', () => {
    expect(validateAction({ type: 'add', text: '  Buy\n milk  ' })).toEqual({
      type: 'add',
      text: 'Buy milk',
    });
    expect(validateAction({ type: 'setDone', id: 'e1', done: true })).toEqual({
      type: 'setDone',
      id: 'e1',
      done: true,
    });
    expect(validateAction({ type: 'move', id: 'e1', beforeId: null })).toEqual({
      type: 'move',
      id: 'e1',
      beforeId: null,
    });
  });

  it('drops extra fields, so the window cannot choose IDs for new items', () => {
    expect(validateAction({ type: 'add', text: 'A', id: 'chosen' })).toEqual({
      type: 'add',
      text: 'A',
    });
  });

  it.each([
    null,
    'add',
    { type: 'delete', id: 'e1' },
    { type: 'add', text: '   ' },
    { type: 'add', text: 'x'.repeat(501) },
    { type: 'add', text: 5 },
    { type: 'setDone', id: 'e1', done: 'true' },
    { type: 'setDone', id: '', done: true },
    { type: 'setDone', id: 'x'.repeat(101), done: true },
    { type: 'move', id: 'e1' },
    { type: 'move', id: 'e1', beforeId: 7 },
  ])('rejects %j', (raw) => {
    expect(validateAction(raw)).toBeNull();
  });

  it('accepts text of exactly 500 characters', () => {
    expect(validateAction({ type: 'add', text: 'x'.repeat(500) })).not.toBeNull();
  });
});

describe('validateSettings', () => {
  it('trims values and the trailing slash', () => {
    expect(
      validateSettings({ serverUrl: ' https://t.example/ ', noteId: ' abc ', token: ' t ' }),
    ).toEqual({ serverUrl: 'https://t.example', noteId: 'abc', token: 't', discardQueue: false });
  });

  it('rejects wrong types', () => {
    expect(validateSettings({ serverUrl: 'x', noteId: 1, token: '' })).toBeNull();
    expect(
      validateSettings({ serverUrl: 'x', noteId: 'a', token: '', discardQueue: 1 }),
    ).toBeNull();
  });
});
